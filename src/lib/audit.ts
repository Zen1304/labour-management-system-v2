// Thin wrapper around the audit_log table — ported from the old app's
// logAudit() helper. Called from every create/update/delete Server Action.
import { db } from './db/client';
import { auditLog } from './db/schema';

export async function logAudit(
  userId: number,
  action: 'create' | 'update' | 'delete' | 'login' | 'csrf_reject' | 'verify_site' | 'verify' | 'complete' | 'flag',
  entityType: string,
  entityId: number | null,
  detail: string | null
) {
  await db.insert(auditLog).values({ userId, action, entityType, entityId, detail });
}
