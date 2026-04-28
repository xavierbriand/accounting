# Story 3.4 — Safe Monthly Transfer Calculator

## Context

Headline of Epic 3. Composes the three previous services (`SplitRulesService` from 3.1, `BufferStateService` from 3.2, `RecurringForecastService` from 3.3) into the calculator that answers the central PRD question: **"how much should each partner transfer to the joint account this month, and why?"** This is the FR8 service, and Story 3.5 (Status CLI) renders its output for the user.

The calculator returns an aggregate per partner plus a flat list of line items (forecast occurrences and buffer top-ups), each carrying its own per-partner split. Splits are applied **per occurrence date** so transactions on either side of a split-rule change settle at the correct ratios (PRD "Job Loss" journey: split 50/50 before March 15, 80/20 after).

This story also extends Story 3.2's `BufferBucket` config with a required `targetDate: ISO date` field. Buffer top-ups use a date-driven monthly fill rate: `(target − balance) ÷ monthsBetween(asOf, targetDate)`. When the targetDate has passed and the buffer is below target, the calculator returns `Result.fail` with a clear path-cited message — the user is expected to refresh `targetDate` before the calculator can proceed (the "drained-buffer requires new deadline" semantics the user requested).

### Maintenance sub-loop (§ 6.7) — user-handled in parallel

Per the user's "skip the maintenance sub-loop, I'm doing it in parallel already" instruction, the maintenance checklist is being run separately and is not blocking story-3.4 planning. A new Dependabot dev-deps PR (`dependabot/npm_and_yarn/dev-dependencies-ac3af5607b`) is in flight on the remote — assumed to be triaged by the user as part of their parallel sub-loop.

### Retro action items applied to this plan

- **(3.3 retro action B — Sonnet sanity check on assertion strength)** Property-test section explicitly mandates the "would this fail if I introduced the named defect?" mental check before each property-test commit.
- **(3.3 retro action D — recording-fake vs witness selection)** SafeTransferCalculator has three port-like constructor dependencies (`SplitRulesService`, `BufferStateService`, `RecurringForecastService`). The recording-fake pattern from Story 3.2 commit `59639e1` applies cleanly here — a recording fake substitutes one of the three services and asserts on the date arguments forwarded into `getSplitsAsOf` / `getStateAsOf` / `forecastBetween`. This is the honest pattern given the architecture; we do NOT fall back to witness-based for these wirings.
- **(3.3 retro action A — respect plan-prescribed slice splits)** Slicing below is intentionally split for TDD pacing. Sonnet should NOT aggregate slices even if helper code makes one-shot easy.

## Acceptance Criteria

**Given** an `accounting.yaml` with valid splits (3.1), buffers with `targetDate` (3.2 + this story), and recurring rules (3.3),
**When** I call `SafeTransferCalculator.calculateForWindow(asOf, from, to)` with three ISO 8601 dates and `from <= to`,
**Then** it returns `Result.ok(SafeTransferCalculation)` shaped as:

```typescript
interface SafeTransferCalculation {
  readonly totalRequired: Money;
  readonly perPartner: ReadonlyMap<string, Money>;
  readonly lineItems: readonly LineItem[];
}

interface LineItem {
  readonly kind: 'forecast' | 'buffer-topup';
  readonly date: string;                              // ISO 8601 YYYY-MM-DD
  readonly category: string;                          // forecast: rule.category; buffer-topup: bucket.name
  readonly description: string;                       // forecast: rule.name; buffer-topup: `${bucket.name} top-up`
  readonly gross: Money;
  readonly perPartnerSplit: ReadonlyMap<string, Money>;
}
```

**And** for each `ForecastOccurrence` returned by `RecurringForecastService.forecastBetween(from, to)`:
- One `LineItem` is emitted with `kind: 'forecast'`, `date = occurrence.expectedDate`, `category = rule.category`, `description = rule.name`, `gross = occurrence.amount`.
- `perPartnerSplit` is computed via `gross.allocate(ratios)` where `ratios` come from `splitRulesService.getSplitsAsOf(occurrence.expectedDate)`. Largest Remainder Method (already encapsulated by `Money.allocate`) ensures `sum(perPartnerSplit) === gross` to the cent.

