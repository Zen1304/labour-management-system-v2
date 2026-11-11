'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, and, ne } from 'drizzle-orm';
import { db, pool } from '@/lib/db/client';
import { users, userSiteAssignments, sessions } from '@/lib/db/schema';
import { requireActionCapability, ActionError, pgErrorCode } from '@/lib/auth/action-helpers';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { ROLES, type Role, MULTI_SITE_ROLES } from '@/lib/auth/permissions';
import { EMAIL_RE, PHONE_RE, digitsOnly, superAdminGuardError } from '@/lib/entities/users';

function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}

async function setSiteAssignments(userId: number, siteIds: number[]) {
  await db.delete(userSiteAssignments).where(eq(userSiteAssignments.userId, userId));
  if (siteIds.length > 0) {
    await db.insert(userSiteAssignments).values(siteIds.map((siteId) => ({ userId, siteId })));
  }
}

export async function createUserAction(formData: FormData) {
  try {
    const actingUser = await requireActionCapability(formData, 'admin.full');
    const username = String(formData.get('username') || '').trim();
    if (!EMAIL_RE.test(username)) throw new ActionError('Username must be a valid email address.');
    const name = String(formData.get('name') || '').trim();
    if (!name) throw new ActionError('Name is required.');
    const contact = digitsOnly(String(formData.get('contact') || ''));
    if (!PHONE_RE.test(contact)) throw new ActionError('A phone number (at least 10 digits) is required.');
    const roleRaw = String(formData.get('role') || '');
    if (!isRole(roleRaw)) throw new ActionError('Select a valid role.');
    const saGuard = superAdminGuardError(actingUser.role, { submittedRole: roleRaw });
    if (saGuard) throw new ActionError(saGuard);
    const password = String(formData.get('password') || '');
    if (password.length < 8) throw new ActionError('Password must be at least 8 characters.');
    const mustChangePassword = formData.get('mustChangePassword') === '1';

    const { hash, salt } = hashPassword(password);
    const [row] = await db
      .insert(users)
      .values({ username, passwordHash: hash, salt, name, role: roleRaw, contact, mustChangePassword })
      .returning();

    if (MULTI_SITE_ROLES.includes(roleRaw)) {
      const siteIds = formData.getAll('siteIds').map(Number).filter(Boolean);
      await setSiteAssignments(row.id, siteIds);
    }

    await logAudit(actingUser.id, 'create', 'user', row.id, `${username} (role: ${roleRaw})`);
    revalidatePath('/users');
  } catch (e) {
    const message =
      e instanceof ActionError
        ? e.message
        : pgErrorCode(e) === '23505'
          ? 'A user with this username already exists.'
          : 'Could not save that user.';
    redirect('/users/new?error=' + encodeURIComponent(message));
  }
  redirect('/users');
}

export async function updateUserAction(formData: FormData) {
  const id = Number(formData.get('id'));
  try {
    const actingUser = await requireActionCapability(formData, 'admin.full');
    const [target] = await db.select().from(users).where(eq(users.id, id));
    if (!target) throw new ActionError('User not found.');

    const earlyGuard = superAdminGuardError(actingUser.role, { targetRole: target.role as Role });
    if (earlyGuard) throw new ActionError(earlyGuard);

    const username = String(formData.get('username') || '').trim();
    if (!EMAIL_RE.test(username)) throw new ActionError('Username must be a valid email address.');
    const name = String(formData.get('name') || '').trim();
    if (!name) throw new ActionError('Name is required.');
    const contact = digitsOnly(String(formData.get('contact') || ''));
    if (!PHONE_RE.test(contact)) throw new ActionError('A phone number (at least 10 digits) is required.');
    const roleRaw = String(formData.get('role') || '');
    if (!isRole(roleRaw)) throw new ActionError('Select a valid role.');
    const saGuard = superAdminGuardError(actingUser.role, { submittedRole: roleRaw });
    if (saGuard) throw new ActionError(saGuard);

    const [dupe] = await db.select().from(users).where(and(eq(users.username, username), ne(users.id, id)));
    if (dupe) throw new ActionError('A user with this username already exists.');

    const mustChangePassword = formData.get('mustChangePassword') === '1';
    const newPassword = String(formData.get('newPassword') || '').trim();

    const updates: Partial<typeof users.$inferInsert> = { username, name, role: roleRaw, contact, mustChangePassword };
    if (newPassword) {
      if (newPassword.length < 8) throw new ActionError('New password must be at least 8 characters.');
      const { hash, salt } = hashPassword(newPassword);
      updates.passwordHash = hash;
      updates.salt = salt;
    }

    await db.update(users).set(updates).where(eq(users.id, id));

    if (MULTI_SITE_ROLES.includes(roleRaw)) {
      const siteIds = formData.getAll('siteIds').map(Number).filter(Boolean);
      await setSiteAssignments(id, siteIds);
    } else {
      await setSiteAssignments(id, []);
    }

    await logAudit(actingUser.id, 'update', 'user', id, `${username} (role: ${roleRaw})`);
    revalidatePath('/users');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not save that user.';
    redirect(`/users/${id}/edit?error=` + encodeURIComponent(message));
  }
  redirect('/users');
}

export async function toggleUserActiveAction(formData: FormData) {
  try {
    const actingUser = await requireActionCapability(formData, 'admin.full');
    const id = Number(formData.get('id'));
    const nextActive = formData.get('nextActive') === 'true';
    const [target] = await db.select().from(users).where(eq(users.id, id));
    if (!target) throw new ActionError('User not found.');
    if (target.id === actingUser.id) throw new ActionError("You can't deactivate your own account.");

    const saGuard = superAdminGuardError(actingUser.role, { targetRole: target.role as Role });
    if (saGuard) throw new ActionError(saGuard);

    if (!nextActive) {
      if (target.role === 'admin') {
        const [{ c }] = await pool
          .query<{ c: string }>(
            `SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = true AND id != $1`,
            [id]
          )
          .then((r) => r.rows);
        if (Number(c) === 0) {
          throw new ActionError(
            'This is the last active admin account — deactivating it would lock everyone out. Make another user an active admin first.'
          );
        }
      }
      if (target.role === 'super_admin') {
        const [{ c }] = await pool
          .query<{ c: string }>(
            `SELECT COUNT(*) c FROM users WHERE role = 'super_admin' AND active = true AND id != $1`,
            [id]
          )
          .then((r) => r.rows);
        if (Number(c) === 0) {
          throw new ActionError(
            'This is the last active Super Admin account — deactivating it would leave nobody able to manage Super Admin accounts. Promote another user first.'
          );
        }
      }
    }

    await db.update(users).set({ active: nextActive }).where(eq(users.id, id));
    if (!nextActive) {
      // A deactivated user's live sessions must stop working immediately.
      await db.delete(sessions).where(eq(sessions.userId, id));
    }
    await logAudit(actingUser.id, 'update', 'user', id, `${target.username} -> ${nextActive ? 'active' : 'inactive'}`);
    revalidatePath('/users');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not update that user.';
    redirect('/users?error=' + encodeURIComponent(message));
  }
  redirect('/users');
}
