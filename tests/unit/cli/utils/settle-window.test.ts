/**
 * Unit tests for src/cli/utils/settle-window.ts (story-4.3b, #208 item 1).
 *
 * nextCalendarMonth's edge cases are already covered by
 * tests/unit/cli/commands/status-command.test.ts (it re-exports the same function
 * unchanged) — this file focuses on previousSettleWindow, in particular the
 * month-end clamp (Jan 31 / Mar 31 / leap-year cases) and the silent-zero-trap
 * guarantee that asOfLast is never equal to asOf.
 */
import { describe, it, expect } from 'vitest';
import { nextCalendarMonth, previousSettleWindow } from '../../../../src/cli/utils/settle-window.js';

describe('previousSettleWindow — month-end clamping', () => {
  it('Jan 31 clamps to Dec 31 (31-day month, no clamp needed)', () => {
    // fails if the year-rollover branch or the clamp arithmetic drops a day
    expect(previousSettleWindow('2026-01-31').asOfLast).toBe('2025-12-31');
  });

  it('Mar 31 clamps to Feb 28 in a non-leap year', () => {
    // fails if the clamp is missing and an invalid "2026-02-31" is produced instead
    expect(previousSettleWindow('2026-03-31').asOfLast).toBe('2026-02-28');
  });

  it('Mar 31 clamps to Feb 29 in a leap year', () => {
    // fails if the clamp doesn't account for the leap-year Feb 29 boundary
    expect(previousSettleWindow('2024-03-31').asOfLast).toBe('2024-02-29');
  });

  it('a mid-month date needs no clamp: Jun 15 -> May 15', () => {
    expect(previousSettleWindow('2026-06-15').asOfLast).toBe('2026-05-15');
  });
});

describe('previousSettleWindow — window composition', () => {
  it('window is the calendar month preceding nextCalendarMonth(asOf)', () => {
    // fails if the two window sources (this-month / last-month) drift out of lockstep
    const asOf = '2026-06-28';
    const thisWindow = nextCalendarMonth(asOf);
    const last = previousSettleWindow(asOf);
    expect(thisWindow).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(last).toEqual({ asOfLast: '2026-05-28', from: '2026-06-01', to: '2026-06-30' });
  });

  it('never returns asOfLast equal to the input asOf (silent-zero-trap guard)', () => {
    // fails if a caller could pass the same asOf to both calculateForWindow runs
    const inputs = ['2026-01-01', '2026-01-31', '2024-02-29', '2026-12-31'];
    const collisions = inputs.filter(asOf => previousSettleWindow(asOf).asOfLast === asOf);
    expect(collisions).toEqual([]);
  });
});
