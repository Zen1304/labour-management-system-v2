// Validation shared between the create and worker-assignment Server
// Actions — see the "Distribution rules" section of the rebuild plan.
export interface ShareInput {
  workerId: number;
  sharePercent: number | null;
}

// Either every share is null (equal split across all assigned workers) or
// every one of them is set and they sum to 100 (within float tolerance).
export function validateShares(shares: ShareInput[]): string | null {
  if (shares.length === 0) return 'At least one worker must be assigned.';
  const set = shares.filter((s) => s.sharePercent !== null);
  if (set.length === 0) return null; // all null = equal split, fine
  if (set.length !== shares.length) {
    return 'Either leave every share blank (equal split) or set a percentage for every assigned worker.';
  }
  const total = set.reduce((sum, s) => sum + (s.sharePercent as number), 0);
  if (Math.abs(total - 100) > 0.01) {
    return `Shares must add up to 100% — they currently add up to ${total.toFixed(2)}%.`;
  }
  return null;
}
