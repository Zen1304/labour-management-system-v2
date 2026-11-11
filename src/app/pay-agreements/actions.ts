'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { payAgreements, payAgreementWorkers, pieceWorkEntries } from '@/lib/db/schema';
import { requireActionCapability, ActionError } from '@/lib/auth/action-helpers';
import { logAudit } from '@/lib/audit';
import { validateShares, type ShareInput } from '@/lib/entities/pay-agreements';
import { isValidDateStr } from '@/lib/entities/attendance';

export async function createPayAgreementAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'payagreements.manage');

    const siteId = Number(formData.get('siteId'));
    if (!siteId) throw new ActionError('Site is required.');
    const mode = String(formData.get('mode') || '');
    if (!['subcontract', 'piece_work'].includes(mode)) throw new ActionError('Select a valid mode.');
    const scopeDescription = String(formData.get('scopeDescription') || '').trim();
    if (!scopeDescription) throw new ActionError('Scope description is required.');
    const vendorIdRaw = String(formData.get('vendorId') || '');
    const vendorId = vendorIdRaw ? Number(vendorIdRaw) : null;
    const periodStart = String(formData.get('periodStart') || '');
    if (!isValidDateStr(periodStart)) throw new ActionError('Period start must be a valid date.');
    const periodEndRaw = String(formData.get('periodEnd') || '');
    const periodEnd = periodEndRaw ? periodEndRaw : null;
    if (periodEnd && !isValidDateStr(periodEnd)) throw new ActionError('Period end must be a valid date.');
    const payoutMethod = String(formData.get('payoutMethod') || 'cash');
    if (!['cash', 'bank_transfer'].includes(payoutMethod)) throw new ActionError('Select a valid payout method.');
    const terms = String(formData.get('terms') || '').trim() || null;

    let lumpSumAmount: number | null = null;
    let unitLabel: string | null = null;
    let ratePerUnit: number | null = null;

    if (mode === 'subcontract') {
      lumpSumAmount = parseFloat(String(formData.get('lumpSumAmount') || ''));
      if (!(lumpSumAmount > 0)) throw new ActionError('Lump sum amount must be a positive number.');
    } else {
      unitLabel = String(formData.get('unitLabel') || '').trim();
      if (!unitLabel) throw new ActionError('Unit label is required for piece work (e.g. "sq ft").');
      ratePerUnit = parseFloat(String(formData.get('ratePerUnit') || ''));
      if (!(ratePerUnit > 0)) throw new ActionError('Rate per unit must be a positive number.');
    }

    const workerIds = formData.getAll('workerIds').map(Number).filter(Boolean);
    const shares: ShareInput[] = workerIds.map((workerId) => {
      const raw = String(formData.get(`share_${workerId}`) || '').trim();
      return { workerId, sharePercent: raw ? parseFloat(raw) : null };
    });
    const shareError = validateShares(shares);
    if (shareError) throw new ActionError(shareError);

    const [row] = await db
      .insert(payAgreements)
      .values({
        siteId,
        mode: mode as 'subcontract' | 'piece_work',
        scopeDescription,
        vendorId,
        lumpSumAmount,
        unitLabel,
        ratePerUnit,
        periodStart,
        periodEnd,
        payoutMethod: payoutMethod as 'cash' | 'bank_transfer',
        terms,
        createdBy: user.id,
      })
      .returning();

    if (shares.length > 0) {
      await db.insert(payAgreementWorkers).values(
        shares.map((s) => ({ payAgreementId: row.id, workerId: s.workerId, sharePercent: s.sharePercent }))
      );
    }

    await logAudit(user.id, 'create', 'pay_agreement', row.id, `${mode} — ${scopeDescription}`);
    revalidatePath('/pay-agreements');
    redirect(`/pay-agreements/${row.id}`);
  } catch (e) {
    if (e instanceof ActionError) {
      redirect('/pay-agreements/new?error=' + encodeURIComponent(e.message));
    }
    throw e;
  }
}

export async function closePayAgreementAction(formData: FormData) {
  const id = Number(formData.get('id'));
  try {
    const user = await requireActionCapability(formData, 'payagreements.manage');
    const [row] = await db.update(payAgreements).set({ status: 'closed' }).where(eq(payAgreements.id, id)).returning();
    if (row) await logAudit(user.id, 'update', 'pay_agreement', id, `${row.scopeDescription} -> closed`);
    revalidatePath(`/pay-agreements/${id}`);
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not close that agreement.';
    redirect(`/pay-agreements/${id}?error=` + encodeURIComponent(message));
  }
  redirect(`/pay-agreements/${id}`);
}

// Logs piece-work output — either against one worker directly, or as a
// team-level total (workerId left blank) split later at payroll time by
// each assigned worker's share. Upserts by hand (not onConflictDoUpdate)
// because the team row's workerId is NULL, and Postgres unique
// constraints treat every NULL as distinct — the DB-level UNIQUE on
// (payAgreementId, workerId, date) silently allows duplicate team rows,
// so the "already logged for this date" check has to be a real query.
export async function logPieceWorkEntryAction(formData: FormData) {
  const payAgreementId = Number(formData.get('payAgreementId'));
  try {
    const user = await requireActionCapability(formData, 'payagreements.manage');
    const date = String(formData.get('date') || '');
    if (!isValidDateStr(date)) throw new ActionError('Date is required.');
    const quantity = parseFloat(String(formData.get('quantity') || ''));
    if (!(quantity >= 0)) throw new ActionError('Quantity must be zero or a positive number.');
    const workerIdRaw = String(formData.get('workerId') || '');
    const workerId = workerIdRaw ? Number(workerIdRaw) : null;

    const existingCondition = workerId
      ? and(eq(pieceWorkEntries.payAgreementId, payAgreementId), eq(pieceWorkEntries.workerId, workerId), eq(pieceWorkEntries.date, date))
      : and(eq(pieceWorkEntries.payAgreementId, payAgreementId), isNull(pieceWorkEntries.workerId), eq(pieceWorkEntries.date, date));
    const [existing] = await db.select().from(pieceWorkEntries).where(existingCondition);

    if (existing) {
      await db.update(pieceWorkEntries).set({ quantity, loggedBy: user.id, loggedAt: new Date() }).where(eq(pieceWorkEntries.id, existing.id));
    } else {
      await db.insert(pieceWorkEntries).values({ payAgreementId, workerId, date, quantity, loggedBy: user.id });
    }
    await logAudit(user.id, workerId ? 'update' : 'create', 'piece_work_entry', payAgreementId, `${date}: ${quantity}${workerId ? ` (worker ${workerId})` : ' (team)'}`);
    revalidatePath(`/pay-agreements/${payAgreementId}`);
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not save that entry.';
    redirect(`/pay-agreements/${payAgreementId}?error=` + encodeURIComponent(message));
  }
  redirect(`/pay-agreements/${payAgreementId}`);
}