**And** for each buffer bucket whose `balance < target` as of `asOf`:
- If `asOf >= targetDate`, the calculator returns `Result.fail("buffer "<name>" is below target (€X.XX) and its targetDate (YYYY-MM-DD) has passed — set a new targetDate")`. No partial computation; the entire calculation fails.
- Else: `monthlyFills = shortfall.allocate(monthsRemaining)` where `shortfall = target − balance` and `monthsRemaining = monthsBetween(asOf, targetDate)` (calendar-month-count, ≥ 1 since `asOf < targetDate`). For each calendar-month-start `m` in `[from, to]` such that `m < targetDate` AND `index < monthsRemaining`:
  - Emit a `LineItem` with `kind: 'buffer-topup'`, `date = m`, `category = bucket.name`, `description = "${bucket.name} top-up"`, `gross = monthlyFills[index]` (where `index` is the offset from the first month at or after `asOf`).
  - `perPartnerSplit = gross.allocate(splitRulesService.getSplitsAsOf(m).rules.map(r => r.ratio))`.

**And** if `balance >= target` for a buffer (no shortfall), the calculator emits no line items for that buffer regardless of `targetDate` state.

**And** `totalRequired = sum(lineItem.gross)` and `perPartner.get(p) = sum(lineItem.perPartnerSplit.get(p))` over all line items, with empty-buffer / empty-recurring producing `totalRequired = 0` and per-partner = `0` for every partner declared in the config (every partner in the splits roster appears in `perPartner` even with zero contribution).

**And** line items are sorted ascending by `date`; ties broken by `kind` (`'buffer-topup'` before `'forecast'`) then `category`, for deterministic output across runs.

**And** if `from`, `to`, or `asOf` is not ISO 8601 `YYYY-MM-DD`, or `from > to`, the calculator returns `Result.fail` with a clear message.

**And** `calculateForWindow` is pure: it never reads the system clock — re-running with the same `(asOf, from, to)` and the same config yields byte-identical output regardless of `Date.now()`.

**And** the YAML is rejected at parse with a path-cited Zod error if any `BufferBucket` is missing `targetDate`, or `targetDate` is not ISO 8601 `YYYY-MM-DD`. (`targetDate` may equal or precede `asOf` at calc time; that is the calculator's runtime concern, not the parser's.)

## Production-code surface (R2)

- `BufferBucket` (modified at `src/core/config/app-config.ts`): adds `readonly targetDate: string` (ISO 8601 `YYYY-MM-DD`).
- `BufferBucketRawSchema` (modified at `src/infra/config/config-schema.ts`): adds `targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, ...)`.
- `LineItem` (new) at `src/core/transfer/line-item.ts`: shape per AC above.
- `SafeTransferCalculation` (new) at `src/core/transfer/safe-transfer-calculation.ts`: shape per AC above.
- `SafeTransferCalculator` (new) at `src/core/transfer/safe-transfer-calculator.ts`: constructor takes `(splitsService: SplitRulesService, buffersService: BufferStateService, forecastService: RecurringForecastService, partnerRoster: readonly string[])`. (The roster is needed so empty-config calls still emit a per-partner key for every partner; the calculator itself does not parse splits.) Public method: `calculateForWindow(asOf: string, from: string, to: string): Result<SafeTransferCalculation>`. ~70–90 LOC; if it exceeds 50 LOC, extract `buildForecastLineItems` and `buildBufferTopupLineItems` helpers (per Story 3.3 retro precedent).
- `monthsBetween(from: string, to: string): number` (new internal helper) at `src/core/transfer/date-arithmetic.ts`: calendar-month-count from `from` to `to`, computed as `(toYear - fromYear) * 12 + (toMonth - fromMonth)` adjusted for day-of-month so May 15 → Dec 1 = 6 (not 7). Pure; no clock.
- `enumerateMonthStarts(from: string, to: string): readonly string[]` (new internal helper) in the same file: list of first-of-month dates in `[from, to]`. Used to anchor buffer-topup line items.

YAML format change: every `BufferBucket` MUST now declare `targetDate`. `accounting.example.yaml` updated alongside; existing test fixtures that construct `BufferBucket` instances must be migrated in slice 3 (mirrors the Story 3.2 `account` field migration).

No CLI changes (Story 3.5 wires the `accounting status` command). No schema migrations. No new ports / adapters.

## Tool-bundle import audit (R3)

No new framework / library entering deps. Reuses: `dinero.js` (Money + allocation), `zod` (BufferBucket schema extension), `vitest` + `fast-check` (tests), `quickpickle` (BDD). N/A.

## Slicing — 8 commits (R13), pre-prescribed

Per Story 3.3 retro action item A: Sonnet must NOT aggregate slices even if helper code makes single-shot easy. The TDD pacing below is deliberate.

