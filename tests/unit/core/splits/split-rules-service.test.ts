/**
 * Unit + property tests for SplitRulesService (Story 3.1).
 *
 * Cases (a)–(i): boundary inclusivity, fail-before-earliest, ISO format guard
 *   (incl. timestamp-with-offset rejection per FR22 boundary), single-window service,
 *   empty-windows defense-in-depth branch, regex-based no-clock greppable assertion.
 * Properties P1, P2: ratio-sum invariant; boundary inclusivity AND uniqueness.
 *
 * fails if: window-resolution off-by-one (picks earlier or later window than
 *   active), interval treated as fully-closed instead of half-open, silent
 *   extrapolation past earliest validFrom, ISO regex too permissive (accepts
 *   timestamps), single-window scan crashes, empty-windows scan crashes,
 *   service reads the system clock (Date.now / new Date() / Date.UTC), property
 *   tests access .value without checking isSuccess (Result-pattern footgun, P3 #5),
 *   or P2 collapses to existence-only check (P3 #8 — must catch "always returns latest").
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import type { SplitWindow } from '../../../../src/core/config/app-config.js';
import { SplitRulesService } from '../../../../src/core/splits/split-rules-service.js';

const twoWindows: readonly SplitWindow[] = [
  {
    validFrom: '2024-01-01',
    rules: [
      { partner: 'Alex', ratio: 0.5 },
      { partner: 'Sam', ratio: 0.5 },
    ],
  },
  {
    validFrom: '2026-03-15',
    rules: [
      { partner: 'Alex', ratio: 0.6 },
      { partner: 'Sam', ratio: 0.4 },
    ],
  },
];

describe('SplitRulesService.getSplitsAsOf', () => {
  it('(a) returns the latest window\'s rules for a date in the latest range', () => {
    // fails if: scan picks the first window instead of the latest applicable.
    const svc = new SplitRulesService(twoWindows);
    const result = svc.getSplitsAsOf('2026-04-20');
    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual(twoWindows[1].rules);
  });

  it('(b) returns the earlier window\'s rules for a date inside that earlier range', () => {
    // fails if: scan ignores the date argument, or uses the wrong comparison direction.
    const svc = new SplitRulesService(twoWindows);
    const result = svc.getSplitsAsOf('2024-06-15');
    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual(twoWindows[0].rules);
  });

  it('(c) at date === windows[k].validFrom, returns window k (start-inclusive)', () => {
    // fails if: half-open interval flipped — start-exclusive instead of inclusive.
    const svc = new SplitRulesService(twoWindows);
    const result = svc.getSplitsAsOf('2026-03-15');
    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual(twoWindows[1].rules);
  });

  it('(d) at date === windows[k+1].validFrom - 1 day, returns window k (end-exclusive)', () => {
    // fails if: half-open interval flipped — end-inclusive instead of exclusive.
    const svc = new SplitRulesService(twoWindows);
    const result = svc.getSplitsAsOf('2026-03-14');
    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual(twoWindows[0].rules);
  });

  it('(e) for a date strictly before windows[0].validFrom, returns Result.fail', () => {
    // fails if: silent extrapolation past the earliest validFrom (returns earliest window).
    const svc = new SplitRulesService(twoWindows);
    const result = svc.getSplitsAsOf('2023-12-31');
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('precedes earliest split window');
    expect(result.error).toContain('2023-12-31');
  });

  it.each([
    '2026/03/15',
    '03/15/2026',
    '2026-3-15',
    '',
    '2026-04-20T14:30:00+02:00',
    '2026-04-20T00:00:00Z',
  ])('(f) rejects malformed date string %j with ISO 8601 error', (badDate) => {
    // fails if: ISO regex too permissive (accepts timestamps with offset/zulu suffix).
    // Date+time inputs MUST be rejected — FR22 boundary depends on it.
    const svc = new SplitRulesService(twoWindows);
    const result = svc.getSplitsAsOf(badDate);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('ISO 8601');
  });

  it('(g) the service file contains no clock-reading calls (FR22 spine, regex-based)', () => {
    // fails if: an implementation refactor introduces `new Date()`, `Date.now()`,
    // or `Date.UTC()` in any spacing variant. Catches whitespace tricks the prior
    // .includes('new Date()') check missed.
    const filePath = path.resolve(
      __dirname,
      '../../../../src/core/splits/split-rules-service.ts',
    );
    const source = readFileSync(filePath, 'utf8');
    expect(source).not.toMatch(/\bnew\s+Date\s*\(/);
    expect(source).not.toMatch(/\bDate\.now\s*\(/);
    expect(source).not.toMatch(/\bDate\.UTC\s*\(/);
  });

  it('(h) single-window service returns its rules for any in-range date', () => {
    // fails if: linear scan assumes ≥2 windows (e.g. starts loop at index 1).
    const single: readonly SplitWindow[] = [twoWindows[0]];
    const svc = new SplitRulesService(single);
    const result = svc.getSplitsAsOf('2026-04-25');
    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual(twoWindows[0].rules);
  });

  it('(i) empty-windows service returns Result.fail (defense-in-depth branch)', () => {
    // fails if: empty array path crashes or returns Result.ok([]) — schema enforces
    // ≥1 window, but Service trusts constructor input only weakly per Core idiom.
    // 100% branch coverage gate (P3 #4).
    const svc = new SplitRulesService([]);
    const result = svc.getSplitsAsOf('2026-04-25');
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('precedes earliest');
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

const partners = ['Alex', 'Sam'] as const;

const ratioArb = fc
  .float({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true })
  .map((r) => Math.round(r * 100) / 100);

const dateStringArb = fc
  .date({ min: new Date('2000-01-01'), max: new Date('2099-12-31') })
  .map((d) => d.toISOString().slice(0, 10)); // YYYY-MM-DD

function buildWindows(rawDates: readonly string[], ratios: readonly number[]): readonly SplitWindow[] {
  const sorted = [...new Set(rawDates)].sort();
  return sorted.map((validFrom, i) => ({
    validFrom,
    rules: [
      { partner: partners[0], ratio: ratios[i % ratios.length] },
      { partner: partners[1], ratio: 1 - ratios[i % ratios.length] },
    ],
  }));
}

describe('SplitRulesService — properties', () => {
  it('P1: ratios in the active window always sum to 1.0 (±1e-9) for any in-range date', () => {
    // fails if: getSplitsAsOf returns the wrong window such that its ratios drift,
    // OR the test accesses .value without checking isSuccess (Result-pattern footgun, P3 #5).
    fc.assert(
      fc.property(
        fc.array(dateStringArb, { minLength: 1, maxLength: 6 }),
        fc.array(ratioArb, { minLength: 1, maxLength: 6 }),
        dateStringArb,
        (rawDates, ratios, queryDate) => {
          const windows = buildWindows(rawDates, ratios);
          fc.pre(windows.length >= 1);
          fc.pre(queryDate >= windows[0].validFrom);
          fc.pre(queryDate <= '2099-12-31');
          const svc = new SplitRulesService(windows);
          const result = svc.getSplitsAsOf(queryDate);
          expect(result.isSuccess).toBe(true);
          const sum = result.value.reduce((a, r) => a + r.ratio, 0);
          expect(Math.abs(sum - 1.0)).toBeLessThan(1e-9);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('P2: distinct windows return distinct rule arrays at their own validFrom boundaries (uniqueness)', () => {
    // fails if: P1 collapses to existence-only — a buggy "always returns latest"
    // implementation would pass an existence check but fail this uniqueness check.
    // Ratios are constructed distinct per window so equality means the window
    // resolver is broken.
    fc.assert(
      fc.property(
        fc.array(dateStringArb, { minLength: 2, maxLength: 6 }),
        (rawDates) => {
          // Distinct ratios per window: 0.10, 0.20, 0.30, ... so each window is
          // structurally unique.
          const sorted = [...new Set(rawDates)].sort();
          fc.pre(sorted.length >= 2);
          const windows: readonly SplitWindow[] = sorted.map((validFrom, i) => ({
            validFrom,
            rules: [
              { partner: partners[0], ratio: (i + 1) / 10 },
              { partner: partners[1], ratio: 1 - (i + 1) / 10 },
            ],
          }));
          const svc = new SplitRulesService(windows);
          for (let k = 1; k < windows.length; k++) {
            const here = svc.getSplitsAsOf(windows[k].validFrom);
            const prev = svc.getSplitsAsOf(windows[k - 1].validFrom);
            expect(here.isSuccess).toBe(true);
            expect(prev.isSuccess).toBe(true);
            expect(here.value).not.toEqual(prev.value);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
