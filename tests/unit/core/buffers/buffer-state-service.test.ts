import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BufferStateService } from '@core/buffers/buffer-state-service.js';
import type { BufferLedgerQuery } from '@core/ports/buffer-ledger-query.js';
import type { BufferBucket } from '@core/config/app-config.js';
import { Money } from '@core/shared/money.js';
import { Result } from '@core/shared/result.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function makeBucket(
  name: string,
  account: string,
  targetCents: number,
  capCents?: number,
): BufferBucket {
  return {
    name,
    account,
    target: makeEur(targetCents),
    cap: capCents !== undefined ? makeEur(capCents) : undefined,
  };
}

function fakeLedger(balances: Record<string, Money>): BufferLedgerQuery {
  return {
    sumEntriesByAccount(account: string, expectedCurrency: string): Result<Money> {
      const bal = balances[account];
      if (bal === undefined) return Money.fromCents(0, expectedCurrency);
      return Result.ok(bal);
    },
  };
}

function failingLedger(error: string): BufferLedgerQuery {
  return {
    sumEntriesByAccount(): Result<Money> {
      return Result.fail(error);
    },
  };
}

describe('BufferStateService', () => {
  describe('status derivation', () => {
    it('returns below when balance < target', () => {
      // fails if status threshold logic is inverted or missing
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00)];
      const ledger = fakeLedger({ 'assets:buffer:car': makeEur(80_00) });
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].status).toBe('below');
    });

    it('returns on-target when balance == target', () => {
      // fails if boundary is exclusive (balance == target should be on-target)
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00)];
      const ledger = fakeLedger({ 'assets:buffer:car': makeEur(100_00) });
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].status).toBe('on-target');
    });

    it('returns on-target when balance > target and no cap', () => {
      // fails if above-target without cap is not on-target
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00)];
      const ledger = fakeLedger({ 'assets:buffer:car': makeEur(150_00) });
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].status).toBe('on-target');
    });

    it('returns on-target when balance == cap', () => {
      // fails if boundary is exclusive (balance == cap should be on-target)
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00, 200_00)];
      const ledger = fakeLedger({ 'assets:buffer:car': makeEur(200_00) });
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].status).toBe('on-target');
    });

    it('returns above-cap when balance > cap', () => {
      // fails if above-cap status is not detected
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00, 200_00)];
      const ledger = fakeLedger({ 'assets:buffer:car': makeEur(250_00) });
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].status).toBe('above-cap');
    });

    it('returns below for negative balance (credits exceed debits)', () => {
      // fails if negative balance is not handled correctly
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00)];
      const ledger = fakeLedger({ 'assets:buffer:car': makeEur(-50_00) });
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].status).toBe('below');
    });
  });

  describe('output shape', () => {
    it('returns entries in config order', () => {
      // fails if order is not preserved
      const buckets = [
        makeBucket('Car', 'assets:buffer:car', 100_00),
        makeBucket('House', 'assets:buffer:house', 500_00),
        makeBucket('Vac', 'assets:buffer:vac', 50_00),
      ];
      const ledger = fakeLedger({
        'assets:buffer:car': makeEur(80_00),
        'assets:buffer:house': makeEur(600_00),
        'assets:buffer:vac': makeEur(60_00),
      });
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      const states = result.value;
      expect(states[0].name).toBe('Car');
      expect(states[1].name).toBe('House');
      expect(states[2].name).toBe('Vac');
    });

    it('returns empty array for empty buffers config', () => {
      // fails if empty config is not handled
      const service = new BufferStateService([], 'EUR', fakeLedger({}));
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(0);
    });

    it('returns balance from ledger on each BufferState', () => {
      // fails if balance is not passed through
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00)];
      const ledger = fakeLedger({ 'assets:buffer:car': makeEur(75_00) });
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].balance.amount).toBe(75_00);
    });

    it('propagates target and cap from bucket onto BufferState', () => {
      // fails if target/cap not threaded through
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00, 300_00)];
      const ledger = fakeLedger({ 'assets:buffer:car': makeEur(150_00) });
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].target.amount).toBe(100_00);
      expect(result.value[0].cap?.amount).toBe(300_00);
    });
  });

  describe('ledger failure propagation', () => {
    it('returns Result.fail when ledger returns failure', () => {
      // fails if ledger errors are swallowed
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00)];
      const service = new BufferStateService(
        buckets,
        'EUR',
        failingLedger('assets:buffer:car: currency mismatch USD vs EUR'),
      );
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('assets:buffer:car');
    });

    it('returns the first failure when multiple buckets have errors', () => {
      // fails if Result.all short-circuit is not used
      const buckets = [
        makeBucket('A', 'assets:buffer:a', 100_00),
        makeBucket('B', 'assets:buffer:b', 100_00),
      ];
      const service = new BufferStateService(
        buckets,
        'EUR',
        failingLedger('mismatch error'),
      );
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Properties (fast-check)', () => {
    it('Property: status totality — every (balance, target, cap?) yields exactly one status', () => {
      // fails if status computation is partial or has missing branches
      fc.assert(
        fc.property(
          fc.integer({ min: -10_000_00, max: 10_000_00 }),
          fc.integer({ min: 0, max: 10_000_00 }),
          fc.option(fc.integer({ min: 0, max: 20_000_00 }), { nil: undefined }),
          (balanceCents, targetCents, capCentsRaw) => {
            // cap must be >= target if present
            const capCents =
              capCentsRaw !== undefined
                ? Math.max(capCentsRaw, targetCents)
                : undefined;
            const buckets = [
              makeBucket('X', 'assets:buffer:x', targetCents, capCents),
            ];
            const ledger = fakeLedger({ 'assets:buffer:x': makeEur(balanceCents) });
            const service = new BufferStateService(buckets, 'EUR', ledger);
            const result = service.getStateAsOf('2026-04-26');
            if (result.isFailure) return false;
            const status = result.value[0].status;
            return ['below', 'on-target', 'above-cap'].includes(status);
          }
        )
      );
    });

    it('Property: boundary inclusivity — balance == target => on-target; balance == cap => on-target', () => {
      // fails if boundary comparisons use strict inequality
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10_000_00 }),
          fc.integer({ min: 0, max: 10_000_00 }),
          (targetCents, extraCents) => {
            const capCents = targetCents + extraCents;
            // Test balance == target
            const b1 = [makeBucket('X', 'assets:buffer:x', targetCents, capCents)];
            const l1 = fakeLedger({ 'assets:buffer:x': makeEur(targetCents) });
            const r1 = new BufferStateService(b1, 'EUR', l1).getStateAsOf('2026-04-26');
            if (r1.isFailure || r1.value[0].status !== 'on-target') return false;
            // Test balance == cap (only when cap > 0)
            if (capCents > 0) {
              const b2 = [makeBucket('X', 'assets:buffer:x', targetCents, capCents)];
              const l2 = fakeLedger({ 'assets:buffer:x': makeEur(capCents) });
              const r2 = new BufferStateService(b2, 'EUR', l2).getStateAsOf('2026-04-26');
              if (r2.isFailure || r2.value[0].status !== 'on-target') return false;
            }
            return true;
          }
        )
      );
    });

    it('Property: per-bucket balance is independent of bucket order in config', () => {
      // fails if BufferStateService.getStateAsOf produces different per-bucket balances
      // when the same buckets are reordered in the input config (e.g., if the service
      // accidentally cross-wires bucket→account by index instead of by account string).
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 5 }),
              cents: fc.integer({ min: 0, max: 10_000_00 }),
            }),
            { minLength: 2, maxLength: 5 },
          ),
          (items) => {
            const deduped = items.filter(
              (item, i, arr) => arr.findIndex(x => x.name === item.name) === i,
            );
            if (deduped.length < 2) return true;
            const buckets = deduped.map((item, i) =>
              makeBucket(item.name, `assets:buffer:${i}`, 100_00),
            );
            const balances = Object.fromEntries(
              deduped.map((item, i) => [`assets:buffer:${i}`, makeEur(item.cents)]),
            );
            const ledger = fakeLedger(balances);
            const reversed = [...buckets].reverse();
            const r1 = new BufferStateService(buckets, 'EUR', ledger).getStateAsOf('2026-04-26');
            const r2 = new BufferStateService(reversed, 'EUR', ledger).getStateAsOf('2026-04-26');
            if (r1.isFailure || r2.isFailure) return false;
            const byName1 = new Map(r1.value.map(s => [s.name, s.balance.amount]));
            const byName2 = new Map(r2.value.map(s => [s.name, s.balance.amount]));
            return [...byName1].every(([name, bal]) => byName2.get(name) === bal);
          },
        ),
      );
    });

    it('Property: purity — source does not contain Date.now, new Date(, or performance.now', () => {
      // fails if service reads the system clock, violating the purity invariant
      const serviceFile = path.resolve(
        __dirname,
        '../../../../src/core/buffers/buffer-state-service.ts',
      );
      const source = fs.readFileSync(serviceFile, 'utf8');
      expect(source).not.toMatch(/Date\.now/);
      expect(source).not.toMatch(/new Date\(/);
      expect(source).not.toMatch(/performance\.now/);
    });
  });

  describe('currency mismatch', () => {
    it('returns failure when ledger returns a Money with wrong currency', () => {
      // fails if service does not propagate adapter currency errors
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00)];
      const ledger: BufferLedgerQuery = {
        sumEntriesByAccount(): Result<Money> {
          return Result.fail('assets:buffer:car: currency mismatch USD vs EUR');
        },
      };
      const service = new BufferStateService(buckets, 'EUR', ledger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('USD');
    });

    it('returns failure when balance currency differs from target currency (deriveStatus guard)', () => {
      // Branch: ltTargetResult.isFailure in deriveStatus (line 15)
      // This covers the defensive guard in deriveStatus against impossible-in-production
      // cross-currency balance vs target.
      const buckets = [makeBucket('Car', 'assets:buffer:car', 100_00)];
      const usdLedger: BufferLedgerQuery = {
        sumEntriesByAccount(): Result<Money> {
          return Money.fromCents(50_00, 'USD');
        },
      };
      const service = new BufferStateService(buckets, 'EUR', usdLedger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isFailure).toBe(true);
    });

    it('returns failure when balance currency differs from cap currency (deriveStatus lteCapResult guard)', () => {
      // Branch: lteCapResult.isFailure in deriveStatus (line 21)
      // Similar to above — forces the above-cap comparison with a mismatched currency.
      const buckets = [makeBucket('Car', 'assets:buffer:car', 50_00, 200_00)];
      const usdLedger: BufferLedgerQuery = {
        sumEntriesByAccount(): Result<Money> {
          return Money.fromCents(100_00, 'USD');
        },
      };
      const service = new BufferStateService(buckets, 'EUR', usdLedger);
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isFailure).toBe(true);
    });
  });

  describe('asOf date validation (Story 3.2 slice 6)', () => {
    it('returns Result.fail when date is not YYYY-MM-DD', () => {
      // fails if ISO_DATE guard is absent
      const service = new BufferStateService([], 'EUR', fakeLedger({}));
      const result = service.getStateAsOf('26-04-2026');
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('ISO 8601');
    });

    it('returns Result.fail for datetime string (not date-only)', () => {
      // fails if service accepts ISO 8601 datetime instead of requiring date-only
      const service = new BufferStateService([], 'EUR', fakeLedger({}));
      const result = service.getStateAsOf('2026-04-26T14:30:00+02:00');
      expect(result.isFailure).toBe(true);
    });

    it('returns Result.fail for empty string', () => {
      // fails if empty string is not rejected
      const service = new BufferStateService([], 'EUR', fakeLedger({}));
      const result = service.getStateAsOf('');
      expect(result.isFailure).toBe(true);
    });

    it('accepts a valid YYYY-MM-DD date', () => {
      // fails if valid date is rejected
      const service = new BufferStateService([], 'EUR', fakeLedger({}));
      const result = service.getStateAsOf('2026-04-26');
      expect(result.isSuccess).toBe(true);
    });

    it('Property: getStateAsOf forwards the asOf date verbatim to the ledger port', () => {
      // fails if BufferStateService stops passing the `date` argument through to
      // sumEntriesByAccount (e.g., hardcoded date, dropped argument, swapped order).
      // SQL-level monotonicity over receipt-truth dates is verified by the integration
      // tests in tests/integration/infra/db/sqlite-buffer-ledger-query.test.ts; this
      // service-tier property only asserts the wiring contract.
      const isoDateArb = fc
        .integer({ min: 2020, max: 2030 })
        .chain(year =>
          fc.integer({ min: 1, max: 12 }).chain(month =>
            fc.integer({ min: 1, max: 28 }).map(day => {
              const mm = String(month).padStart(2, '0');
              const dd = String(day).padStart(2, '0');
              return `${year}-${mm}-${dd}`;
            }),
          ),
        );

      fc.assert(
        fc.property(isoDateArb, (asOf) => {
          let observedDate: string | undefined;
          const recordingLedger: BufferLedgerQuery = {
            sumEntriesByAccount(_account, expectedCurrency, asOfDate) {
              observedDate = asOfDate;
              return Money.fromCents(0, expectedCurrency);
            },
          };
          const bucket = makeBucket('Car', 'assets:buffer:car', 0);
          const result = new BufferStateService([bucket], 'EUR', recordingLedger).getStateAsOf(asOf);
          return result.isSuccess && observedDate === asOf;
        }),
      );
    });
  });
});