1. **`test(transfer): SafeTransferCalculator acceptance feature — failing` (story-3.4)**. Create `tests/features/safe-transfer.feature` with all 5 scenarios (see below). Create `tests/features/steps/safe-transfer.steps.ts` skeleton. Acceptance run RED.

2. **`test(buffers): targetDate field on BufferBucket — failing` (story-3.4)**. Unit tests in `config-schema-buffers.test.ts` (or extend the existing `config-schema.test.ts`): targetDate required, ISO format, missing field error path-cited. Tests RED.

3. **`feat(buffers): targetDate field on BufferBucket — minimal green` (story-3.4)**. Add `targetDate` to `BufferBucketRawSchema` + `BufferBucket` type. Update `accounting.example.yaml` and **all existing test fixtures** that construct buffers (Story 3.2 added `account`; same migration pattern). Acceptance feature still RED on calculator scenarios; targetDate-related parse scenario flips GREEN if one is added.

4. **`test(transfer): forecast-only happy path with per-occurrence splits — failing` (story-3.4)**. Unit tests + property tests for the forecast-only path (no buffer top-ups; empty buffers config). Property tests #1–#3 (per-occurrence split application, totals consistency, recording-fake on `forecastBetween`). Tests RED.

5. **`feat(transfer): SafeTransferCalculator forecast-only — minimal green` (story-3.4)**. Build `safe-transfer-calculator.ts` with constructor + `calculateForWindow`. Forecast path only — no buffer logic yet. Empty-buffer-config branch returns no buffer-topup line items. Acceptance scenarios "forecast-only window" + "per-occurrence split" + "ISO date validation" + "from > to rejected" flip GREEN.

6. **`test(transfer): buffer top-up + stale-targetDate failure — failing` (story-3.4)**. Unit tests + property tests for the buffer-topup path: monthly fill rate matches `(target - balance) / monthsBetween`; line items dated first-of-month; stale-targetDate (asOf >= targetDate AND balance < target) returns `Result.fail`; balance >= target produces no line items regardless. Property tests #4 (Largest-Remainder allocation across months) and #5 (no buffer-topup when `balance >= target`). Tests RED.

7. **`feat(transfer): buffer top-up + stale-targetDate handling — minimal green` (story-3.4)**. Implement `buildBufferTopupLineItems`. Add `monthsBetween` and `enumerateMonthStarts` helpers in `date-arithmetic.ts`. Stale-targetDate produces `Result.fail` with the path-cited message. Acceptance scenarios "buffer top-up over multi-month window" + "stale-targetDate failure" flip GREEN.

8. **`refactor(transfer): cleanup or empty — green` (story-3.4)** — runs lint/build/test, verifies branch coverage on `src/core/transfer/` is 100% (manual enumeration; same convention as Stories 3.2/3.3). Empty-commit body if no actionable cleanup surfaces: *"branch coverage on src/core/transfer/ verified at 100%; no extract / rename / dedupe candidates surfaced. Empty per R11."* Helper extraction (`buildForecastLineItems`, `buildBufferTopupLineItems`) lands here if the calculator method exceeds 50 LOC.

## Acceptance scenarios (Gherkin)

Five scenarios, all in-process. The calculator depends on three constructor-injected services — for in-process tests, real implementations are wired against in-memory configs (no SQL, no FS).

