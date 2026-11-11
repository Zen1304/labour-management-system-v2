'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { workers } from '@/lib/db/schema';
import { requireActionCapability, ActionError } from '@/lib/auth/action-helpers';
import { logAudit } from '@/lib/audit';
import { nextWorkerCode, AADHAR_RE, PHONE_RE, digitsOnly, findWorkerByAadhar } from '@/lib/entities/workers';

const POOL_SITE_ID = 100;

export async function createWorkerAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'workers.manage');
    const name = String(formData.get('name') || '').trim();
    if (!name) throw new ActionError('Name is required.');

    const aadhar = String(formData.get('aadharNumber') || '').trim();
    if (!AADHAR_RE.test(aadhar)) throw new ActionError('Aadhar number must be exactly 12 digits.');
    if (await findWorkerByAadhar(aadhar)) {
      throw new ActionError('A worker with this Aadhar number already exists.');
    }

    const contact = digitsOnly(String(formData.get('contact') || ''));
    if (!PHONE_RE.test(contact)) throw new ActionError('A contact phone number (at least 10 digits) is required.');

    const wageRate = parseFloat(String(formData.get('wageRate') || ''));
    if (!(wageRate > 0)) throw new ActionError('Wage rate must be a positive number.');

    const vendorId = Number(formData.get('vendorId'));
    if (!vendorId) throw new ActionError('Vendor is required.');

    const workerTypeIdRaw = String(formData.get('workerTypeId') || '');
    const workerTypeId = workerTypeIdRaw ? Number(workerTypeIdRaw) : null;

    const overtimeMultiplier = parseFloat(String(formData.get('overtimeMultiplier') || '')) || 1.5;
    const joinedDate = String(formData.get('joinedDate') || '').trim() || new Date().toISOString().slice(0, 10);

    const workerCode = await nextWorkerCode();
    const [row] = await db
      .insert(workers)
      .values({
        workerCode,
        name,
        workerTypeId,
        vendorId,
        aadharNumber: aadhar,
        siteId: POOL_SITE_ID, // new workers always start in the Unassigned Pool
        wageRate,
        overtimeMultiplier,
        contact,
        status: 'active',
        verificationStatus: 'pending',
        joinedDate,
      })
      .returning();
    await logAudit(user.id, 'create', 'worker', row.id, `${workerCode} ${name}`);
    revalidatePath('/workers');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not save that worker.';
    redirect('/workers/new?error=' + encodeURIComponent(message));
  }
  redirect('/workers');
}

export async function updateWorkerAction(formData: FormData) {
  const id = Number(formData.get('id'));
  try {
    const user = await requireActionCapability(formData, 'workers.manage');
    const name = String(formData.get('name') || '').trim();
    if (!name) throw new ActionError('Name is required.');

    const aadhar = String(formData.get('aadharNumber') || '').trim();
    if (!AADHAR_RE.test(aadhar)) throw new ActionError('Aadhar number must be exactly 12 digits.');
    if (await findWorkerByAadhar(aadhar, id)) {
      throw new ActionError('A worker with this Aadhar number already exists.');
    }

    const contact = digitsOnly(String(formData.get('contact') || ''));
    if (!PHONE_RE.test(contact)) throw new ActionError('A contact phone number (at least 10 digits) is required.');

    const wageRate = parseFloat(String(formData.get('wageRate') || ''));
    if (!(wageRate > 0)) throw new ActionError('Wage rate must be a positive number.');

    const vendorId = Number(formData.get('vendorId'));
    if (!vendorId) throw new ActionError('Vendor is required.');

    const workerTypeIdRaw = String(formData.get('workerTypeId') || '');
    const workerTypeId = workerTypeIdRaw ? Number(workerTypeIdRaw) : null;
    const siteId = Number(formData.get('siteId'));
    const overtimeMultiplier = parseFloat(String(formData.get('overtimeMultiplier') || '')) || 1.5;
    const joinedDate = String(formData.get('joinedDate') || '').trim() || new Date().toISOString().slice(0, 10);
    const status = String(formData.get('status') || 'active') as 'active' | 'inactive';

    await db
      .update(workers)
      .set({
        name,
        workerTypeId,
        vendorId,
        aadharNumber: aadhar,
        siteId,
        wageRate,
        overtimeMultiplier,
        contact,
        status,
        joinedDate,
      })
      .where(eq(workers.id, id));
    await logAudit(user.id, 'update', 'worker', id, name);
    revalidatePath('/workers');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not save that worker.';
    redirect(`/workers/${id}/edit?error=` + encodeURIComponent(message));
  }
  redirect('/workers');
}

export async function toggleWorkerVerificationAction(formData: FormData) {
  const id = Number(formData.get('id'));
  try {
    const user = await requireActionCapability(formData, 'workers.verify');
    const [w] = await db.select().from(workers).where(eq(workers.id, id));
    if (!w) throw new ActionError('Worker not found.');
    const next = w.verificationStatus === 'verified' ? 'pending' : 'verified';
    await db.update(workers).set({ verificationStatus: next }).where(eq(workers.id, id));
    await logAudit(user.id, 'update', 'worker', id, `${w.name} verification -> ${next}`);
    revalidatePath(`/workers/${id}/edit`);
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not update verification status.';
    redirect(`/workers/${id}/edit?error=` + encodeURIComponent(message));
  }
  redirect(`/workers/${id}/edit`);
}
