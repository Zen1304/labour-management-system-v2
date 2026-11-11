'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { workerTypes } from '@/lib/db/schema';
import { requireActionCapability, ActionError } from '@/lib/auth/action-helpers';
import { logAudit } from '@/lib/audit';
import { redirect } from 'next/navigation';

export async function createWorkerTypeAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'admin.full');
    const name = String(formData.get('name') || '').trim();
    if (!name) throw new ActionError('Name is required.');

    const [row] = await db.insert(workerTypes).values({ name }).returning();
    await logAudit(user.id, 'create', 'worker_type', row.id, name);
    revalidatePath('/worker-types');
  } catch (e) {
    if (e instanceof ActionError) {
      redirect('/worker-types?error=' + encodeURIComponent(e.message));
    }
    // A unique-constraint violation on `name` surfaces here as a generic DB error.
    redirect('/worker-types?error=' + encodeURIComponent('That name is already in use, or the save failed.'));
  }
  redirect('/worker-types');
}

export async function toggleWorkerTypeActiveAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'admin.full');
    const id = Number(formData.get('id'));
    const nextActive = formData.get('nextActive') === 'true';
    const [row] = await db
      .update(workerTypes)
      .set({ active: nextActive })
      .where(eq(workerTypes.id, id))
      .returning();
    if (row) {
      await logAudit(user.id, 'update', 'worker_type', id, `${row.name} -> ${nextActive ? 'active' : 'inactive'}`);
    }
    revalidatePath('/worker-types');
  } catch (e) {
    if (e instanceof ActionError) {
      redirect('/worker-types?error=' + encodeURIComponent(e.message));
    }
    throw e;
  }
  redirect('/worker-types');
}