```gherkin
Feature: Safe monthly transfer calculator (Story 3.4)

  Scenario: forecast-only window with stable splits
    Given a config with one split window:
      | validFrom  | partner | ratio |
      | 2024-01-01 | Alex    | 0.6   |
      | 2024-01-01 | Sam     | 0.4   |
    And one recurring rule:
      | name    | category      | cadence | amount | validFrom  |
      | Netflix | Subscriptions | monthly | 12.99  | 2026-01-15 |
    And no buffer buckets
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-05-31"
    Then the result is success
    And totalRequired is 12.99 EUR
    And Alex contributes 7.79 EUR and Sam contributes 5.20 EUR
    And lineItems lists exactly:
      | kind     | date       | category      | gross     |
      | forecast | 2026-05-15 | Subscriptions | 12.99 EUR |
    # fails if forecast composition is wrong, allocation drifts (sum ≠ gross), or partner names misalign with the split rules.

  Scenario: split rule changes mid-window — per-occurrence application
    Given a config with two split windows:
      | validFrom  | partner | ratio |
      | 2024-01-01 | Alex    | 0.5   |
      | 2024-01-01 | Sam     | 0.5   |
      | 2026-05-15 | Alex    | 0.8   |
      | 2026-05-15 | Sam     | 0.2   |
    And one recurring rule:
      | name | category | cadence | amount | validFrom  |
      | Rent | Rent     | monthly | 1000   | 2024-01-01 |
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-06-30"
    Then lineItems shows the May 1 occurrence split 50/50 (Alex 500, Sam 500)
    And lineItems shows the June 1 occurrence split 80/20 (Alex 800, Sam 200)
    # fails if a single split is applied to all occurrences instead of per-occurrence lookup.

  Scenario: buffer top-up across a multi-month window
    Given a config with one split window:
      | validFrom  | partner | ratio |
      | 2024-01-01 | Alex    | 0.5   |
      | 2024-01-01 | Sam     | 0.5   |
    And one buffer:
      | name     | account                | target | targetDate | currentBalance |
      | Vacation | assets:buffer:vacation | 1200   | 2026-12-01 | 0              |
    And no recurring rules
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-08-31"
    Then totalRequired is approximately 4 monthly fills toward the 1200 EUR target
    And lineItems contains 4 buffer-topup entries dated 2026-05-01, 2026-06-01, 2026-07-01, 2026-08-01
    And each buffer-topup is split 50/50 between Alex and Sam (Largest Remainder absorbs penny rounding)
    # fails if the monthly fill rate ignores monthsBetween, or line items skip a month, or splits aren't applied per-month.

  Scenario: stale targetDate with shortfall fails the calculation
    Given a config with one buffer:
      | name | account            | target | targetDate | currentBalance |
      | Car  | assets:buffer:car  | 500    | 2026-04-01 | 200            |
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-05-31"
    Then the result is failure
    And the error contains "Car" and "2026-04-01" and the phrase "set a new targetDate"
    # fails if the calculator silently produces zero or attempts to fill in one month when the deadline has passed.

  Scenario: buffer at or above target produces no line items even with a stale targetDate
    Given a config with one buffer:
      | name | account            | target | targetDate | currentBalance |
      | Car  | assets:buffer:car  | 500    | 2026-04-01 | 600            |
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-05-31"
    Then the result is success
    And totalRequired is 0 EUR
    And lineItems is empty
    # fails if the stale-targetDate check fires when no shortfall exists, or if over-funding generates negative line items.
```

## Property tests (fast-check, DoD #3)

Co-located with unit tests in `tests/unit/core/transfer/safe-transfer-calculator.test.ts` and `tests/unit/core/transfer/date-arithmetic.test.ts`.

**Sonnet sanity check (per Story 3.3 retro action B):** before committing each property test, mentally introduce the named defect and confirm the assertion fails. Vacuous assertions (e.g., `% 1 === 0`) and assertions that re-derive the same bug as the SUT will not pass this check.

