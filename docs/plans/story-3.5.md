# Story 3.5 — Status CLI Command

## Context

Last story of Epic 3. Wires the `accounting status` CLI command, the user-facing surface that exposes the four upstream services (Stories 3.1 split rules, 3.2 buffer state, 3.3 recurring forecast, 3.4 safe transfer calculator) as a single "Sunday Morning Audit" view. FR18 + FR19 + FR20 ship together: buffer table + transfer breakdown + forecast list, in human-readable Conversational-CFO-flavored output by default and machine-parsable JSON under `--json`.

Date injection is the piece that crosses the Core/CLI purity boundary: every upstream service is `Date.now()`-free; the CLI reads the system clock once at the boundary, normalizes to ISO `YYYY-MM-DD` in the configured timezone, and threads it as `asOf`. `--as-of <YYYY-MM-DD>` overrides for determinism / past-state inspection.

The default window is the next calendar month from `asOf` — `[first-of-next-month, last-of-that-month]`. `--from` / `--to` override for arbitrary windows. Calc failures (stale `targetDate`, etc. — Story 3.4 fail modes) do NOT abort the whole render: buffers render fine (they don't depend on the calculator), and the transfer section prints the calc error + a Suggested-action prose line. Exit code stays 0 when buffers rendered.

### Maintenance sub-loop (§ 6.7) run 2026-04-29 pre-planning
- ✓ Sibling-work check (R17): PR [#81](https://github.com/xavierbriand/accounting/pull/81) is a Dependabot dev-deps patch bump on `typescript-eslint`, unrelated; no open issues overlap with Story 3.5. Issue [#75](https://github.com/xavierbriand/accounting/issues/75) (Story C "remember rule") is **delivered by PR #84** but the issue itself is still `OPEN` on GitHub (PR didn't auto-close); will close out-of-band.
- ✓ Working tree clean; `main` synced to `ca8571e`. Story branch `story-3.5` opened.
- ✓ Open issues: 11. None block 3.5.
- ✓ `npm audit --audit-level=high` → 0 vulnerabilities.
- → Proceed to planning.

### Retro action items applied to this plan

- **(3.4 retro action A — resume-brief tightening)** N/A this story (no Sonnet kill yet); still relevant if a re-spawn happens.
- **(3.4 retro action D — generator-level floating-point hygiene)** N/A — Story 3.5 doesn't introduce new floating-point property tests. The composition tests assert on already-allocated `Money` values from Story 3.4's calculator; no new ratios at the test boundary.
- **(3.2 retro Try C — AC ↔ Gherkin ↔ slice cross-reference)** Applied during plan-revision after Phase 2 plan-reviewer findings: when adopting any rewrite, walk every section that references the changed concept.
- **(3.2 retro Try — recording-fake for service↔port wiring)** The CLI command takes the four services as constructor-injected dependencies; recording-fake property tests verify the CLI forwards `asOf`, `from`, `to` correctly into each service. Same pattern as Story 3.4 property #3 split into 3a/3b/3c.
- **(post-#85 R17/R18/R19)** Story branched on the main checkout (user-confirmed ownership). Push protocol: `git push origin HEAD` (never `git push` plain — global `push.default` is `matching` and would attempt main). Conflict-resolution: diagnose + ≥2 named options + ask before resolving.

## Acceptance Criteria

**Given** an `accounting.yaml` with valid splits, buffers (with `targetDate`), and recurring rules, plus a SQLite DB,
**When** I run `accounting status` (no flags),
**Then** the CLI prints a header (timestamp + window), then three sections:
1. **Buffers** — table with columns `Name | Balance | Target | Cap | Status | targetDate`, one row per configured bucket, in config order. Status colored: green for `on-target`, yellow for `below`, red for `above-cap`.
2. **Transfer (next month)** — header showing `totalRequired` + per-partner contributions; below it, line items grouped by `kind` then `category`, each row `Date | Description | Gross | Per-partner split`. Conversational prose summary above the table — money values use `Money.toString()` verbatim (`"EUR 1234.56"` shape, no thousands separator, currency-code-prefixed) so the human and JSON formatters agree byte-for-byte on every numeric token. Example prose: `"Total transfer for May 2026: EUR 1234.56. Alex contributes EUR 740.74; Sam EUR 493.82. Includes EUR 172.43 toward Vacation buffer top-up and EUR 1062.13 in Subscriptions/Rent forecast."` (English month names — single-user local tool; locale-customisation deferred). The "May 2026" portion is computed from the window's `from` date, not `Date.now()`.
3. **Forecast (next month)** — table with columns `Date | Name | Category | Amount`. One row per `ForecastOccurrence` returned by `forecastBetween(from, to)`. (This duplicates Story 3.4's transfer-section line-items by construction; the forecast section here is the *unallocated* view, useful for "what's actually hitting the joint account" visibility.)

**And** the default `asOf` is "today" derived from `Date.now()`, normalized to `YYYY-MM-DD` in the config's `timezone` (defaults to `Europe/Paris` per existing `accounting.example.yaml`).

**And** the default window is `[first-of-next-month(asOf), last-of-next-month(asOf)]`. For `asOf = 2026-04-29`, the window is `[2026-05-01, 2026-05-31]`.

**And** `--as-of <YYYY-MM-DD>` overrides "today"; the value MUST match `/^\d{4}-\d{2}-\d{2}$/` or the CLI exits with code 2 and a path-cited error on stderr.

**And** `--from <YYYY-MM-DD> --to <YYYY-MM-DD>` overrides the default window. Both must be ISO 8601 `YYYY-MM-DD` and `from <= to`; otherwise exit 2.

**And** `--json` switches output to a single-object JSON document on stdout matching this shape exactly:

```json
{
  "asOf": "2026-04-29",
  "window": { "from": "2026-05-01", "to": "2026-05-31" },
  "buffers": [
    { "name": "Vacation", "balance": "EUR 600.00", "target": "EUR 1200.00", "cap": null, "status": "below", "targetDate": "2026-12-01" }
  ],
  "transfer": {
    "totalRequired": "EUR 1234.56",
    "perPartner": { "Alex": "EUR 740.74", "Sam": "EUR 493.82" },
    "lineItems": [
      { "kind": "buffer-topup", "date": "2026-05-01", "category": "Vacation", "description": "Vacation top-up", "gross": "EUR 172.43", "perPartnerSplit": { "Alex": "EUR 103.46", "Sam": "EUR 68.97" } }
    ]
  },
  "forecast": [
    { "date": "2026-05-15", "name": "Netflix", "category": "Subscriptions", "amount": "EUR 12.99" }
  ]
}
```

`Money` values are serialized via `Money.toString()` (which produces `"EUR 1234.56"` shape — no thousands separator, currency-code-prefixed, see [src/core/shared/money.ts](src/core/shared/money.ts) `toString` line 100–103). Per-partner maps are JSON objects keyed by partner name. The shape is stable; future fields (e.g. `forecastVariance`) extend additively.

**`formatStatusJson` field-mapping contract (R2 explicit):**
- `Map` → plain object: `SafeTransferCalculation.perPartner` is `ReadonlyMap<string, Money>`; the formatter MUST iterate the Map and emit `{ [partner]: money.toString() }`. `JSON.stringify` on a raw Map produces `{}` — a known JS footgun. Same applies to each `lineItem.perPartnerSplit`.
- Field rename `ForecastOccurrence.expectedDate` → JSON `date`: the Core type uses `expectedDate` ([src/core/recurring/forecast-occurrence.ts](src/core/recurring/forecast-occurrence.ts)); the JSON contract uses `date` (shorter, less repetitive in the visible output). Mapping is explicit per-field, not via `JSON.stringify` of the raw object.
- `BufferState.cap` is `Money | undefined`; serialize as `Money.toString()` or `null` (never omit the key).
- Key order: object keys land in the documented order via deterministic literal-property assembly (no spread-from-Map iteration to avoid order non-determinism).

**And** when `SafeTransferCalculator.calculateForWindow` returns `Result.fail` (stale `targetDate`, `monthsRemaining=0`, ISO-validation, `from > to`), the CLI:
1. Renders the **Buffers** section normally (it's independent of the calculator).
2. In the **Transfer** section, prints the calculator error verbatim + a **Suggested action** prose line. For stale `targetDate` errors, the suggestion names the offending bucket and the YAML field to update (`accounting.yaml`'s `buffers[<i>].targetDate`).
3. Skips the **Forecast** section (or renders it standalone if its own service didn't fail — since `forecastBetween` is independent of the calculator).
4. Exits with code 0 — buffers rendered successfully; the calc failure is informational.

In `--json` mode, the calc failure is represented as `{ "transfer": { "error": "<message>", "suggestedAction": "<prose>" } }` (no `totalRequired` / `perPartner` / `lineItems` keys when failed). Stable-shape contract.

**And** `accounting status` is **read-only**: no DB writes, no snapshot, no migration writes. (Migration *check* — `assertMigrated` — runs to fail fast if the DB is unmigrated, identical to `ingest`.)

**And** the command supports POSIX exit codes: 0 success (including partial-success with calc-failure inline-warn), 2 invalid CLI input (bad date format, `from > to`, unknown flag, missing `accounting.yaml`), 1 unrecoverable runtime error (DB read failure, currency mismatch from `BufferLedgerQuery`).

## Production-code surface (R2)

- `runStatusCommand` (new) at `src/cli/commands/status-command.ts`: pure-ish orchestrator function, signature

  ```ts
  interface StatusCommandDeps {
    // splitsService is NOT in deps — SafeTransferCalculator already holds it
    // internally and applies it per-occurrence. runStatusCommand never calls
    // getSplitsAsOf directly.
    readonly buffersService: BufferStateService;
    readonly forecastService: RecurringForecastService;
    readonly transferCalculator: SafeTransferCalculator;
    readonly stdout: NodeJS.WritableStream;
    readonly stderr: NodeJS.WritableStream;
    readonly clock: () => string; // injectable; returns YYYY-MM-DD
  }
  interface StatusCommandOptions {
    readonly asOf?: string;
    readonly from?: string;
    readonly to?: string;
    readonly json: boolean;
  }
  function runStatusCommand(opts: StatusCommandOptions, deps: StatusCommandDeps): Promise<number>; // returns exit code
  ```

  ~80 LOC; if it grows, extract `assembleStatusReport` (pure, returns the structured report) and `formatHumanReadable` / `formatJson` printers in slice 9.

- `StatusReport` (new) at `src/cli/commands/status-report.ts`: the structured report shape (mirrors the JSON contract above):

  ```ts
  interface StatusReport {
    readonly asOf: string;
    readonly window: { readonly from: string; readonly to: string };
    readonly buffers: readonly BufferState[];
    readonly transfer:
      | { readonly ok: true; readonly value: SafeTransferCalculation }
      | { readonly ok: false; readonly error: string; readonly suggestedAction: string };
    readonly forecast:
      | { readonly ok: true; readonly value: readonly ForecastOccurrence[] }
      | { readonly ok: false; readonly error: string };
  }
  ```

- `formatStatusJson` (new) at `src/cli/commands/status-formatter-json.ts`: `(report: StatusReport) => string`. Pure; deterministic JSON.stringify with stable key order.

- `formatStatusHuman` (new) at `src/cli/commands/status-formatter-human.ts`: `(report: StatusReport) => string`. `cli-table3` + `chalk`. Conversational-CFO prose strings live here; tested for content (substring matches), not exact byte-equality.

- `nextCalendarMonth(asOf: string): { from: string; to: string }` (new internal helper) at `src/cli/commands/status-command.ts`. Computes `from = first day of asOf's next month`, `to = last day of that month`. Pure; no clock. **Edge cases unit-tested explicitly:**
  - `asOf = '2026-12-15'` → `{ from: '2027-01-01', to: '2027-01-31' }` (year rollover).
  - `asOf = '2026-02-28'` (non-leap) → `{ from: '2026-03-01', to: '2026-03-31' }`.
  - `asOf = '2026-01-31'` → `{ from: '2026-02-01', to: '2026-02-28' }` (target Feb has 28 days; non-leap).
  - `asOf = '2024-01-15'` → `{ from: '2024-02-01', to: '2024-02-29' }` (leap-year Feb).
  - `asOf = '2024-02-29'` (leap) → `{ from: '2024-03-01', to: '2024-03-31' }`.
  - Implementation note: `to` computed via `new Date(year, month, 0)` (idiom for last day of month); `new Date(year, monthIndex, day)` is allowed (not parameterless `new Date()`).

- `nodeClock` (new) at `src/cli/utils/node-clock.ts`: `() => string` — calls `new Date()`, formats as ISO `YYYY-MM-DD` in the configured timezone using `Intl.DateTimeFormat`. Single Node-API touchpoint for the system clock; injectable via `StatusCommandDeps.clock`.

- [src/cli/program.ts](src/cli/program.ts) (modified): adds `accounting status` subcommand wiring, parallel to `accounting ingest`. Constructs the four services + `runStatusCommand` via the existing `resolveDbPathForCommand` + `getDb` flow.

- `status` printer extension is intentionally **separate from** the existing `src/cli/utils/printer.ts` (which handles ingest's `BuildOutcome` shape). New printers are co-located with the command.

- **R4 (composition-root subprocess test):** `program.ts` is touched → required. New test at `tests/integration/cli/status-program.test.ts` builds the dist via `tests/_setup/build-dist.ts` and invokes `node dist/cli/program.js status --json --as-of 2026-04-29` against an in-memory-equivalent migrated SQLite + minimal config. Asserts JSON parse + key shape.

## Tool-bundle import audit (R3)

No new framework / library entering deps. Reuses: `commander` (already wired for `program.ts`), `cli-table3` + `chalk` (already in [printer.ts](src/cli/utils/printer.ts)), `dinero.js` (Money), `vitest` + `fast-check` (tests), `quickpickle` (BDD). `Intl.DateTimeFormat` for timezone-aware date normalization is built into Node 20. N/A.

## Slicing — 9 commits (R13), pre-prescribed

Per Story 3.3 retro action A (Sonnet must NOT aggregate slices even when helpers make one-shot easy). The TDD pacing is deliberate.

1. **`test(status): acceptance feature — failing` (story-3.5)**. Create `tests/features/status.feature` with all 6 scenarios (see below). Step skeleton at `tests/features/steps/status.steps.ts`. No command yet — scenarios fail with `runStatusCommand not implemented`.

2. **`test(status): runStatusCommand happy path with --json — failing` (story-3.5)**. Unit tests in `tests/unit/cli/commands/status-command.test.ts` covering: structured `StatusReport` assembly, `--json` formatter shape, `--as-of` injection, `--from`/`--to` overrides, default-window computation. Recording-fake property tests for service wiring (asOf forwarded to splits + buffers; window `[from, to]` forwarded to forecast + calculator). Tests RED.

3. **`feat(status): runStatusCommand happy path + JSON output — minimal green` (story-3.5)**. Implement `runStatusCommand` orchestrator + `assembleStatusReport` + `formatStatusJson` + `nextCalendarMonth` helper + `nodeClock`. Wire `--as-of`, `--from`, `--to`, `--json` flags. Acceptance scenarios "default `--json` output" + "`--as-of` injection" + "`--from`/`--to` override" flip GREEN.

4. **`test(status): human-readable formatter (table + Conversational CFO prose) — failing` (story-3.5)**. Unit tests for the human-readable formatter: section presence, column headers, status-color codes (assert chalk-stripped substring matches), Conversational-CFO prose substrings. Snapshot-style assertions on row counts, not byte-exact output. Tests RED.

5. **`feat(status): human-readable formatter — minimal green` (story-3.5)**. Implement `formatStatusHuman` using `cli-table3` + `chalk`. Conversational prose strings live here. Acceptance scenario "default human output" flips GREEN.

6. **`test(status): stale-targetDate inline-warn UX — failing` (story-3.5)**. Unit tests + acceptance scenario for the calc-failure UX: buffers render, transfer section shows error + Suggested action, exit 0. JSON shape stays `{ transfer: { error, suggestedAction } }`. Tests RED.

7. **`feat(status): stale-targetDate inline-warn — minimal green` (story-3.5)**. Implement the failure-classification logic in `assembleStatusReport` + Suggested-action prose generator. Scenario "stale `targetDate`" flips GREEN.

8. **`feat(status): wire 'accounting status' into program.ts + R4 subprocess test — minimal green` (story-3.5)**. Add the subcommand to `program.ts` (mirroring `ingest`'s composition-root wiring). Add `tests/integration/cli/status-program.test.ts` with subprocess invocation via `tests/_setup/build-dist.ts`. R4 satisfied. Last acceptance scenarios (R4 + invalid-flag exit-code) flip GREEN.

9. **`refactor(status): cleanup or empty — green` (story-3.5)**. `npm run lint && npm run build && npm test`; verify branch coverage on `src/cli/commands/status-*` is 100% via manual enumeration. If `runStatusCommand` exceeds 50 LOC, extract `assembleStatusReport` here. Otherwise empty per R11 with the body: *"branch coverage on src/cli/commands/status-*.ts verified at 100%; no extract / rename / dedupe candidates surfaced. Empty per R11."*

## Acceptance scenarios (Gherkin)

Six scenarios covering JSON, human, override flags, calc-failure, R4 subprocess, and invalid-flag.

```gherkin
Feature: accounting status CLI command (Story 3.5)

  Scenario: default JSON output composes buffers + transfer + forecast for next month
    Given a config with one split (Alex 0.6, Sam 0.4), one buffer (Vacation, target 1200, balance 600, targetDate 2026-12-01), and one recurring rule (Netflix, monthly, 12.99 EUR, validFrom 2026-01-15)
    And a migrated SQLite DB with no transaction entries on the Vacation buffer account
    When I run `accounting status --json --as-of 2026-04-29`
    Then exit code is 0
    And stdout is valid JSON with keys `asOf`, `window`, `buffers`, `transfer`, `forecast`
    And `asOf` is "2026-04-29"
    And `window.from` is "2026-05-01" and `window.to` is "2026-05-31"
    And `buffers` has one entry with name "Vacation" and status "below"
    And `transfer.totalRequired`, `transfer.perPartner.Alex`, `transfer.perPartner.Sam` are present and non-empty
    And `forecast` contains one entry with date "2026-05-15" and name "Netflix"
    # fails if any required key is missing, the window is mis-computed, or the JSON shape drifts.

  Scenario: default human output renders three labeled sections with Conversational-CFO prose
    Given the same config and DB as scenario 1
    When I run `accounting status --as-of 2026-04-29`
    Then exit code is 0
    And stdout contains "Buffers" and "Transfer" and "Forecast" section headers
    And stdout contains "Vacation" and "below" and "Netflix"
    And stdout contains the prose phrase "Total transfer for May 2026"
    And stdout contains "Alex" and "Sam" with their per-partner amounts
    # fails if a section is missing, the prose is template-empty, or status colors don't render.

  Scenario: --as-of injection makes the output deterministic
    Given the same config and DB as scenario 1
    When I run `accounting status --json --as-of 2026-04-29` twice
    Then both invocations produce byte-identical stdout
    # fails if the CLI reads Date.now() despite --as-of being set.

  Scenario: --from / --to override the default window
    Given the same config and DB as scenario 1
    When I run `accounting status --json --as-of 2026-04-29 --from 2026-07-01 --to 2026-09-30`
    Then exit code is 0
    And `window.from` is "2026-07-01" and `window.to` is "2026-09-30"
    And `forecast` contains entries on 2026-07-15, 2026-08-15, 2026-09-15
    # fails if --from / --to are ignored or if the calculator window is decoupled from the forecast window.

  Scenario: stale targetDate renders buffers and warns about the calc failure inline
    Given a config with one split (Alex 0.6, Sam 0.4) and one buffer (Car, target 500, balance 200, targetDate 2026-04-01) — stale and below target
    And no recurring rules
    And asOf is 2026-04-29
    When I run `accounting status --as-of 2026-04-29`
    Then exit code is 0
    And stdout contains the buffer table row for "Car" with status "below"
    And stdout contains "Suggested action" and references "Car" and "targetDate"
    And the transfer section does NOT contain "Total transfer for"
    # fails if the buffer table is suppressed by the calc error, or the suggested action doesn't name the bucket.

  Scenario: invalid --as-of format exits with code 2
    Given a minimal valid config (one split, no buffers, no recurring rules) and a migrated DB
    When I run `accounting status --as-of not-a-date`
    Then exit code is 2
    And stderr contains "must be ISO 8601" and "got"
    # fails if invalid input is accepted or surfaces as an unrecoverable runtime error (exit 1) instead of an input error (exit 2). The Given fixture rules out the alternative failure mode where missing config raises exit 2 for a different reason.
```

## Property tests (fast-check, DoD #3)

Co-located with unit tests in `tests/unit/cli/commands/status-command.test.ts` and `tests/unit/cli/commands/status-formatter-json.test.ts`.

**Sonnet sanity check (per Story 3.3 retro action B):** before each property-test commit, mentally introduce the named defect and confirm the assertion can fail. Vacuous assertions (e.g., trivially-true containment checks on empty fixtures) do not pass this check.

1. **JSON output shape stability** — for any `(asOf, window, buffer config, recurring config)` produced by deterministic generators: `JSON.parse(formatStatusJson(report))` has exactly the documented top-level keys (`asOf`, `window`, `buffers`, `transfer`, `forecast`). **Generator MUST guarantee at least one non-empty `buffers` entry on each iteration** (via `fc.array(bufferArb, { minLength: 1, maxLength: 5 })`) so the `Map`-to-object conversion path in the JSON formatter is exercised, not just the empty-array trivial path. Without this, `JSON.stringify(new Map())` returning `{}` would never be observed.
2. **JSON ↔ human total agreement** — for any successful calc, the numeric cents value parsed from `transfer.totalRequired` in the JSON output equals the numeric cents value parsed from the human formatter's "Total transfer for ..." line. Comparison is via integer cents (e.g., `parseInt(money.replace(/\D/g, ''), 10)`), NOT via raw string match. This way the property survives prose-phrasing changes ("Total transfer for X" → "Required this month: X") as long as both formatters keep using `Money.toString()` for the numeric token.
3. **`--as-of` forwarding (recording-fake on `nodeClock`)** — substitute `clock` with a recording fake that captures invocations. Run `runStatusCommand({ asOf: '2026-04-29', json: true }, ...)`. Assert: clock is NOT called when `asOf` is provided. Reverse: with `asOf` undefined, clock IS called exactly once.
4. **Service-wiring recording-fake (3 sub-properties, retro D)** —
   - **4a.** Substitute `RecurringForecastService` with a recording fake; assert `forecastBetween` receives the computed window's `(from, to)` verbatim.
   - **4b.** Substitute `BufferStateService` similarly; assert `getStateAsOf` receives `asOf` (not `from`).
   - **4c.** Substitute `SafeTransferCalculator` similarly; assert `calculateForWindow` receives `(asOf, from, to)` in the right order.
5. **Default-window computation purity** — `nextCalendarMonth('YYYY-MM-DD')` is pure and deterministic: same input → same output regardless of `Date.now()`. **Purity grep:** the file regex MUST NOT match `\bDate\.now\b` or `\bperformance\.now\b` or `\bnew\s+Date\s*\(\s*\)` (parameterless `new Date()`) anywhere in `src/cli/commands/status-*.ts`. `node-clock.ts` is exempt — it is the single CLI-boundary touchpoint and contains the one `Date.now()` call by design. `new Date(string)` (ISO parse) and `new Date(year, month, day)` (multi-arg constructor for last-day-of-month idiom in `nextCalendarMonth`) are explicitly **allowed**; the regex's `\(\s*\)` clause matches only the empty-args form.
6. **Calc-failure exit code stays 0** — for any `(buffer config, calc failure mode)`: when `BufferStateService.getStateAsOf(asOf)` succeeds (regardless of bucket count, including zero), `runStatusCommand` returns 0. Exit code 1 is reserved for true unrecoverable runtime errors (DB unreachable, currency mismatch on a buffer account from `BufferLedgerQuery`). The classification test must include: stale-targetDate calc-fail with non-empty buffers; stale-targetDate with empty buffers; from>to calc input-validation; ISO calc input-validation. All four cases exit 0 (since buffer-state is queryable). Exit 1 is exercised by a separate test that injects a `BufferStateService` whose `getStateAsOf` returns `Result.fail`.
7. **`--from > --to` exits with code 2** — fast-check generates two ISO dates; when `from > to`, `runStatusCommand` returns 2 and writes a path-cited message to stderr.

## Files touched

| Path | Change |
| --- | --- |
| `src/cli/commands/status-command.ts` | NEW: `runStatusCommand` orchestrator + `assembleStatusReport` + `nextCalendarMonth` helper |
| `src/cli/commands/status-report.ts` | NEW: `StatusReport` type |
| `src/cli/commands/status-formatter-json.ts` | NEW: pure JSON formatter |
| `src/cli/commands/status-formatter-human.ts` | NEW: human-readable formatter (cli-table3 + chalk + Conversational-CFO prose) |
| `src/cli/utils/node-clock.ts` | NEW: `nodeClock` — single `Date.now()` touchpoint, timezone-aware |
| [src/cli/program.ts](src/cli/program.ts) | add `accounting status` subcommand wiring (R4) |
| `tests/features/status.feature` | NEW (6 scenarios) |
| `tests/features/steps/status.steps.ts` | NEW step bindings |
| `tests/features/steps/index.ts` | register new steps file |
| `tests/unit/cli/commands/status-command.test.ts` | NEW unit + property tests |
| `tests/unit/cli/commands/status-formatter-json.test.ts` | NEW property tests on JSON shape |
| `tests/unit/cli/commands/status-formatter-human.test.ts` | NEW unit tests for human formatter |
| `tests/integration/cli/status-program.test.ts` | NEW R4 subprocess composition-root test |
| `accounting.example.yaml` | NO change (existing buffers + recurring + splits suffice) |

`R4` applies (composition-root subprocess test required when `program.ts` is touched).

## Reuse map

- `SplitRulesService.getSplitsAsOf` ([src/core/splits/split-rules-service.ts](src/core/splits/split-rules-service.ts)) — read once at `asOf` for the partner roster + per-line-item splits.
- `BufferStateService.getStateAsOf` ([src/core/buffers/buffer-state-service.ts](src/core/buffers/buffer-state-service.ts)) — buffer table source.
- `RecurringForecastService.forecastBetween` ([src/core/recurring/recurring-forecast-service.ts](src/core/recurring/recurring-forecast-service.ts)) — forecast table source.
- `SafeTransferCalculator.calculateForWindow` ([src/core/transfer/safe-transfer-calculator.ts](src/core/transfer/safe-transfer-calculator.ts)) — transfer section source. Returns `Result.fail` on stale targetDate / monthsRemaining=0 / from>to / ISO; CLI classifies each into a Suggested-action.
- `cli-table3` + `chalk` — already in [src/cli/utils/printer.ts](src/cli/utils/printer.ts). Reuse the visual style.
- `tests/_setup/build-dist.ts` — Story-maint-10 dist-compile harness for R4 subprocess tests.
- Recording-fake pattern from Story 3.2 commit `59639e1` and Story 3.4 properties 3a/3b/3c — applied verbatim to the four constructor-injected services in property test #4.
- ISO_DATE regex `/^\d{4}-\d{2}-\d{2}$/` — copy verbatim from existing services.
- `assertMigrated` ([src/infra/db/migration-check.ts](src/infra/db/migration-check.ts)) — same fail-fast-on-unmigrated-DB precondition as `ingest`.
- `resolveDbPathForCommand` — existing helper in `program.ts` for resolving config + dbPath.

## Verification (end-to-end)

1. `npm run lint && npm run build && npm test` — clean.
2. `npm run test -- tests/features/status.feature` — all 6 scenarios green; ≥ 100 fast-check iterations on each property.
3. R4 subprocess test passes (`tests/integration/cli/status-program.test.ts`): `node dist/cli/program.js status --json --as-of 2026-04-29` against a temp config + migrated DB produces valid JSON.
4. Manual: copy `accounting.example.yaml` → `accounting.yaml`, ensure DB is migrated (`npm run migrate`), run `npm run start status` (or `node dist/cli/program.js status`). Confirm three sections render in default human mode. Run again with `--json | jq` to verify shape. Run with `--as-of 2026-04-01` (a past date) and confirm output is identical across two invocations.
5. Branch coverage on `src/cli/commands/status-*.ts` = 100% (manual enumeration; same convention as Stories 3.2–3.4).
6. Grep `src/cli/commands/status-*.ts` for `Date\.now|new Date\(\s*\)|performance\.now` — must be empty (only `node-clock.ts` may contain `Date.now`/`new Date()`, which is the single CLI-boundary touchpoint).

## Blind spots (acknowledged)

- **Timezone normalization at `nodeClock`.** `Intl.DateTimeFormat({ timeZone: cfg.timezone })` is the right tool, but produces month/day/year as separate parts; we reassemble into `YYYY-MM-DD`. Two edge cases: (a) DST transition days where local "today" might map to two UTC days — we use the configured timezone consistently throughout; (b) invalid `cfg.timezone` strings — `Intl` throws, which the CLI catches and surfaces as exit-2. Property test #5 covers determinism through `nodeClock`'s output (not its internals).
- **Forecast section duplicates Transfer line items.** In default human mode, the Forecast section lists every recurring occurrence in the window; the Transfer section's line items already include them with per-partner splits. This is intentional — the Forecast section is the *unallocated* (gross) view, useful for "what's hitting the joint account?" without the partner-split lens. JSON output keeps them as separate top-level keys for the same reason. Documented here so reviewer can confirm at Phase 4.
- **Calc-failure mode exit code stays 0 (partial-success).** This is the user-confirmed UX. Cost: scripts that pipe `accounting status --json | jq '.transfer.totalRequired'` will silently see `null`-equivalent on stale-targetDate failures. Mitigation: the JSON `transfer.error` key signals the failure; scripts that care should check for it. Documented; not a story-3.5 fix.
- **Stale-targetDate Suggested-action prose.** Generated from the calculator's error message, which already cites the bucket name + the stale date. The CLI's prose layer adds the YAML-field path (`buffers[<i>].targetDate`) by name lookup against `cfg.buffers`. If the bucket name in the error doesn't match any current config bucket (race: config edited between calc and prose generation), the prose falls back to the calculator's raw message. Edge case acknowledged.
- **No `--csv` or `--markdown` output formats.** Per FR20, only `--json` is required for MVP. Future formats can layer on the same `StatusReport` structure.
- **Snapshot service NOT invoked.** `accounting status` is read-only; no `.bak` is created. Mirrors Story 3.2's read-only stance. The snapshot service is reserved for `ingest` and (future) `settle`.

## Out of scope

- `accounting settle` CLI (write-only generation of transfer amounts) — separate command, Epic 4 / post-MVP.
- `accounting explain` CLI ("Conversational CFO" deep-dive on a single transfer) — Epic 4.
- Variance reporting (forecast vs actual) — deferred from Story 3.4; not introduced here either.
- Per-partner currency display — single defaultCurrency for MVP.
- Auto-refresh of stale `targetDate` from inside the CLI (interactive prompt) — defer to a future config-edit command.
- HTML / PWA dashboard ingesting `--json` output — Phase-2 growth feature per PRD.
