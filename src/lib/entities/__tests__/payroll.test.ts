// Unit tests for the pure, no-DB payroll math — the highest financial-risk
// surface per the rebuild plan ("a silent miscalculation here is a direct
// financial-accuracy risk"). The full dispatch (generatePayroll itself)
// needs a real Postgres connection and is covered by the Playwright
// end-to-end run in scratch verify_phase5.js instead; these tests pin down
// the pieces that don't need a database at all, where a mutation is easy to
// introduce by accident and easy to catch here.
import { describe, it, expect } from 'vitest';
import { snapToPayPeriod, currentPayPeriod, splitAmount } from '../payroll';
import { validateShares } from '../pay-agreements';

describe('snapToPayPeriod', () => {
  it('snaps a Thursday to itself as the period start', () => {
    expect(snapToPayPeriod('2026-01-01')).toEqual({ start: '2026-01-01', end: '2026-01-07' });
  });

  it('snaps a mid-week date back to the preceding Thursday', () => {
    expect(snapToPayPeriod('2026-01-05')).toEqual({ start: '2026-01-01', end: '2026-01-07' });
  });

  it('snaps a Wednesday (last day of the period) back to the same week, not forward', () => {
    expect(snapToPayPeriod('2026-01-07')).toEqual({ start: '2026-01-01', end: '2026-01-07' });
  });

  it('rolls over a month boundary correctly', () => {
    // Jan 29 2026 is a Thursday -> Feb 4 2026 is the Wednesday that closes it.
    expect(snapToPayPeriod('2026-01-31')).toEqual({ start: '2026-01-29', end: '2026-02-04' });
  });

  it('returns null for an invalid or empty date', () => {
    expect(snapToPayPeriod('')).toBeNull();
    expect(snapToPayPeriod('not-a-date')).toBeNull();
    expect(snapToPayPeriod(null)).toBeNull();
  });
});

describe('currentPayPeriod', () => {
  it('always returns a 7-day Thursday->Wednesday window', () => {
    const period = currentPayPeriod();
    const start = new Date(`${period.start}T00:00:00Z`);
    const end = new Date(`${period.end}T00:00:00Z`);
    expect(start.getUTCDay()).toBe(4); // Thursday
    expect(end.getUTCDay()).toBe(3); // Wednesday
    expect((end.getTime() - start.getTime()) / 86400000).toBe(6);
  });
});

describe('splitAmount', () => {
  it('splits equally when every share is null', () => {
    const result = splitAmount(100, [
      { workerId: 1, sharePercent: null },
      { workerId: 2, sharePercent: null },
    ]);
    expect(result.get(1)).toBe(50);
    expect(result.get(2)).toBe(50);
  });

  it('splits by explicit percentage when shares are set', () => {
    const result = splitAmount(3000, [
      { workerId: 1, sharePercent: 70 },
      { workerId: 2, sharePercent: 30 },
    ]);
    expect(result.get(1)).toBe(2100);
    expect(result.get(2)).toBe(900);
  });

  it('returns an empty split for zero assigned workers rather than throwing', () => {
    expect(splitAmount(100, []).size).toBe(0);
  });

  it('every worker receives exactly the lump sum in total (no leakage/overpay)', () => {
    const shares = [
      { workerId: 1, sharePercent: 33.33 },
      { workerId: 2, sharePercent: 33.33 },
      { workerId: 3, sharePercent: 33.34 },
    ];
    const result = splitAmount(9999, shares);
    const total = [...result.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(9999, 2);
  });
});

describe('validateShares (Subcontract/Piece Work distribution rule)', () => {
  it('accepts all-null shares (equal split)', () => {
    expect(
      validateShares([
        { workerId: 1, sharePercent: null },
        { workerId: 2, sharePercent: null },
      ])
    ).toBeNull();
  });

  it('accepts shares that sum to exactly 100', () => {
    expect(
      validateShares([
        { workerId: 1, sharePercent: 60 },
        { workerId: 2, sharePercent: 40 },
      ])
    ).toBeNull();
  });

  it('rejects a mix of set and null shares', () => {
    expect(
      validateShares([
        { workerId: 1, sharePercent: 60 },
        { workerId: 2, sharePercent: null },
      ])
    ).not.toBeNull();
  });

  it('rejects shares that do not sum to 100', () => {
    expect(
      validateShares([
        { workerId: 1, sharePercent: 60 },
        { workerId: 2, sharePercent: 30 },
      ])
    ).not.toBeNull();
  });

  it('rejects an empty worker list', () => {
    expect(validateShares([])).not.toBeNull();
  });
});