1. **Per-occurrence split application** — for any config with N splits at different `validFrom` dates and any forecast occurrence whose `expectedDate` straddles a split boundary: the line item's `perPartnerSplit` matches `Money.allocate(occurrence.amount, getSplitsAsOf(occurrence.expectedDate).rules.map(r => r.ratio))`. (Defect class: applying a single split to the total. The assertion fails iff the actual perPartnerSplit equals the per-occurrence split, so any global-split implementation produces a ratio mismatch on a boundary date.)
2. **Total consistency** — for any successful calculation: `sum(lineItem.gross) === totalRequired` AND for every partner `p`, `sum(lineItem.perPartnerSplit.get(p)) === perPartner.get(p)`. (Defect class: aggregation arithmetic drift. Vacuous if compared against a re-derivation; instead, sum-via-Money.add over the line items and compare against the calculator's reported totals via `Money.equals`.)
3. **Recording-fake wiring (retro action D)** — substitute the `RecurringForecastService` with a recording fake that captures the `(from, to)` arguments and asserts `observedFrom === from && observedTo === to`. Substitute `SplitRulesService` with a recording fake that captures every `getSplitsAsOf(date)` call and asserts each `date` is one of the line-item dates. Substitute `BufferStateService` similarly for `getStateAsOf(asOf)`. Each fake returns deterministic test data; the assertion is on what the calculator forwards, not on what comes back. (Defect class: argument drop, swap, or hardcoding.)
4. **Buffer Largest-Remainder over months** — for any `(target, balance, monthsRemaining)` with `target > balance` and `monthsRemaining ≥ 1`: the sum of buffer-topup line items' `gross` over the full month set (asOf + 0..monthsRemaining-1) equals `target - balance` to the cent. (Defect class: integer division losing pennies. Witness: `target=100, balance=0, monthsRemaining=3 → 33.34, 33.33, 33.33` per LRM, summing to exactly 100.)
5. **No buffer-topup when balance >= target** — for any buffer with `balance >= target` AND any window AND any targetDate (past, present, or future): no `'buffer-topup'` line items reference that bucket. (Defect class: top-up logic ignoring the shortfall guard or treating `balance == target` as below.)
6. **Stale targetDate fails iff balance < target** — for any `(target, balance, asOf, targetDate)` with `targetDate <= asOf`: the calculation fails with a path-cited error mentioning the bucket name iff `balance < target`. If `balance >= target`, the calculation succeeds and emits no line items for that bucket. (Defect class: stale-check fires unconditionally vs only-when-shortfall.)
7. **Output sort stability** — `lineItems` are sorted ascending by `date`; ties broken by `(kind, category)`. Property: shuffling the input ordering of buffers and recurring rules in the config produces byte-identical `lineItems` output. (Defect class: implicit input-order dependency.)
8. **Purity / no system clock** — source files in `src/core/transfer/` MUST NOT contain `Date.now`, `new Date()` (parameterless), or `performance.now`. Asserted via regex on file contents (mirror Stories 3.2/3.3 convention). `new Date(string)` for ISO parsing IS allowed.

## Files touched

| Path | Change |
| --- | --- |
| [src/core/config/app-config.ts](src/core/config/app-config.ts) | add `targetDate: string` to `BufferBucket` |
| [src/infra/config/config-schema.ts](src/infra/config/config-schema.ts) | add `targetDate` regex to `BufferBucketRawSchema` |
| [accounting.example.yaml](accounting.example.yaml) | add `targetDate:` to both example buffers |
| `src/core/transfer/safe-transfer-calculator.ts` | NEW service |
| `src/core/transfer/safe-transfer-calculation.ts` | NEW result interface |
| `src/core/transfer/line-item.ts` | NEW interface |
| `src/core/transfer/date-arithmetic.ts` | NEW helpers (`monthsBetween`, `enumerateMonthStarts`) |
| `tests/features/safe-transfer.feature` | NEW (5 scenarios) |
| `tests/features/steps/safe-transfer.steps.ts` | NEW step bindings |
| `tests/features/steps/index.ts` | register new steps file |
| `tests/unit/infra/config/config-schema.test.ts` | extend with `targetDate` validation tests |
| `tests/unit/core/transfer/safe-transfer-calculator.test.ts` | NEW unit + property tests |
| `tests/unit/core/transfer/date-arithmetic.test.ts` | NEW unit + property tests |
| Existing fixtures referencing `BufferBucket` | migrate to add `targetDate` (Story 3.2 added `account` — same pattern; expect ~5 fixture files) |

No CLI / `program.ts` change → R4 (composition-root subprocess test) does not apply.

## Reuse map

- `SplitRulesService` ([src/core/splits/split-rules-service.ts](src/core/splits/split-rules-service.ts)) — direct constructor dependency; per-occurrence calls via `getSplitsAsOf(date)`.
- `BufferStateService` ([src/core/buffers/buffer-state-service.ts](src/core/buffers/buffer-state-service.ts)) — direct constructor dependency; single call `getStateAsOf(asOf)` for current balances.
- `RecurringForecastService` ([src/core/recurring/recurring-forecast-service.ts](src/core/recurring/recurring-forecast-service.ts)) — direct constructor dependency; single call `forecastBetween(from, to)`.
- `Money.allocate(ratios)` ([src/core/shared/money.ts](src/core/shared/money.ts)) — Largest Remainder for per-partner splits AND for spreading a buffer shortfall across months. Already returns `Result<Money[]>` with the LRM guarantee.
- `Money.add` for aggregation. `Money.subtract` for shortfall computation (`target - balance`).
- `Result.all` combinator — for chaining per-occurrence and per-buffer line-item construction without losing failures.
- Recording-fake pattern from Story 3.2 commit `59639e1` — applied verbatim to the three constructor-injected services in property test #3.
- `findDuplicateIndices` helper precedent (config-schema.ts) — not reused here (no new uniqueness constraint), but a reminder of the path-cited error idiom.
- ISO date regex `/^\d{4}-\d{2}-\d{2}$/` — copy verbatim from the existing services.

## Verification (end-to-end)

1. `npm run lint && npm run build && npm test` — clean.
2. `npm test` — all unit + integration + acceptance green; fast-check runs ≥ 100 iterations on each property.
3. `npm run test -- tests/features/safe-transfer.feature` — all 5 scenarios green.
4. Manual: edit `accounting.example.yaml` to copy/rename to `accounting.yaml` with a Netflix + Rent recurring trio, two buffers (Vacation, Car) with future and past targetDates, two splits (Alex 0.6, Sam 0.4). Write a one-off scratch script that constructs the three services + calculator and prints `calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31')`. Confirm:
   - `totalRequired` equals the sum of forecast occurrences in May plus the May share of each buffer's monthly fill.
   - `perPartner.Alex + perPartner.Sam === totalRequired`.
   - `lineItems` lists every May forecast occurrence + the buffer-topup line for May 1 per buffer (or fails on the stale Car targetDate).
5. Branch coverage on `src/core/transfer/` = 100% (manual enumeration; same convention as Story 3.2/3.3).
6. Grep `src/core/transfer/` for `Date\.now|new Date\(\s*\)|performance\.now` — must be empty (purity invariant).

## Blind spots (acknowledged)

- **`monthsBetween` calendar arithmetic precision.** Defining "calendar months between two dates" cleanly requires a deliberate convention. We use: `monthsBetween(from, to) = (toYear − fromYear) × 12 + (toMonth − fromMonth) − (toDay < fromDay ? 1 : 0)`. So `2026-05-15 → 2026-12-01 = 6` (not 7), and `2026-05-15 → 2026-12-15 = 7`. Property-tested.
- **Buffer-topup line items dated to first-of-month.** A buffer fill conceptually contributes throughout the month; choosing first-of-month is conventional. Forecast occurrences keep their actual `expectedDate`. The mixed dating means a buffer-topup line dated `2026-05-01` and a forecast line dated `2026-05-15` sort with the buffer first — captured in the deterministic-sort property.
- **Empty splits roster.** The calculator constructor takes `partnerRoster: readonly string[]`. If empty, `perPartner` is empty too. The CLI / Story 3.5 should reject empty rosters at config-load (the splits Zod schema already requires ≥ 2 partners per window — see Story 3.1), so an empty roster reaching the calculator means a programming error. The calculator does not double-validate; it trusts the construction site.
- **Money allocation pennies in aggregate per-partner sums.** Each line item's `perPartnerSplit` sums to the line item's `gross` exactly (LRM guarantee). The aggregate `perPartner.get(p) = Σ lineItem.perPartnerSplit.get(p)` is consistent with `totalRequired = Σ lineItem.gross` because addition is exact in cents. So `Σ perPartner.values() === totalRequired` always holds — covered by property #2.
- **Buffer-topup when window starts mid-month.** If `from = 2026-05-15`, the first buffer-topup line item is `2026-06-01` (the first calendar-month-start ≥ `from`). The May fill rate is implicitly skipped. This is acceptable because `asOf` is the calc anchor, not `from`; the actual fill schedule is `asOf, asOf+1mo, …`. If the user wanted a partial-May contribution, they should set `from = 2026-05-01`. Documented here so reviewer can confirm at Phase 4.
- **No variance reporting.** Comparing forecast to actual ledger transactions (PRD's "<5% variance" success metric) is not in scope. Story 3.5 (Status CLI) may surface variance separately; the calculator output is purely prospective.
- **No "joint account net out".** The calculator computes the gross transfer; it does not subtract any current joint-account balance. Net-out semantics are deferred to a future story (or to the CLI's display layer).
- **Buffer-topup date interleaving with month-end forecasts.** A buffer-topup on `2026-05-01` and a forecast on `2026-05-31` both belong to "May" — the deterministic sort places the topup first by date. Story 3.5 may want to group by month for display; that's the CLI's concern.

## Out of scope

- CLI `accounting status` command (Story 3.5).
- Variance reporting against ledger actuals.
- "Conversational CFO" human-readable explanations (Story 3.5 / FR19).
- Buffer drain modeling (when a buffer is spent, the calculator just sees the lower balance via `BufferStateService`; it does not track drain events).
- Joint-account current balance subtraction.
- Per-rule currency / forex.
- Auto-detection of buffer drawdown to prompt for a new `targetDate` (the calculator surfaces the failure; the CLI / interactive layer can prompt for the new date).
- "Catch-up" projections (PRD's "+$100 catch-up for Winter Heating" — that's a higher-tier composition over forecast variance, not a primitive of this story).
