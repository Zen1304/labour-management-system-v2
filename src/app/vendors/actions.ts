'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { vendors } from '@/lib/db/schema';
import { requireActionCapability, ActionError } from '@/lib/auth/action-helpers';
import { logAudit } from '@/lib/audit';
import { nextVendorCode, vendorDependencyCounts } from '@/lib/entities/vendors';

export async function createVendorAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'admin.full');
    const name = String(formData.get('name') || '').trim();
    if (!name) throw new ActionError('Name is required.');
    const contact = String(formData.get('contact') || '').trim() || null;
    const whatsapp = String(formData.get('whatsapp') || '').trim() || null;
    const email = String(formData.get('email') || '').trim() || null;
    const address = String(formData.get('address') || '').trim() || null;

    const vendorCode = await nextVendorCode();
    const [row] = await db
      .insert(vendors)
      .values({ vendorCode, name, contact, whatsapp, email, address })
      .returning();
    await logAudit(user.id, 'create', 'vendor', row.id, `${vendorCode} ${name}`);
    revalidatePath('/vendors');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not save that vendor.';
    redirect('/vendors?error=' + encodeURIComponent(message));
  }
  redirect('/vendors');
}

export async function toggleVendorActiveAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'admin.full');
    const id = Number(formData.get('id'));
    const nextActive = formData.get('nextActive') === 'true';

    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));
    if (!vendor) throw new ActionError('Vendor not found.');
    if (vendor.isDirect) throw new ActionError('The Bilara Direct vendor cannot be deactivated.');

    if (!nextActive) {
      const deps = await vendorDependencyCounts(id);
      if (deps.activeWorkers > 0) {
        throw new ActionError(
          `Can't deactivate — ${deps.activeWorkers} active worker(s) are still assigned to this vendor. Reassign them first.`
        );
      }
    }

    await db.update(vendors).set({ active: nextActive }).where(eq(vendors.id, id));
    await logAudit(user.id, 'update', 'vendor', id, `${vendor.name} -> ${nextActive ? 'active' : 'inactive'}`);
    revalidatePath('/vendors');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not update that vendor.';
    redirect('/vendors?error=' + encodeURIComponent(message));
  }
  redirect('/vendors');
}

// Hard-delete, only when nothing references this vendor at all — same
// "deactivate instead" policy as the old app, just surfaced up front here
// instead of letting a DB FK-violation bubble up.
export async function deleteVendorAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'admin.full');
    const id = Number(formData.get('id'));

    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));
    if (!vendor) throw new ActionError('Vendor not found.');
    if (vendor.isDirect) throw new ActionError('The Bilara Direct vendor cannot be deleted.');

    const deps = await vendorDependencyCounts(id);
    if (deps.workers > 0 || deps.payrollItems > 0) {
      throw new ActionError(
        `Can't delete ${vendor.name} — it has ${deps.workers} worker(s) and/or payroll history attached. Deactivate it instead.`
      );
    }

    await db.delete(vendors).where(eq(vendors.id, id));
    await logAudit(user.id, 'delete', 'vendor', id, vendor.name);
    revalidatePath('/vendors');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not delete that vendor.';
    redirect('/vendors?error=' + encodeURIComponent(message));
  }
  redirect('/vendors');
}
