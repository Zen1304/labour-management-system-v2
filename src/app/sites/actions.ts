'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sites } from '@/lib/db/schema';
import { requireActionCapability, ActionError, pgErrorCode } from '@/lib/auth/action-helpers';
import { logAudit } from '@/lib/audit';
import { nextSiteId } from '@/lib/entities/sites';

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) || '').trim();
  return v || null;
}

export async function createSiteAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'admin.full');
    const name = str(formData, 'name');
    if (!name) throw new ActionError('Name is required.');
    const projectNumberRaw = str(formData, 'projectNumber');
    const projectNumber = projectNumberRaw ? Number(projectNumberRaw) : null;
    if (projectNumberRaw && !Number.isInteger(projectNumber)) {
      throw new ActionError('Project number must be a whole number.');
    }

    const id = await nextSiteId();
    const [row] = await db
      .insert(sites)
      .values({
        id,
        name,
        location: str(formData, 'location'),
        address: str(formData, 'address'),
        district: str(formData, 'district'),
        state: str(formData, 'state'),
        mapsLink: str(formData, 'mapsLink'),
        projectNumber,
        clientName: str(formData, 'clientName'),
      })
      .returning();
    await logAudit(user.id, 'create', 'site', row.id, name);
    revalidatePath('/sites');
  } catch (e) {
    const message =
      e instanceof ActionError
        ? e.message
        : pgErrorCode(e) === '23505'
          ? 'That project number is already in use by another site.'
          : 'Could not save that site.';
    redirect('/sites?error=' + encodeURIComponent(message));
  }
  redirect('/sites');
}

export async function updateSiteStatusAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'admin.full');
    const id = Number(formData.get('id'));
    const status = String(formData.get('status') || '');
    if (!['active', 'on_hold', 'completed'].includes(status)) {
      throw new ActionError('Invalid status.');
    }
    const [row] = await db
      .update(sites)
      .set({ status: status as 'active' | 'on_hold' | 'completed' })
      .where(eq(sites.id, id))
      .returning();
    if (row) await logAudit(user.id, 'update', 'site', id, `${row.name} -> ${status}`);
    revalidatePath('/sites');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not update that site.';
    redirect('/sites?error=' + encodeURIComponent(message));
  }
  redirect('/sites');
}
