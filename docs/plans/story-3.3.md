# Story 3.3 — Recurring Cost Forecast

## Context

Epic 3 (Liquidity Engine & Settlement) needs to know **what fixed costs will hit the joint accounts in the coming weeks/months** before Story 3.4 (Safe Monthly Transfer Calculator) can compute fair pre-funding amounts. Today, recurring costs (rent, subscriptions, insurance premiums, utilities) live only as historical transactions in the ledger — there is no model of "what's coming." Story 3.3 closes this gap.

It ships a pure Core domain service `RecurringForecastService` that, given a date window `[from, to]`, returns the time-series of forecasted occurrences from a new YAML-configured `recurring:` section — one occurrence per recurring rule per scheduled cadence step inside the window. No ledger reads (Story 3.4 owns variance/validation against actuals). Mirrors `SplitRulesService` (Story 3.1) in spirit — pure, ISO-date keyed, no clock read — and uses the validity-window discipline established in CLAUDE.md § 3.

The `recurring:` schema admits per-rule `validFrom` + optional `validTo` + optional `amendments[]` for amount changes (rent goes up; insurance premium adjusts) — chosen over Story 3.1's whole-window-at-once shape because subscriptions and rent contracts have independent lifecycles.

### Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning
- ✓ Working tree clean; `main` synced (Story 3.2 just merged at `676c54e`)
- ✓ Open issues (10 — 6 deferred suggestions + 3 ingest-UX stories #73/#74/#75 + 1 perf #77): none block 3.3
- ✓ Open PR [#78](https://github.com/xavierbriand/accounting/pull/78) (story-A inline-category) is on a worktree branch and touches `src/cli/commands/ingest-command.ts`; 3.3 doesn't touch CLI — no conflict expected
- ✓ `npm audit --audit-level=high` → 0 vulnerabilities
- → Proceed to planning

## Acceptance Criteria

**Given** an `accounting.yaml` config with a `recurring:` section listing one or more rules, each with `name` (unique), `category`, `cadence` ∈ `{monthly, quarterly, annual}`, `amount` (positive), `validFrom` (ISO 8601 `YYYY-MM-DD`), optional `validTo`, optional `amendments: [{ validFrom, amount }]`,
**When** I ask the `RecurringForecastService` for `forecastBetween(from, to)` with two ISO 8601 dates,
**Then** it returns `Result.ok(readonly ForecastOccurrence[])` — one entry per rule per scheduled cadence step whose date lies in the closed interval `[from, to]` AND in the rule's lifecycle `[validFrom, validTo]` (or `[validFrom, +∞)` if `validTo` is absent).

**And** each `ForecastOccurrence` has shape `{ name, category, expectedDate: string, amount: Money }`. Output sorted ascending by `expectedDate`; ties broken by config order (rules sorted by index in the YAML array).

**And** `expectedDate` is computed by stepping from `validFrom` by the rule's cadence:
- `monthly` → +1 calendar month per step
- `quarterly` → +3 calendar months per step
- `annual` → +12 calendar months (+1 calendar year) per step

**And** day-of-month overflow is **clamped to the last valid day of the target month** without rebound (`2024-01-31` monthly → `2024-02-29`, `2024-03-31`, `2024-04-30`, `2024-05-31`, …; `2024-02-29` annual → `2025-02-28`, `2026-02-28`, `2027-02-28`, `2028-02-29`).

**And** `amount` for an occurrence dated `d` is the `amount` of the latest entry in `[{ validFrom: rule.validFrom, amount: rule.amount }, ...rule.amendments]` whose `validFrom` is `<= d` (amendments inclusive on their `validFrom`). All amounts are in `defaultCurrency`.

**And** if `from > to`, or either is not ISO 8601 `YYYY-MM-DD`, or the YAML fails any of the validation rules below, the read returns `Result.fail` with a path-cited message (no Zod-internal type names, no PII).

**And** the YAML is rejected at parse with a path-cited error if:
- two rules share the same `name`,
- `cadence` is not in the enum,
- `amount` (rule or amendment) is not positive,
- `validTo < validFrom` for a rule,
- amendments are not strictly ascending by `validFrom`,
- the first amendment's `validFrom` is not strictly after the rule's `validFrom`,
- `validTo` is set and the last amendment's `validFrom` is `>= validTo` (an amendment that never applies),
- any date string is not ISO 8601 `YYYY-MM-DD`.

**And** an empty `recurring: []` config is valid — the forecast over any window returns `Result.ok([])`.

**And** `forecastBetween` is pure: it never reads the system clock — re-running with the same `(from, to)` yields byte-identical output regardless of `Date.now()`.

## Production-code surface (R2)

- `RecurringRule` (new) at `src/core/config/app-config.ts`: `{ readonly name: string; readonly category: string; readonly cadence: 'monthly' | 'quarterly' | 'annual'; readonly amount: Money; readonly validFrom: string; readonly validTo?: string; readonly amendments: readonly RecurringAmendment[] }`.
- `RecurringAmendment` (new): `{ readonly validFrom: string; readonly amount: Money }`.
- `RecurringCadence` (new) at the same module: type alias for the three-value union.
- `AppConfig` (modified): adds `readonly recurring: readonly RecurringRule[]`.
- `ForecastOccurrence` (new) at `src/core/recurring/forecast-occurrence.ts`: `{ readonly name: string; readonly category: string; readonly expectedDate: string; readonly amount: Money }`.
- `RecurringForecastService` (new) at `src/core/recurring/recurring-forecast-service.ts`: `forecastBetween(from: string, to: string): Result<readonly ForecastOccurrence[]>`. Constructor: `(rules: readonly RecurringRule[])`.
- `cadence` helpers (new) at `src/core/recurring/cadence.ts` (~40 LOC): `nextOccurrence(date: string, cadence: RecurringCadence): string` (with day-of-month clamp) and `enumerateOccurrences(validFrom: string, validTo: string | undefined, cadence: RecurringCadence, windowFrom: string, windowTo: string): readonly string[]`. Pure; no system clock.

YAML format change: `recurring:` becomes a recognised top-level section. Empty array allowed; section missing entirely also allowed (defaults to `[]`).

No CLI changes; no schema migrations; no new ports / adapters (3.3 is config-only — confirmed by retro Try follow-up: validation is Story 3.4's job).

## Tool-bundle import audit (R3)

No new framework / library entering deps. Reuses: `dinero.js` (Money), `zod` (schema), `vitest` + `fast-check` (tests), `quickpickle` (BDD). Date arithmetic is hand-rolled in `cadence.ts` using the built-in `Date` (parsing ISO strings only; never reading the system clock — the `// fails if` purity property covers this). N/A.

## Slicing — 10 commits (R13), pre-prescribed

Compressions and split points were pre-prescribed per the Story 3.2 retro Try B (no "may compress" hand-offs to the implementer).

1. **`test(recurring): forecast acceptance feature — failing` (story-3.3)** + steps stub. Create `tests/features/recurring-forecast.feature` with all six scenarios (see below). Create `tests/features/steps/recurring-forecast.steps.ts` skeleton. No service yet — scenarios fail with `Result.fail "service not implemented"` (R10 green-on-landing for the stub itself, but the feature is RED). All six scenarios use a fake-free path (no `BufferLedgerQuery`-style adapter; service is config-only).

2. **`test(recurring): YAML schema + lifecycle + duplicate-name validation — failing` (story-3.3)**. Unit tests in `tests/unit/infra/config/config-schema.test.ts` covering: required fields, cadence enum, positive amounts, validFrom/validTo ordering, amendments strictly ascending, first amendment > rule.validFrom, last amendment < validTo (when validTo set), duplicate names, ISO date format. Tests RED.

3. **`feat(recurring): YAML schema + lifecycle + duplicates — minimal green` (story-3.3)**. Add `RecurringRuleRawSchema`, `RecurringAmendmentRawSchema`, plug into `RawConfigSchema` (as optional, default `[]`). superRefines: per-rule `validTo >= validFrom`, amendments ordering, duplicate names (mirrors existing `findDuplicateIndices` pattern). `parseRawConfig` converts decimals → `Money` like buffers do. Update `accounting.example.yaml`. Acceptance scenario "invalid YAML rejected at parse" flips GREEN.

4. **`test(recurring): RecurringForecastService monthly + ISO-date + range guards — failing` (story-3.3)**. Unit tests + 3 fast-check property tests (occurrence count, ISO_DATE guard, `from > to` guard). Tests RED.

5. **`feat(recurring): RecurringForecastService monthly + range guards — minimal green` (story-3.3)**. Service + a thin `cadence.ts` (`nextOccurrence` for monthly + `enumerateOccurrences`). Implements ISO_DATE regex check on `from` and `to`, `from > to` failure, monthly cadence enumeration with day-of-month clamp, output sort. Acceptance scenarios "monthly forecast over a window" + "ISO date validation" + "from > to rejected" flip GREEN.

6. **`test(recurring): amendments + validTo lifecycle — failing` (story-3.3)**. Unit tests + property tests: amendment selection (`amount(d)` is the latest amendment with `validFrom ≤ d` else `rule.amount`); `validTo` excludes occurrences strictly after; the rule's lifecycle interval is closed on both ends. Tests RED.

7. **`feat(recurring): amendments + validTo support — minimal green` (story-3.3)**. Extend the service to honour `validTo` (cut the enumeration there) and to select per-occurrence amount via the latest amendment. Acceptance scenarios "amendments shift amount mid-window" + "validTo expires the rule" flip GREEN.

8. **`test(recurring): quarterly + annual + DoM clamp — failing` (story-3.3)**. Unit tests + property test on cadence-step lengths and clamp determinism (e.g., `validFrom: 2024-02-29` annual → 2025-02-28, 2026-02-28, 2027-02-28, 2028-02-29).

9. **`feat(recurring): quarterly + annual + DoM clamp — minimal green` (story-3.3)**. Extend `cadence.ts` to handle the three cadences. Acceptance scenarios "quarterly cadence" + "annual cadence with leap-year clamp" flip GREEN.

10. **`refactor(recurring): cleanup or empty — green` (story-3.3)** — runs `npm run lint && npm run build && npm test`, then verifies branch coverage on `src/core/recurring/` is 100% via manual enumeration (no `@vitest/coverage-v8` installed yet — same convention as Story 3.2 slice 8). Empty-commit body if no actionable cleanup surfaces: *"branch coverage on src/core/recurring/ verified at 100%; no extract / rename / dedupe candidates surfaced. Empty per R11."*

## Acceptance scenarios (Gherkin)

Six scenarios, all in-process (no port, no adapter — pure config service). The Story 3.2 retro R7 step-wiring split (real adapter for SQL claims, fake otherwise) does not apply here because there is no SQL layer to honestly exercise.

```gherkin
Feature: Recurring cost forecast (Story 3.3)

  Scenario: monthly forecast over a window with no amendments and no validTo
    Given a config with one recurring rule:
      | name    | category      | cadence | amount | validFrom  |
      | Netflix | Subscriptions | monthly | 12.99  | 2026-01-15 |
    When I forecast between "2026-03-01" and "2026-05-31"
    Then the result is success
    And the forecast lists exactly:
      | name    | expectedDate | amount     |
      | Netflix | 2026-03-15   | 12.99 EUR  |
      | Netflix | 2026-04-15   | 12.99 EUR  |
      | Netflix | 2026-05-15   | 12.99 EUR  |
    # fails if cadence stepping is wrong, window bounds aren't inclusive, or sort order drifts.

  Scenario: amendments shift amount mid-window
    Given a config with one recurring rule:
      | name | category | cadence | amount | validFrom  |
      | Rent | Rent     | monthly | 1000   | 2024-01-01 |
    And rule "Rent" has amendments:
      | validFrom  | amount |
      | 2026-07-01 | 1050   |
    When I forecast between "2026-05-01" and "2026-09-30"
    Then the forecast lists exactly:
      | name | expectedDate | amount      |
      | Rent | 2026-05-01   | 1000.00 EUR |
      | Rent | 2026-06-01   | 1000.00 EUR |
      | Rent | 2026-07-01   | 1050.00 EUR |
      | Rent | 2026-08-01   | 1050.00 EUR |
      | Rent | 2026-09-01   | 1050.00 EUR |
    # fails if amendment selection picks the wrong tier on the boundary, or applies amendments before validFrom.

  Scenario: validTo expires the rule mid-window
    Given a config with one recurring rule:
      | name      | category      | cadence | amount | validFrom  | validTo    |
      | OldStream | Subscriptions | monthly | 9.99   | 2025-03-15 | 2026-08-15 |
    When I forecast between "2026-06-01" and "2026-10-31"
    Then the forecast lists exactly:
      | name      | expectedDate | amount    |
      | OldStream | 2026-06-15   | 9.99 EUR  |
      | OldStream | 2026-07-15   | 9.99 EUR  |
      | OldStream | 2026-08-15   | 9.99 EUR  |
    # fails if validTo is treated as exclusive (Aug-15 row missing) or ignored entirely (Sep-15 / Oct-15 leaking in).

  Scenario: quarterly cadence
    Given a config with one recurring rule:
      | name      | category  | cadence   | amount | validFrom  |
      | CarInsur  | Insurance | quarterly | 250    | 2026-01-15 |
    When I forecast between "2026-01-01" and "2026-12-31"
    Then the forecast lists expectedDates "2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15" each at 250.00 EUR
    # fails if quarterly stepping is wrong (e.g., +3 days instead of +3 months).

  Scenario: annual cadence with Feb-29 leap-year clamp
    Given a config with one recurring rule:
      | name        | category  | cadence | amount | validFrom  |
      | Domain      | Hosting   | annual  | 15     | 2024-02-29 |
    When I forecast between "2025-01-01" and "2028-12-31"
    Then the forecast lists expectedDates "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29" each at 15.00 EUR
    # fails if DoM overflow rebounds (e.g., 2025-02-28 → 2026-03-01) or fails to recover Feb-29 in the next leap year.

  Scenario: invalid YAML rejected at parse with a path-cited error
    Given a config where the second recurring rule has cadence "fortnightly"
    When the configuration is loaded
    Then loading fails with an error containing "recurring.1.cadence"
    # fails if the cadence enum is missing, or the path-citation drops the index.
```

## Property tests (fast-check, DoD #3)

Co-located with unit tests in `tests/unit/core/recurring/recurring-forecast-service.test.ts` and `tests/unit/core/recurring/cadence.test.ts`:

1. **Occurrence-count totality** — for any `(validFrom, validTo?, cadence, [from, to])` with `from ≤ to`, the number of occurrences equals `floor((min(validTo, to) − max(validFrom, from)) / cadenceStep) + 1` when the intersection is non-empty, else `0`.
2. **Boundary inclusivity on the window** — `expectedDate == from` is included; `expectedDate == to` is included.
3. **Amendment-amount selection** — for any `(rule, amendment_list, occurrence_date d)`, the chosen amount equals the amount of the latest entry in `[{validFrom: rule.validFrom, amount: rule.amount}, ...rule.amendments]` with `validFrom ≤ d`. Amendments inclusive on their `validFrom`.
4. **DoM clamp determinism** — `nextOccurrence` applied N times to a `validFrom` ending on day 29/30/31 produces a deterministic sequence; in particular, leap-year recovery on annual cadence (`2024-02-29 → 2025-02-28 → 2026-02-28 → 2027-02-28 → 2028-02-29`).
5. **Sort stability** — the `forecastBetween` output is sorted ascending by `expectedDate`; ties resolved by config index (verified by interleaving two rules whose occurrences land on the same date).
6. **Out-of-range window → empty forecast** — when the window is entirely after `validTo` or entirely before `validFrom`, output is `[]`.
7. **Purity / no system clock** — source of `src/core/recurring/recurring-forecast-service.ts` and `src/core/recurring/cadence.ts` MUST NOT contain `Date\.now`, `new Date\(\s*\)` (the parameterless form — `new Date(string)` for ISO parsing IS allowed), or `performance\.now`. Asserted via regex on the file contents.
8. **Service↔config wiring (recording-fake pattern, retro Try)** — the service forwards both `from` and `to` arguments verbatim into the cadence enumeration. A spy version of `enumerateOccurrences` (or equivalent) captures the values and asserts equality; protects against accidental drop or swap of arguments. (Mirrors the Story 3.2 Phase 4 fix that introduced this pattern.)

## Files touched

| Path | Change |
| --- | --- |
| [src/core/config/app-config.ts](src/core/config/app-config.ts) | add `RecurringRule`, `RecurringAmendment`, `RecurringCadence` types; add `recurring` to `AppConfig` |
| [src/infra/config/config-schema.ts](src/infra/config/config-schema.ts) | Zod `RecurringRuleRawSchema` + `RecurringAmendmentRawSchema` + plug into `RawConfigSchema`; superRefines + duplicate-name + amendment-ordering checks; `parseRawConfig` Money conversion |
| [accounting.example.yaml](accounting.example.yaml) | new `recurring:` example with one no-amendment rule and one rent-with-amendments rule |
| `src/core/recurring/forecast-occurrence.ts` | NEW interface `ForecastOccurrence` |
| `src/core/recurring/cadence.ts` | NEW pure helpers `nextOccurrence` + `enumerateOccurrences` + DoM clamp |
| `src/core/recurring/recurring-forecast-service.ts` | NEW service `RecurringForecastService.forecastBetween` |
| `tests/features/recurring-forecast.feature` | NEW (6 scenarios) |
| `tests/features/steps/recurring-forecast.steps.ts` | NEW step bindings (no port/adapter) |
| `tests/features/steps/index.ts` | register new steps file |
| `tests/unit/infra/config/config-schema.test.ts` | extend with `recurring:` validation tests |
| `tests/integration/infra/config/config-service.test.ts` | update YAML fixture to include `recurring:` (or empty `recurring: []` to keep tests minimal) |
| `tests/unit/core/recurring/recurring-forecast-service.test.ts` | NEW unit + property tests |
| `tests/unit/core/recurring/cadence.test.ts` | NEW unit + property tests for the cadence helpers |

No CLI / `program.ts` change → R4 (composition-root subprocess test) does not apply. No schema migration. No new ports / adapters.

## Reuse map

- `SplitRulesService` ([src/core/splits/split-rules-service.ts](src/core/splits/split-rules-service.ts)) — service shape (constructor DI, ISO_DATE regex, lexicographic compare, no clock read).
- `BufferStateService` ([src/core/buffers/buffer-state-service.ts](src/core/buffers/buffer-state-service.ts)) — `Result.all` failure propagation pattern, currency policy.
- `findDuplicateIndices` helper at [src/infra/config/config-schema.ts](src/infra/config/config-schema.ts) (used three times: `splits.rules.partner`, `buffers.name`, `buffers.account`) — duplicate-rule-name detection in `recurring:` follows the same path-cited shape.
- `Money.fromDecimal(amount, defaultCurrency)` at config-parse time, mirroring the buffers / amendments `target`/`cap` conversion.
- `dateStringArb` fast-check arbitrary in `tests/unit/core/splits/split-rules-service.test.ts` — copy verbatim into the recurring tests.
- Recording-fake pattern from Story 3.2 Phase 4 refactor commit `59639e1` — used for property test #8 above.

## Verification (end-to-end)

1. `npm run lint && npm run build && npm test` — clean.
2. `npm test` — all unit + integration + acceptance green; fast-check runs ≥ 100 iterations on each property.
3. `npm run test -- tests/features/recurring-forecast.feature` — all six scenarios green.
4. Manual: edit `accounting.example.yaml`, copy to `accounting.yaml` with a Netflix + Rent + Insurance trio, write a one-off scratch script that constructs the service and prints `forecastBetween('2026-04-01', '2026-12-31')`. Confirm 9 monthly Netflix occurrences + 9 monthly Rent (with the July amendment kicking in if configured) + 3 quarterly Insurance occurrences in date-ascending order.
5. Branch coverage on `src/core/recurring/` = 100% (manual enumeration; same convention as Story 3.2).
6. Grep `src/core/recurring/` for `Date\.now|new Date\(\s*\)|performance\.now` — must be empty (purity invariant).

## Blind spots (acknowledged)

- **Day-of-month overflow without rebound is opinionated.** A rule whose `validFrom` is 2024-01-31 will produce occurrences on Feb 29, Mar 31, Apr 30, May 31, Jun 30, … — i.e. the day-of-month "ratchet" stays at 31 and is clamped per month. Some calendar engines rebound (Feb 29 → Mar 1). We do not. Documented in the `cadence.ts` doc comment.
- **Annual leap-year recovery.** A rule whose `validFrom` is 2024-02-29 ratchets back to Feb 29 in the next leap year. `2024-02-29 → 2025-02-28 → 2026-02-28 → 2027-02-28 → 2028-02-29`. Property-tested.
- **Amendments cannot reduce to zero.** `amount: z.number().positive()` for both rules and amendments. To pause a subscription, end the original rule with `validTo` and start a new one with a later `validFrom` — this preserves the lifecycle audit trail.
- **No per-rule currency.** Amounts are in `defaultCurrency`. Forex is post-MVP per PRD.
- **No ledger reads.** `RecurringForecastService` is config-only. Variance vs actual transactions, "did Netflix actually charge in April?" detection, and "extra unexpected subscription found" alerts are Story 3.4's responsibility (or a later, dedicated story).
- **No occurrence dedup against the ledger.** A user who paid May rent early will see both the actual transaction (Story 3.2's data) and the forecasted May 1 occurrence in 3.3's output. Deduping is again 3.4's responsibility — 3.3 reports what *should* happen, not what *has* happened.
- **`new Date(string)` parsing edge.** `new Date('2026-13-01')` returns `Invalid Date` rather than throwing. The cadence helpers explicitly check `isNaN(date.getTime())` after parse and fail with a path-cited error rather than silently producing `'NaN-NaN-NaN'`. Property test covers a fast-check generator that includes invalid dates.

## Out of scope

- Auto-detecting recurring patterns from the ledger (`Subscriptions` category transactions every ~30 days).
- Variance reporting (`actualSoFar`, `varianceFromForecast`) — Story 3.4.
- "Already-settled" filtering against the ledger — Story 3.4.
- Per-rule currency / forex.
- "Catch-up" projections (PRD's "Includes +$100 catch-up for Winter Heating" example) — that's a settlement-tier concept, not a forecast-tier one.
- CLI rendering of the forecast — Story 3.5 territory.
