# Story 4.2b — Correction CLI Command + Boundary Wiring

## Context

Story 4.2 (Correction) is split into **4.2a — the correction domain** (shipped, PR #184) and
**4.2b — the `correct` CLI command + boundary wiring** (this plan). The split was
pre-authorized by the epic and confirmed in the 4.2a plan (CLAUDE.md §6.6: >~3 scenarios →
split).

**4.2a delivered** the pure domain + schema + persistence: `Transaction.kind`/`correctsId`,
`CorrectionChanges`, pure `CorrectionService.correct(original, changes, ids, reason)`
(reverse-and-correct), `TransactionCorrected` in the `DomainEvent` union, migration 006
(kind-conditioned `idempotency_hash` CHECK), atomic hash-free `saveCorrection`. No CLI, no
event recording.

**4.2b delivers** the user-facing `correct` command: parses explicit flags (no interactive
mode — user-confirmed in 4.2a), loads the original transaction, builds `CorrectionChanges`,
calls `CorrectionService.correct`, persists via `saveCorrection`, and records
`TransactionCorrected` at the app boundary (the B1 pattern story-4.1 shipped for ingest).
Targets **FR14** (Correction). **Lane: Full** (touches `src/core/ledger/correction-service.ts`
— two new guards, see Domain model).

Also picks up **[#185](https://github.com/xavierbriand/accounting/issues/185)** (deferred from
4.2a's Phase-4 review): `CorrectionService` decides `changedFields` via truthy checks, silently
dropping an intentional empty-string clear (e.g. blanking a description). Unreachable in 4.2a
(no CLI existed); reachable now that `correct`'s flags can supply an explicit empty string.

### Maintenance sub-loop (§ 6.7) run 2026-07-06 pre-planning

- **Sibling work check.** `gh pr list --state open --draft --base main` → **none.**
  `gh issue list --state open` scanned (40+ items): no issue targets the `correct` CLI build-out
  itself. Adjacent-but-not-overlapping: **#180** (atomic audit-event `UnitOfWork`) — this story's
  `record()` call inherits the same B1 non-atomicity as ingest, tracked by #180, not fixed here
  (per 4.2a's already-recorded user decision, reconfirmed in Risks below). **#183**
  (split-correction, >2-entry) — still out of scope; `CorrectionService` already guards it,
  this story just surfaces the message. **#185** — in scope for this story (see Context).
  **story-maint-21** (E2E journey tests, in flight on a sibling branch) has a `correct`
  journey (journey 3) explicitly gated on this story shipping first — no collision, it
  consumes this story's output as a dependency.
- **Story-id uniqueness.** `git ls-tree -r origin/main -- docs/plans/ docs/retrospectives/
  docs/status.d/ | grep -i "4\.2"` → only `story-4.2a.md` files exist. No open PR branch
  carries `4.2b`. **`story-4.2b` is free.**
- **Working tree clean.** Dedicated worktree (`../accounting-4.2b`) cut fresh from
  `origin/main` (8747d84, story-4.2a merged); `git status` clean.
- **Open issues.** 40+ open; scanned — none block. Deferred-suggestion backlog unrelated to the
  correction CLI path.
- **Open PRs.** None. No Dependabot bumps pending.
- **`npm audit --audit-level=high`.** 0 vulnerabilities.
- **Proceed-to-planning:** ✅ — clean surface, no overlap, domain pre-decided in 4.0/4.2a.

## Story

> As a **User**, I want to run `accounting correct <transactionId>` with explicit flags for
> the field(s) I'm fixing and a required reason, so that the system writes a reversal and a
> correcting entry, records the correction in the audit trail, and I can see confirmation of
> what changed — all without erasing the original transaction.

## Domain model

Derives from the Phase-0 model note [story-4.0](../domain/model-notes/story-4.0.md) (R24),
same as 4.2a. No new glossary vocabulary — `correct`, `Correction`, `Reversal`, `Correcting
entry` are all already defined.

- **Aggregates / value objects / services touched:**
  - `CorrectionService` (existing domain service, [correction-service.ts](../../src/core/ledger/correction-service.ts))
    gains **two new guards** and **one bug fix**, all inside the existing `correct()` method —
    no new public surface.
    1. **New guard (proposed delta, user-approved 2026-07-06):** reject when
       `original.kind === 'reversal'` — a reversal is a system-generated bookkeeping artifact,
       never a user-authored row; only `original` or `correcting` transactions are meaningful
       correction targets. Not stated in the 4.0 note's invariant list; proposed as a new
       invariant 9, to reconcile into the note at retro (same pattern as 4.2a's date-correction
       clarification).
    2. **New guard:** reject when zero fields are present in `CorrectionChanges` (nothing to
       correct) — a CLI-usability guard, not a model-note invariant.
    3. **Bug fix, closes #185:** `changedFieldsOf`'s truthy checks (`if (changes.account)`,
       `if (changes.date)`, `if (changes.description)`) silently treat an explicit empty string
       as "no change." Fix: `!== undefined` checks (matches `changes.amount`'s existing
       object-truthy behaviour, which was already correct since `Money` objects are always
       truthy). `buildCorrecting`'s account-application truthy check
       (`changes.account && isDebitSide`) gets the same fix, for consistency, even though an
       empty-string category has no real business meaning (CLI-side zod rejects it before it
       reaches Core — see Production-code surface).

    **Guard order (Phase-2 P1 finding — adopted)**, inserted into the existing sequence so a
    compound-invalid input reports the most fundamental problem first: (1) reason non-empty
    [existing] → (2) `original.kind !== 'reversal'` [**new**] → (3) `entries.length <= 2`
    [existing, #183 guard] → (4) `changedFieldsOf(changes).length > 0` [**new**] → (5) currency
    match [existing] → (6) build (`Result.all([buildReversal, buildCorrecting])`) [existing].

    - **Phase-3 implementation note (Phase-2 P3 finding — acknowledged, optional):** the two
      new guards plus the three existing ones (reason, entry-count, currency) are five
      sequential early-return `if`s. A `validate(original, changes): Result<void>` helper
      ahead of the `Result.all` build would consolidate them; soft suggestion, Sonnet's
      discretion, not required for DoD.
    - **Phase-3 implementation note (Phase-2 P1 finding — acknowledged):** scenario 5's
      `kind: 'reversal'` fixture should be constructed directly via
      `Transaction.create({ kind: 'reversal', ... })` rather than a full prior
      `CorrectionService.correct` round-trip — faster, and the round-trip path is already
      covered by 4.2a's own tests.
  - `correct-command.ts` (**new**, CLI/Infra layer) — orchestrates: `findById` → build
    `CorrectionChanges` from parsed flags → `CorrectionService.correct` → `saveCorrection` →
    `domainEventRecorder.record` → render output. No new Core types.
- **Invariants the diff must not violate:** all eight from the 4.0 note (unchanged, already
  covered by 4.2a's tests) plus the two new guards above (covered by this story's tests).
- **Events emitted:** none new — `TransactionCorrected` (4.2a) is recorded here for the first
  time, via the existing `DomainEventRecorder` port (#155), at the app boundary (B1),
  immediately after `saveCorrection` succeeds — mirroring `ingest`'s `commitBatch`
  ([ingest-command.ts:169-218](../../src/cli/commands/ingest-command.ts)) exactly: record only
  after the ledger write is durable; a `record()` failure warns to stderr but does not roll
  back the already-committed rows (same B1 trade-off story-4.1 accepted for ingest; **#180**
  remains the dedicated story that would close this non-atomicity gap for both paths at once —
  not reopened here, per 4.2a's user-confirmed decision).

## Selected solution

A new `runCorrectCommand(options, deps)` in `src/cli/commands/correct-command.ts`, registered
in `program.ts` as `correct <transactionId>` with explicit flags (no interactive prompt loop —
matches 4.2a's "explicit flags" user-confirmed design). Flags:

- `--amount <decimal>` — e.g. `45.30`. **Parsed as a string directly to integer cents, never
  through a float intermediate (Phase-2 P2 finding — adopted).** `Number()`/`parseFloat` on a
  decimal string is exactly what `security-checklist.md` line 12 forbids ("No
  `Number.parseFloat`... for money"); `Money.fromDecimal` takes a `number` and is only safe when
  that number didn't come from an unchecked string→float conversion. Mirror the codebase's own
  established pattern — `parseCentsFromString` in
  [node-csv-parser.ts](../../src/infra/csv/node-csv-parser.ts) parses a decimal string straight
  to integer cents via `String.split`/`parseInt` on the whole/fractional parts, no float ever
  constructed. `correct-command-options.ts` gets a period-separated sibling of that function
  (the CSV one is comma-separated, French-locale-specific — not directly reusable), then calls
  `Money.fromCents(cents, originalCurrency)`. Currency is always taken from the original — no
  `--currency` flag; cross-currency is rejected by `CorrectionService` itself.
- `--category <name>` — the expense category; CLI maps it to the full ledger account string
  via the existing `expenseAccount(category)` helper
  ([account-names.ts](../../src/core/ingest/account-names.ts)) before building
  `CorrectionChanges.account`. Must be non-empty if the flag is passed (zod) — clearing a
  category to "" has no business meaning, unlike clearing a free-text description.
- `--date <YYYY-MM-DD>` — **bare date, user-confirmed 2026-07-06.** The command combines it
  with the *original* transaction's time-of-day and UTC offset (splicing the date portion of
  `occurredAt`), so the user never has to reproduce the exact receipt timestamp to fix a
  date typo. No full-ISO8601-with-offset input required.
- `--description <text>` — any string, including `""` (explicit clear — closes #185).
- `--reason <text>` — **required** (commander `requiredOption`, plus a zod non-empty check as
  belt-and-suspenders ahead of `CorrectionService`'s own check).
- `--json` — **shipped now, user-confirmed 2026-07-06** (not deferred to story-4.4), for
  consistency with `ingest`/`status`'s existing convention.
- `--db-path-override <path>` — existing global convention, wired the same way as other
  commands.

**No pre-write snapshot** (user-confirmed 2026-07-06): `saveCorrection` is a single atomic
SQLite transaction inserting exactly two new rows; unlike `ingest`'s larger batch commit, there
is no partial-batch corruption mode for a snapshot to guard against, and correction is
purely additive (never touches/deletes existing rows). FR17's "before any write operation
(ingest/settle)" is read as scoped to those two operations' specific risk profile, not as a
blanket rule; `correct` relies on `saveCorrection`'s own atomicity.

**Alternatives set aside:**
- *Interactive prompt mode for `correct`* — already rejected in 4.2a's planning (explicit
  flags chosen for a mutation this precise; interactive mode fits discovery-heavy flows like
  `ingest`/`categorize`, not a targeted single-field fix).
- *A `--dry-run`/preview flag* — not requested by FR14 or the model note; would add scope
  without a concrete need yet. Can be a follow-up if real usage shows a demand for it.
- *Snapshot before write* — considered and set aside above (Selected solution).
- *`--json` deferred to story-4.4* — considered and set aside; shipping now keeps the
  convention consistent from day one at low marginal cost.

## Production-code surface (R2)

| File | Change |
| --- | --- |
| `src/core/ledger/correction-service.ts` | Add guard: `Result.fail` if `original.kind === 'reversal'`. Add guard: `Result.fail` if `changedFieldsOf(changes).length === 0`. Fix `changedFieldsOf`'s `account`/`date`/`description` truthy checks → `!== undefined` (closes #185). Fix `buildCorrecting`'s account truthy check → `!== undefined`. No signature changes. |
| `src/cli/commands/correct-command.ts` *(new)* | `runCorrectCommand(options, deps): Promise<void>` — **matches the existing `ingest`/`status`/`categorize` convention (Phase-2 P3 finding — adopted; the draft's `Promise<number>` return was an unjustified deviation)**: an injected `exitCode: (code: number) => void` callback in `CorrectCommandDeps`, same as `IngestCommandDeps`/`StatusCommandDeps`. Decomposed into named helpers mirroring `ingest-command.ts`'s shape (Phase-2 P3 finding — adopted, keeps each under ~50 LOC): `loadOriginal` (findById + not-found/reversal-guard reporting), `buildChanges` (options → `CorrectionChanges`), `persistAndRecord` (saveCorrection → record, mirrors `commitBatch`; a `saveCorrection` failure is reported via the existing `sanitizeSqlError` helper and exits 4, matching ingest's write-failure code — no event recorded), `renderOutcome` (plain-text or `--json`). Exit codes: 0 success, 1 config/DB-setup error, 2 validation (not found / reversal-guard / no-fields-changed / bad flag shape), 4 DB write failure. |
| `src/cli/commands/correct-command-options.ts` *(new)* | Zod schema + parsing: amount (decimal string → integer cents, see Selected solution — never a float intermediate), date (`YYYY-MM-DD` shape), category (non-empty if present), description (any string), reason (non-empty). Exported `parseCorrectOptions` returning `Result<ParsedCorrectOptions>` for a clean CLI-boundary validation layer (mirrors the shape of validation elsewhere, e.g. `status-command.ts`'s `ISO_DATE` regex). |
| `src/cli/commands/correct-formatter-json.ts` *(new)* | `--json` output: `{ targetTransactionId, producedTransactionIds: [reversalId, correctingId], changedFields, reason }` — mirrors `TransactionCorrected`'s own shape for consistency. |
| `src/cli/program.ts` | Register `correct <transactionId>` command: options `--amount`, `--category`, `--date`, `--description`, `--reason` (required), `--json`, `--db-path-override`; DI wiring (`SqliteTransactionRepository`, `SqliteDomainEventRecorder`, a `UuidGen`, `process.stdout`/`stderr`, `exitCode`). |
| `docs/domain/model-notes/story-4.0.md` | Proposed delta (user-approved 2026-07-06, to reconcile at retro): new invariant 9 — a correction may not target a `kind: 'reversal'` transaction. |

No DB migration (schema unchanged since 4.2a's migration 006). No changes to
`src/core/ledger/transaction.ts`, `correction-changes.ts`, or
`src/core/ports/transaction-repository.ts` — their 4.2a shapes are sufficient.

## Gherkin acceptance scenarios

Scenarios 1–7 (including 6b) are **in-process** (R7) — direct calls into `runCorrectCommand`
against a real SQLite temp DB (no subprocess). Scenario 8 is the **R4 composition-root
subprocess test**
(program.ts is touched by this story) — spawns the real built binary via `spawnCli`.

1. **Correct an amount (happy path, human output)** — *Given* a persisted two-entry original
   transaction, *When* I run `correct <id> --amount 45.30 --reason "wrong amount on receipt"`,
   *Then* the process exits 0, stdout reports the reversal id, the correcting id, and
   `changedFields: ["amount"]`, the DB holds three transactions (original untouched, a
   `reversal`, a `correcting`), and one `TransactionCorrected` event is recorded whose payload
   names the target id, the two produced ids, `changedFields`, and the reason.
   *fails if* the command doesn't call `saveCorrection` + `record`, or misreports changed
   fields.
2. **`--json` output, multiple changed fields** — *Given* the same setup, *When* I run
   `correct <id> --amount 45.30 --category Insurance --reason "..." --json` (**two** fields
   changed at once — Phase-2 P2 finding, mock-diversity/R8 — adopted, avoids defaulting to a
   single-element `changedFields` fixture that would mask an array-truncation bug), *Then*
   stdout is a single JSON document `{ targetTransactionId, producedTransactionIds,
   changedFields: ["amount", "account"], reason }` and no human-readable text is mixed in.
   *fails if* the JSON is missing a field, only reports one of the two changed fields, or human
   prose leaks into stdout under `--json`.
3. **Reason required** — *When* I omit `--reason`, *Then* commander rejects before Core is
   reached, with a clear stderr message and a non-zero exit; no rows written, no event
   recorded.
   *fails if* the command proceeds without a reason.
4. **Transaction not found** — *Given* no transaction exists with the given id, *When* I run
   `correct <bogus-id> --amount 10.00 --reason "test"`, *Then* the process exits 2, stderr
   names the missing id, no rows are written, no event is recorded.
   *fails if* the command crashes uncaught or silently no-ops with exit 0.
5. **Reject correcting a reversal** — *Given* a transaction with `kind: 'reversal'` (produced
   by a prior correction), *When* I try to `correct` it, *Then* the process exits 2 with a
   message citing that a reversal cannot be corrected; no new rows, no event.
   *fails if* the new guard is missing and a reversal gets corrected.
6. **No fields to correct** — *Given* a valid original, *When* I run
   `correct <id> --reason "just checking"` with no `--amount`/`--category`/`--date`/
   `--description`, *Then* the process exits 2 citing that at least one field must be
   corrected; no rows written.
   *fails if* the service accepts and persists a no-op correction.
6b. **`saveCorrection` write failure (Phase-2 P2 finding — adopted; parity with `ingest`'s
   explicit "commit failed" handling, `ingest-command.ts:184-193`)** — *Given* a valid
   correction request but `saveCorrection` returns `Result.fail` (simulated via a
   fault-injecting repository double), *When* `correct` runs, *Then* the process exits 4 with a
   `sanitizeSqlError`-redacted stderr message (reusing the existing redaction helper — no raw
   SQLite error text, no hash-like tokens), and no `TransactionCorrected` event is recorded
   (mirrors ingest's "don't record after a failed write").
   *fails if* the command records an event despite the write failing, or leaks an unredacted DB
   error to stderr.
7. **Clearing a description to empty text (closes #185)** — *Given* an original with a
   non-empty description, *When* I run `correct <id> --description "" --reason "typo cleanup"`,
   *Then* the correcting entry's description is empty and `changedFields` includes
   `"description"`.
   *fails if* the empty-string clear is silently dropped from the correcting entry or omitted
   from `changedFields`.
8. **Full CLI journey through the real binary (composition-root, subprocess, R4)** — *Given* a
   fresh migrated DB with a transaction committed via a real `ingest` subprocess run, *When* I
   run `accounting correct <id> --category Insurance --reason "miscategorized" --json` as a
   real subprocess against the same DB, *Then* the process exits 0, the JSON output matches
   the documented shape, and a direct read of the DB confirms the reversal + correcting rows
   and the recorded `TransactionCorrected` event.
   *fails if* `correct` isn't actually wired into `program.ts`, or any DI seam is broken
   end-to-end (the class of bug per-unit tests can't catch — same rationale as
   story-maint-21's e2e tier, which gates its own `correct` journey on this scenario existing).

**No new property tests** — this story adds CLI wiring and two Core guards, not new algebraic
invariants; 4.2a's property tests (net-to-zero, observational equality) already cover the
domain algebra this command exercises.

## Slice plan

Target 8–9 slices (R13, upper end of Full lane's 6–10 — CLI wiring is usually leaner, but two
Core guards + a bug fix + `--json` add real surface). One slice = one behaviour; § 6.4 rhythm,
story id in every subject.

1. `test/feat(ledger): CorrectionService — reject correcting a reversal + require ≥1 changed field`.
2. `test/feat(ledger): CorrectionService — #185 fix, absent-vs-empty-string field detection`.
3. `test/feat(cli): correct command — options parsing + zod boundary validation`.
4. `test/feat(cli): correct command — happy path (load, correct, persist, record)`.
5. `test/feat(cli): correct command — --json output`.
6. `test/feat(cli): correct command — error paths (not found, reversal guard, no-fields guard, saveCorrection write-failure w/ sanitizeSqlError) → exit codes`.
7. `test(acceptance): correct.feature — in-process CLI journeys`.
8. `test(acceptance): correct.feature — composition-root subprocess journey (R4)`.
9. `refactor(cli): <extraction from review>` (or R11 empty slot with justification).

If Sonnet reports > 1 round, split at the Core-guards seam (1–2) vs the CLI-command seam
(3–8) — same contingency 4.2a used.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| **#180 (B1 non-atomicity)** — `record()` here is not atomic with `saveCorrection`, same as ingest. | Accepted, same as 4.2a's decision: #180 remains the dedicated `UnitOfWork` story closing the gap for both paths together. Not reopened here. |
| `reason` (PII-adjacent, glossary: "redacted in logs") could leak via an error/warning message. | `CorrectionService.correct`'s `Result.fail` messages never echo `reason` (already true in 4.2a). This story's own error/warning strings (not-found, reversal-guard, no-fields, record-failure warning) must not interpolate `reason` — verified by a unit test asserting the `record()`-failure warning string excludes the literal reason text. |
| Split-correction (>2-entry) is still deferred. | `CorrectionService` already guards it (4.2a, #183); the CLI surfaces the `Result.fail` message via exit code 2, no new work here. |
| `--date`'s bare-date-plus-original-offset combining logic has an edge case around DST-transition offsets. | Splice the date portion of the stored `occurredAt` string directly (string manipulation on the ISO components), not a `Date` object round-trip — avoids timezone-library DST pitfalls entirely; unit-tested with an offset-bearing fixture. |
| New invariant (reject correcting a reversal) diverges from the literal 4.0 note, which doesn't mention it. | Recorded as a proposed model-note delta (user-approved 2026-07-06); reconcile into the 4.0 note at retro (same pattern 4.2a used for the date-correction clarification). |
| `--category`'s empty-string edge case (no business meaning) vs `--description`'s (meaningful clear) — inconsistent-looking CLI validation. | Called out explicitly in the plan (Selected solution) and in code comments at the zod schema; the asymmetry is real business semantics, not an oversight. |

Deferred follow-ups: none new. #180 and #183 remain open, unaffected by this story.

## Verification plan

- `npm run lint && npm run build && npm test` green (DoD 1).
- No migration in this story (DoD 2 — N/A, nothing to run twice).
- Both new Core guards get a unit test each (DoD 3); the #185 fix gets a regression test
  (empty-string description clear, scenario 7).
- 100% branch coverage on the changed `src/core/ledger/correction-service.ts` lines and the new
  `src/cli/commands/correct-command*.ts` files (Infra/CLI coverage target per CLAUDE.md §5 is
  lower than Core's 100%, but the new CLI files should still be fully exercised by the Gherkin
  scenarios above — no untested branch in the option-parsing or exit-code paths).
- All 9 Gherkin scenarios (1–7 incl. 6b, plus 8) green, including the one composition-root subprocess test (R4).
- `reason`-leakage check: a unit test asserts the `record()`-failure warning string (mocked
  recorder returning `Result.fail`) does not contain the literal reason text.
- No `any`, no TODO, no dead code; commits follow §6.4 with the story id.

## Suggestion log

Phase 2: `plan-reviewer` (P1/P2/P3, 28 findings — 17/27 rule-tags apply, rest N/A; most
confirmations) + `sibling-overlap` in parallel. Substantive findings dispositioned below; pure
confirmations omitted (per 4.2a's precedent).

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | P2: `--amount` parsed via `Number()`/`parseFloat` before `Money.fromDecimal` is exactly what `security-checklist.md` ("No `Number.parseFloat`... for money") forbids; the codebase's own CSV parser avoids this via string→integer-cents parsing. | **ADOPT** | `correct-command-options.ts` gets a period-separated sibling of `node-csv-parser.ts`'s `parseCentsFromString` (string→integer cents, no float intermediate), then `Money.fromCents`. Selected-solution + Production-code-surface updated. |
| 2 | P1: guard-insertion order for the two new `CorrectionService` guards (reversal-kind, zero-changed-fields) relative to the three existing guards (reason, entry-count, currency) wasn't specified; a compound-invalid input's reported error would be non-deterministic across implementations. | **ADOPT** | Explicit 6-step guard order specified in Domain-model section: reason → reversal-kind → entry-count → changed-fields → currency → build. |
| 3 | P2: `--json` output test (scenario 2) only exercised a single-changed-field case, risking a mock that masks an array-truncation bug in `changedFields` (R8 mock-diversity). | **ADOPT** | Scenario 2 rewritten to correct **two** fields at once (`--amount` + `--category`) and assert both appear in `changedFields`. |
| 4 | P2: no Gherkin scenario covers `saveCorrection` returning `Result.fail` (DB write failure) — `ingest` has an explicit "commit failed, rolled back" path (`ingest-command.ts:184-193`) but the draft plan didn't mirror it for `correct`. | **ADOPT** | New scenario 6b: fault-injecting repository double, exit 4, `sanitizeSqlError`-redacted stderr, no event recorded. Slice 6 updated to include it. |
| 5 | P3: draft's `runCorrectCommand(...): Promise<number>` deviates from the established `ingest`/`status`/`categorize` convention (`Promise<void>` + injected `exitCode` callback) without justification. | **ADOPT** | Signature changed to `Promise<void>` + `exitCode` callback in `CorrectCommandDeps`, matching `IngestCommandDeps`/`StatusCommandDeps` exactly. |
| 6 | P3: `runCorrectCommand`'s described responsibilities (load, build, call, persist, record, render) risk exceeding ~50 LOC as one function, the way `ingest`'s top-level orchestration avoids this via named helpers (`commitBatch`, `runNonInteractive`, etc.). | **ADOPT** | Plan now names the decomposition explicitly: `loadOriginal`, `buildChanges`, `persistAndRecord`, `renderOutcome`. |
| 7 | P1: FR17 ("Snapshot Backup... before any write operation (ingest/settle)") is read narrowly to exclude `correct`; textually defensible but a unilateral interpretive call. | **ACKNOWLEDGE** | Already surfaced to and confirmed by the user before this plan was drafted (2026-07-06, "No snapshot" — see Selected solution); not a silent narrowing. |
| 8 | P1: scenario 5's `kind: 'reversal'` fixture construction path (direct `Transaction.create` vs. full correction round-trip) left unspecified. | **ACKNOWLEDGE** | Phase-3 implementation note added: construct directly via `Transaction.create({ kind: 'reversal', ... })` — faster, and the round-trip path is already covered by 4.2a's tests. |
| 9 | P3: the five sequential guard `if`s (three existing + two new) in `CorrectionService.correct` could fold into one `validate()` helper ahead of the `Result.all` build. | **ACKNOWLEDGE** | Soft suggestion per the review itself ("not a blocker"); recorded as an optional Phase-3 implementation note, Sonnet's discretion. |
| 10 | sibling-overlap: #180/#183/#185/#186(story-maint-21) all verified against the live tracker — characterizations in the plan's Maintenance sub-loop section confirmed accurate; no PR or branch currently competes for #185; #186 is a one-directional consumer dependency, not a collision. | **ACKNOWLEDGE** | No blocking overlap; no plan change needed. |

No un-tagged items. No deferred capability in this batch (all substantive findings were either
adopted into the plan or acknowledged as already-resolved/soft).

## DoR checklist

- [x] Phase 0 (Model): derives from [story-4.0 model note](../domain/model-notes/story-4.0.md) (R24); reversal-guard recorded as a proposed delta (user-approved 2026-07-06).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — Full lane: `plan-reviewer` + `sibling-overlap` in parallel): findings triaged above; no un-tagged items.
- [ ] Draft PR with template sections 1–6 filled.
