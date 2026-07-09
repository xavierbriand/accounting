# Story 4.4a — Ingest non-interactive commit semantics (FR20 prerequisite; closes #181)

## Context

FR20: **System** can output all command results in **JSON Format** (docs/prd.md § Functional
Requirements, § Dual Output prd.md:171-173). Epic-4 story 4.4 ([docs/epics.md](../epics.md)
§ Story 4.4) is audit-first: audit existing `--json` coverage, fill gaps, document the global
contract. The Phase-1 audit (below) and discovery interview split the story, 4.2/4.3
precedent:

- **story-4.4a (this plan):** fix `ingest --non-interactive`/`--json` commit semantics
  (issue #181). The contract 4.4b documents must describe the *fixed* behaviour, so this
  ships first.
- **story-4.4b (follow-up):** the global JSON contract — uniform envelope, convention
  normalization, machine-readable errors, contract doc. Inherits this plan's audit and
  fork decisions; planned as its own story after 4.4a merges.

**Lane:** Reduced (CLI-only — `src/cli/commands/ingest-command.ts`; no Core change).
Phase 0 skipped (no model impact); Phase 2 = `sibling-overlap` only; Phase 4 =
`code-reviewer` + `sibling-overlap`. Envelope R13 (upper bound; this story is small —
3 behaviour slices).

**Branch:** session-assigned `claude/story-4-4-ce635b` hosts 4.4a (story-ddd-1 precedent).

### Maintenance sub-loop (§ 6.7) run 2026-07-08/09 pre-planning

- **Sibling work check:** `gh pr list --state open` → no open PRs. No open issue plans
  this fix except #181 itself (this story closes it). Adjacent: #103/#93 are
  interactive-path auto-tag bugs — no overlap with the non-interactive commit path;
  #186 (e2e journeys) would later consume the fixed behaviour.
- **Story-id uniqueness (R23):** `git ls-tree -r origin/main` shows nothing for
  `story-4.4`, `story-4.4a`, or `story-4.4b`; no open PR branches carry the ids. Free
  (re-checked 2026-07-09 after the split decision).
- **Working tree clean:** yes; branch at parity with `origin/main` (5fdae2f, 0 behind).
- **Open issues:** 44 open, reviewed; none block this story.
- **Backlog refinement:** not run this sub-loop (tracker coordinating).
- **Open PRs:** none (no Dependabot in flight).
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Proceed-to-planning:** yes.

### Phase-1 discovery interview (2026-07-08)

- **Consumer is LLM agents**, not human-built dashboards. The JSON contract is the
  product surface an agent drives the CLI through: shapes must be consistent and
  self-explanatory, errors machine-readable, the contract documented where an agent
  will find it. Formality beats brevity.
- **`migrate` is out of scope** for FR20 — the contract (4.4b) documents the exclusion
  instead of adding the flag.
- **#181 reframed by the user:** current `--non-interactive`/`--json` ingest behaviour
  (never persists) is effectively a `--dry-run`. Desired semantics: `--non-interactive`
  **fails if there's a decision to take, and commits otherwise**.

### Fork decisions (user, 2026-07-09)

1. **Full envelope** (→ 4.4b): every command's `--json` output wraps in a uniform
   envelope (e.g. `{command, ok, data}`) — one parse rule + built-in discriminator for
   agents; breaking today's shapes is cheap pre-consumer-era.
2. **JSON errors on stderr** (→ 4.4b): failures under `--json` emit
   `{error: {code, message, suggestedAction?}}` on stderr; stdout stays data-only;
   exit codes unchanged.
3. **Split 4.4a/4.4b**, sequenced a→b (this plan is 4.4a).

### Coverage audit (run 2026-07-09, pre-planning — the epic's "audit first" step)

Consistency matrix across the six commands:

| Command | Flag | Top-level shape | Money | Dates | Failure while `--json` | Print style |
| --- | --- | --- | --- | --- | --- | --- |
| `ingest` | yes | `{file, source_account, summary, items[], lowConfidence[], duplicates[]}` — **mixed snake_case/camelCase** (ingest-command.ts:336-338, 355-364) | `amount_cents` int + `currency` string (:358-359) | `occurredAt` ISO 8601 w/ offset (:356) | JSON payload on the exit-2 needs-review path only (:328-346); every other failure plain text stderr | compact |
| `correct` | yes | `{targetTransactionId, producedTransactionIds[2], changedFields[], reason}` (correct-formatter-json.ts:12-20) | none echoed — consumer must re-query DB | none echoed | plain text stderr; prefixes vary (`error:` vs `Correction failed:`) | compact |
| `status` | yes | `{asOf, window, buffers[], transfer, forecast}` (status-formatter-json.ts:58-64) | `Money.toString()` strings | bare `YYYY-MM-DD` | per-section `{error, suggestedAction}` embedded in the doc (:40-43, 55); pre-command errors plain text | pretty 2-space |
| `explain` | yes | `{asOf, thisWindow, lastWindow, variance, followThrough}` (explain-formatter-json.ts:60-66) | `Money.toString()` strings | `YYYY-MM-DD` | per-section `{error, suggestedAction}` / `{notConfigured: true}` (:34, 54-57) | pretty 2-space |
| `categorize` | yes | `{file, summary{7 counts}, rules[]}` (categorize-command.ts:52-64) | none | none | nothing on stdout; plain text stderr | compact |
| `migrate` | no | — | — | — | plain text | — |

`Money.toString()` = `"<ISO code> <decimal at currency exponent>"`, e.g. `EUR 45.30`
(src/core/shared/money.ts:102-105). Existing contract docs: none — PRD § Dual Output
(prd.md:171-173) mandates the flag, nothing documents shapes.

Findings a machine consumer trips over (1–9 → **4.4b scope**; 10 → **this story**):

1. **Three Money conventions**: `amount_cents`+`currency` (ingest) vs `"EUR 45.30"`
   string (status/explain) vs not-echoed (correct/categorize). Epic pre-decided
   `Money.toString()` as the contract.
2. **Key-casing drift**: ingest mixes `source_account`/`amount_cents` with camelCase
   siblings; everything else is camelCase.
3. **No machine-readable failure**: errors are plain-text stderr in every command
   (exception: ingest's needs-review JSON; status/explain per-section degradation
   objects). Exit code 2 is overloaded (bad flags AND state conditions).
4. **Empty-stdout successes**: `categorize --json` with zero candidate groups writes
   *nothing* to stdout, exit 0 (categorize-command.ts:125-129) — indistinguishable
   from swallowed output. Its `--non-interactive` exit-2 path also emits no JSON.
5. **No envelope/discriminator**: no `command`/`type`/version field anywhere; agents
   must infer the producing command from shape.
6. **Compact vs pretty split**: correct/ingest/categorize single-line; status/explain
   2-space pretty.
7. **Silent audit-event degradation**: post-commit `record()` failure → exit 0, valid
   stdout JSON, warning only on stderr (correct-command.ts:86-92, ingest-command.ts:203-208).
8. **CLI/domain vocabulary split**: correct's `changedFields` remaps domain `account`
   → display `category` (correct-formatter-json.ts:6-10) while the persisted
   `TransactionCorrected` event keeps `account`.
9. **`categorize` counts a field that can't move**: `rulesSkippedAsDuplicate`
   hardcoded 0 (categorize-command.ts:61).
10. **#181 mechanics confirmed**: `opts.nonInteractive || opts.json` short-circuits to
    `runNonInteractive` (ingest-command.ts:132-134), which **never calls
    `commitBatch`** — even with zero decisions to take it prints and exits 0. So
    `--json` alone silently implies dry-run. Matches the user's read: current
    behaviour ≈ `--dry-run`; desired: fail (exit 2) when a decision is pending,
    commit otherwise.

## Story

> As an **LLM agent (or CI script) driving the CLI**, I want `accounting ingest
> --non-interactive` (and `--json`, which implies it) to commit the batch when no
> decision is pending and fail with exit 2 when rows need review, so that scripted
> ingestion actually persists instead of silently dry-running (#181).

## Domain model

No model impact — CLI-layer behaviour fix; reuses the existing `commitBatch` path
(snapshot → `saveBatch` → `TransactionIngested` recording → snapshot cleanup) exactly as
the interactive path does (R24). No new glossary vocabulary.

## Selected solution

Route `runNonInteractive`'s success path through the existing `commitBatch`
(ingest-command.ts:169-218) after emitting nothing new: pending decisions
(`lowConfidence.length > 0`) keep the current exit-2 + needs-review JSON + no
persistence; otherwise commit, then emit the JSON document / summary table, exit 0.
The two-stage batch policy (§ 5: malformed rows reported and skipped at parse, valid
rows all-or-nothing at commit) is unchanged — parse errors alone are not "decisions".
Zero-fresh-rows (all duplicates) commits nothing and exits 0, as today.

JSON shape is intentionally untouched — the envelope/normalization lands in 4.4b; this
story changes behaviour only, so the two diffs stay independently reviewable.

Set aside:

- **New `--commit` opt-in flag** — wrong default: the useful behaviour should be the
  default; a `--dry-run` opt-out is the natural future flag (deferred, see Risks).
- **Fold into 4.4b** — one PR would exceed the § 6.6 sizing (>3 scenarios) and mix a
  behaviour fix into a shape-normalization diff.

## Production-code surface (R2)

- `src/cli/commands/ingest-command.ts` only. `runNonInteractive` (internal function,
  :310-388) gains the commit dependencies (`transactionRepository`, `snapshotService`,
  `dbPath`, `domainEventRecorder`, already present on `IngestCommandDeps`) and becomes
  async; the call site (:132-134) already has them in scope.
- **Behaviour change:** non-interactive/JSON success path now persists (was: print-only),
  emits `commitBatch`'s existing stderr lines (`N transaction(s) committed.`, snapshot
  warnings) and its exit codes 3/4 on snapshot/write failure — previously unreachable
  in this mode.
- **No signature/type change** to any exported symbol; `program.ts` untouched (no R4
  subprocess-test trigger — but ingest.feature already exercises the binary subprocess).
- Existing tests pinning the dry-run behaviour (tests/unit/cli/commands/
  ingest-command-flags.test.ts, tests/features/ingest.feature non-interactive scenarios)
  flip to assert persistence — enumerated in the Gherkin mapping (R5).

*Phase-4 amendments (as-built corrections to the above):*

- **Emit-then-commit order** (deviation adopted): the JSON/summary is written *before*
  `commitBatch` because `commitBatch`'s final `exitCode(0)` is `process.exit` at the
  composition root — committing first would drop the stdout document entirely.
  Consequence pinned by test (h) (ingest-command.test.ts): on commit failure the
  success-shaped JSON is already on stdout; exit 4 + stderr carry the truth. The 4.4b
  contract doc must state "branch on exit code before trusting stdout".
- **Empty-batch reachability** (plan under-enumerated): with zero fresh rows
  (all-duplicate re-ingest) the unconditional `commitBatch` call now runs the full
  lifecycle — snapshot, `saveBatch([])`, `TransactionIngested` with empty
  `transactionIds`, `0 transaction(s) committed.` on stderr — from scripted callers.
  Behaviour decision deferred to #215.

## Gherkin acceptance scenarios

**Scenario 1 — clean batch commits.**
Given a BPCE CSV whose rows all auto-tag at high confidence
When I run `accounting ingest --file <csv> --non-interactive --json`
Then the transactions are persisted (row count in SQLite increases by the batch size)
And stdout carries the existing JSON document with `summary.total` = batch size
And stderr contains `N transaction(s) committed.` and the exit code is 0.
*fails if:* `runNonInteractive` returns without calling `commitBatch`
(ingest-command.ts:310-388 — the #181 production path). *Mechanism:* subprocess
(acceptance, real SQLite) + in-process unit (mocked repo asserts `saveBatch` called).

**Scenario 2 — pending decision blocks the commit.**
Given a BPCE CSV containing at least one row no auto-tag rule matches (low confidence)
When I run `accounting ingest --file <csv> --non-interactive --json`
Then nothing is persisted (SQLite row count unchanged)
And stdout carries the needs-review JSON (`lowConfidence` ids listed, `items: []`)
And the exit code is 2.
*fails if:* the `lowConfidence.length > 0` guard (ingest-command.ts:321-348) is removed
or the commit is hoisted above it. *Mechanism:* in-process unit (repo mock asserts
`saveBatch` NOT called) + subprocess acceptance for the exit code.

**Scenario 3 — re-ingest is idempotent.**
Given a CSV already committed by scenario 1
When I run `accounting ingest --file <csv> --non-interactive --json` again
Then no new rows are persisted, `summary.duplicates` = batch size, `summary.total` = 0
And the exit code is 0.
*fails if:* the new commit path bypasses `idempotencyService.filterNew`
(ingest-command.ts:103-109) or commits duplicate outcomes. *Mechanism:* integration
(real SQLite, two sequential runs).

## Slice plan

Prep (R30-exempt): `chore(docs): story-4.4a plan + P1/P2/P3 review`.

1. `test(ingest): non-interactive clean batch commits — failing` →
   `feat(ingest): story-4.4a route non-interactive success through commitBatch — minimal green`
   (scenario 1; flips the dry-run-pinning tests in the same slice).
2. `test(ingest): story-4.4a pending review still blocks commit + exit 2 — green on landing (R10)`
   (scenario 2; guard exists — regression-pins it against the new commit path).
3. `test(ingest): story-4.4a re-ingest idempotent, duplicates skipped — green on landing (R10)`
   (scenario 3, integration tier).
4. `refactor(ingest): <what emerges>` — or R11 empty with justification.

Envelope: 4 slices ≤ R13 target. Retro: `chore(retro): story-4.4a`.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| A consumer relies on the current dry-run behaviour | None exist (pre-consumer era per interview); 4.4b's contract doc states commit semantics explicitly |
| Commit-path failures (exit 3/4) newly reachable in CI scripts | They inherit the interactive path's tested semantics (snapshot retained, batch rolled back) — scenario mapping covers the guard boundary |
| `--json` implying commit surprises an exploratory user | Deferred `--dry-run` flag restores the preview affordance (issue at Phase-2 tagging) |
| #180's B1 non-atomicity gap (`saveBatch` commits, then `record()` runs unguarded — ingest-command.ts:196-208) becomes reachable from scripted/CI callers via this story | No code change here — the UnitOfWork fix stays #180; this plan names the widened reachability so #180's priority call sees it |

Cross-references: **closes #181** (the defect itself); **unblocks #186** (e2e journey
tests — its body sequences itself after #181); **widens the audience of #180** (see
Risks row above).

Deferred:

- **`--dry-run` flag** for ingest (preview without persisting) — issue #213.
- **story-4.4b** — envelope + conventions + JSON errors on stderr + contract doc +
  categorize empty-stdout fix + audit findings 1–9. Planned separately after this merges.
- Audit findings 7–9 (silent audit-event degradation signal, vocabulary split,
  dead `rulesSkippedAsDuplicate` count) — fold into 4.4b's plan or file issues there.

## Verification plan

- `npm run lint && npm run build && npm test` green (CI).
- Subprocess proof (matches `run`-skill pattern): fixture CSV → `ingest --non-interactive
  --json` → `sqlite3 <db> 'SELECT COUNT(*) FROM transactions'` increases; re-run → count
  stable, `duplicates` populated, exit 0; low-confidence fixture → exit 2, count stable.
- `domain_events` gains one `TransactionIngested` row per committed batch (4.1 wiring).

## Suggestion log

Phase 2 run 2026-07-09, Reduced lane: `sibling-overlap` only (plan-reviewer dropped).

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | #181 is the exact defect — PR body should say "Closes #181" for auto-close | ADOPT | PR body carries `Closes #181`; Context section already names it |
| 2 | #186 (e2e journeys) sequences itself after #181; plan didn't cross-reference | ADOPT | Cross-reference added to Risks & deferred |
| 3 | #180 (B1 audit-event non-atomicity) is inside the reused `commitBatch`; this story widens its reachability to scripted callers; plan didn't name it | ADOPT | Risk row + cross-reference added; no code change (UnitOfWork stays #180) |
| 4 | #103 / #93 interactive-path bugs — confirmed non-overlapping | ACKNOWLEDGE | Already scoped in maintenance sub-loop notes |
| 5 | #107 shared command-deps base type — dormant, rebase-shape friction only | ACKNOWLEDGE | No new `IngestCommandDeps` fields in this story; no action |

Phase 4 run 2026-07-09 (`code-reviewer` + `sibling-overlap` in parallel):

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 6 | Stale describe-block `fails if` note still listed "--non-interactive triggers writes" as a failure condition (R6) | FIX-NOW | Refreshed in 0cc498b |
| 7 | No test exercised commit failure (exit 3/4) via the non-interactive path, despite the plan naming it newly reachable | FIX-NOW | Test (h) added in 0cc498b — pins exit 4 + JSON-already-on-stdout interleaving |
| 8 | Plan's "commits nothing … as today" undersold empty-batch lifecycle reachability (phantom `TransactionIngested`, empty ids) (R2) | FIX-NOW (plan) + DEFER (behaviour) | Plan § R2 amended; behaviour decision → [#215](https://github.com/xavierbriand/accounting/issues/215) |
| 9 | Emit-then-commit: success-shaped stdout JSON when the commit later fails — undocumented for machine consumers | FIX-NOW (pin) + DEFER (doc) | Pinned by test (h); "branch on exit code" rule → 4.4b contract doc |
| 10 | `a959c32` `— failing` bundle partially red (scenario 2 already green) (R10/R12) | ACKNOWLEDGE | Historical commit, self-disclosed; retro Change item |
| 11 | `runNonInteractive` ~78 LOC > ~50 guideline (P3) | ACKNOWLEDGE | 4.4b's envelope/formatter extraction restructures this exact emission code; splitting now is churn |
| 12 | `4bb7121` subject borderline enumeration (R12) | ACKNOWLEDGE | Historical; noted |
| 13 | Soft: `makeRealDeps` at 7 positional params; 8-assertion integration test; `0 transaction(s) committed.` phrasing | ACKNOWLEDGE | Next-touch candidates; phrasing folded into #215 |
| 14 | Overlap: #180 note refinement (empty-ids event detail) worth recording on the issue | ADOPT | Comment posted on #180 |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — `sibling-overlap` only, Reduced lane): findings triaged above; no deferred rows (nothing needing a new issue — #181/#186/#180 already exist).
- [x] Draft PR with template sections 1–6 filled: [PR #214](https://github.com/xavierbriand/accounting/pull/214).
