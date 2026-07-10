# Story 4.4b — Global JSON contract (FR20 completion)

## Context

FR20: **System** can output all command results in **JSON Format** (docs/prd.md § Functional
Requirements, § Dual Output). Second half of the 4.4 split ([docs/plans/story-4.4a.md](story-4.4a.md)
§ Context): 4.4a fixed the `ingest --non-interactive`/`--json` commit semantics (#181, PR #214);
this story delivers the contract itself — uniform envelope, convention normalization,
machine-readable errors on stderr, and the contract document. It **inherits** the 4.4a plan's
coverage audit (findings 1–9) and the user's fork decisions (2026-07-09):

1. **Full envelope** — every command's `--json` output wraps in a uniform envelope;
   breaking today's shapes is cheap pre-consumer-era.
2. **JSON errors on stderr** — failures under `--json` emit machine-readable error
   documents on stderr; stdout stays data-only; exit codes unchanged.
3. **Consumer is LLM agents** (discovery interview, 2026-07-08) — shapes consistent and
   self-explanatory, errors machine-readable, contract documented where an agent finds it.
   `migrate` stays out of scope; the contract documents the exclusion.

Carried forward from the 4.4a retro (Try items): the contract doc must state the failure
discipline explicitly — success-shaped JSON can already be on stdout when a commit later
fails (exit 3/4); consumers branch on the exit code before trusting stdout (pinned by
4.4a's test (h)).

**Lane:** Reduced (CLI-only — formatters and command emission paths in `src/cli/`; no Core
change). Phase 0 skipped (no model impact); Phase 2 = `sibling-overlap` only; Phase 4 =
`code-reviewer` + `sibling-overlap`. Envelope R13.

**Branch:** session-assigned `claude/story-4-4b-c7f448` hosts 4.4b (story-ddd-1 precedent).

### Maintenance sub-loop (§ 6.7) run 2026-07-10 pre-planning

- **Sibling work check:** `gh pr list --state open` → none. Open issues adjacent but not
  overlapping: #215 (empty-batch commit lifecycle — behaviour decision, not shape),
  #213 (`--dry-run` flag), #186 (e2e journeys — consumes this contract later),
  #180 (B1 atomicity — behaviour), #107 (shared command-deps base type — dormant),
  #104 (config-writer duplicate counts — see finding 9 below).
- **Story-id uniqueness (R23):** `git ls-tree -r origin/main` shows only `story-4.4a`
  artifacts; no `story-4.4b` plan/retro/status file; no open PR branches carry the id. Free.
- **Working tree clean:** yes; branch at parity with `origin/main` (89fc63a).
- **Open issues:** 45 open, reviewed; none block this story.
- **Backlog refinement:** not run this sub-loop (tracker coordinating; last pass recent).
- **Open PRs:** none (no Dependabot in flight).
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Proceed-to-planning:** yes.

### Phase-1 discovery interview (2026-07-10)

Residual forks not settled by the inherited 4.4a decisions; user answers:

1. **Envelope on both streams.** stderr errors use the *same* envelope as stdout:
   `{command, ok: false, error: {code, message, suggestedAction?, details?}}` — one parse
   rule everywhere, `ok` is the discriminator. (Supersedes the bare `{error: {...}}`
   sketch in the 4.4a fork-decision text.)
2. **Needs-review payload moves to stderr.** Ingest's exit-2 needs-review document leaves
   stdout; the stderr error envelope carries `code: NEEDS_REVIEW` with the
   lowConfidence/duplicates payload under `error.details`. Simplest agent rule: stdout is
   only meaningful on success (modulo the exit-3/4 interleaving rule, documented).
3. **`Money.toString()` everywhere** (`"EUR 45.30"`) — confirms the epic's pre-decision;
   ingest normalizes away `amount_cents` + `currency`.
4. **Scope of audit findings 7–9:** fold **8** (correct's `changedFields` remaps domain
   `account` → display `category`; JSON realigns to domain vocabulary) and **9**
   (categorize's `rulesSkippedAsDuplicate` hardcoded 0 — dropped; honest reintroduction
   path is #104). **7** (silent audit-event `record()` degradation) stays behaviour work
   entangled with #180 — deferred there (comment at DoD).

Decisions proposed by the planner under the LLM-agent consumer framing (veto at review):
**compact single-line JSON everywhere** (status/explain drop `, null, 2` pretty-printing);
**no `contractVersion` field** (pre-consumer era, the doc + git history version the
contract); **contract doc at `docs/cli-json-contract.md`** with a README Documentation
pointer.

## Story

> As an **LLM agent (or script) driving the CLI**, I want every command's `--json` output
> wrapped in one uniform envelope, with machine-readable errors on stderr and the whole
> contract documented in one place, so that I can parse any command's result with a single
> rule and act on failures without scraping prose.

## Domain model

No model impact — CLI-layer serialization contract; no Core type, port, or glossary term
changes (R24). One alignment *toward* the glossary: correct's JSON `changedFields` stops
remapping domain `account` to display `category` (finding 8); the human output keeps the
display name. No new vocabulary.

## Selected solution

A shared envelope module + per-command migration, then the contract document:

- **New `src/cli/utils/json-envelope.ts`:** envelope types
  (`{command, ok: true, data}` | `{command, ok: false, error}`), a `JsonErrorCode` union,
  and two pure helpers `formatJsonSuccess(command, data)` / `formatJsonError(command,
  error)` returning compact single-line `JSON.stringify(...) + '\n'`. Commands import it
  directly — command names are **hardcoded string literals in each command module**, so
  `program.ts` is untouched (no new R4 trigger; the existing R4 subprocess pin
  `tests/integration/cli/status-program.test.ts` flips to envelope asserts regardless).
- **Error-code registry** (`JsonErrorCode`), mirrored in the contract doc; exit codes
  unchanged — codes disambiguate the overloaded exit 2 (audit finding 3):

  | Code | Meaning | Exit |
  | --- | --- | --- |
  | `INVALID_ARGUMENT` | bad flag/date/option value; source-account resolution | 2 |
  | `NOT_FOUND` | correct: target transaction missing | 2 |
  | `NEEDS_REVIEW` | ingest/categorize: pending decision under non-interactive | 2 |
  | `READ_FAILURE` | input file unreadable / CSV parse failure | 1 |
  | `QUERY_FAILURE` | repository/read-model failure (idempotency check, buffer state, contribution query, findById, build) | 1 |
  | `SNAPSHOT_FAILURE` | pre-commit snapshot failed | 3 |
  | `WRITE_FAILURE` | saveBatch / saveCorrection failed | 4 |
  | `CONFIG_WRITE_FAILURE` | accounting.yaml append failed | 5 |

- **Failure discipline:** under `--json`, every reachable `exitCode(nonzero)` /
  nonzero-return path emits the error envelope as the **final stderr line** (prose
  progress/warning lines may precede it — agents parse the last line). Interactive-only
  failure paths (cancel/abort) are unreachable under `--json` and stay prose.
- **Per-command migration:** status/explain wrap their formatter docs and go compact,
  writing the error envelope themselves before returning nonzero (their return-a-number
  convention is untouched); correct wraps + drops the JSON-side `account`→`category`
  remap; ingest wraps, normalizes `source_account`/`amount_cents`+`currency` to
  camelCase + `Money.toString()`, drops the always-empty-on-success `lowConfidence` array
  from the success doc, and relocates the needs-review payload to `error.details`;
  categorize wraps, emits a success envelope on the zero-groups path (audit finding 4 —
  today stdout is empty even with `--json`), emits `NEEDS_REVIEW` on its non-interactive
  exit-2 path, and drops the hardcoded `rulesSkippedAsDuplicate` (finding 9 → #104).
  Status/explain **per-section degradation objects stay embedded in `data`** (partial
  success is data, `ok: true`); the contract documents them.
- **Contract doc `docs/cli-json-contract.md`:** envelope + streams discipline
  ("branch on exit code before trusting stdout" — the 4.4a exit-3/4 interleaving),
  exit-code table + error-code registry, conventions (camelCase keys; Money as
  `Money.toString()` strings; calendar dates `YYYY-MM-DD`, transaction timestamps
  ISO 8601 with offset; compact single-line), per-command `data` schemas, non-interactive
  commit semantics (4.4a, with the #215 empty-batch caveat), and the `migrate` exclusion.
  README gains a Documentation-list pointer.

Set aside:

- **Injecting the command name via deps** — touches `program.ts` for zero benefit over a
  literal in the command module; the name is intrinsic to the module.
- **`contractVersion` field** — speculative pre-consumer; the doc + git version it.
- **Suppressing stderr prose under `--json`** — warnings carry value (snapshot retained,
  commit counts); the final-line rule keeps machine parsing deterministic without
  destroying the human/debug trace.
- **Implementing #104 to make `rulesSkippedAsDuplicate` real** — extends scope into
  config-writer behaviour; dropping the dead field is the honest shape fix.
- **Enveloping `migrate`** — excluded by the inherited interview decision; documented.

## Production-code surface (R2)

- **New:** `src/cli/utils/json-envelope.ts` (envelope types, `JsonErrorCode`,
  `formatJsonSuccess`/`formatJsonError`). Pure string-returning helpers; no I/O.
- **Breaking output-format change (all five `--json` commands):** every stdout success doc
  wraps in `{command, ok: true, data}`; every `--json` failure path gains a final-stderr-line
  `{command, ok: false, error}` envelope. Exit codes unchanged on every path.
- `src/cli/commands/status-command.ts` + `status-formatter-json.ts`: compact (drop
  `, null, 2`), envelope wrap; validation/query failures emit error envelope before
  returning 2/1. `formatStatusJson` signature unchanged (returns envelope string).
- `src/cli/commands/explain-command.ts` + `explain-formatter-json.ts`: same as status.
- `src/cli/commands/correct-command.ts` + `correct-formatter-json.ts`: envelope wrap;
  JSON `changedFields` emits domain `account` (remap removed from the JSON path;
  `toDisplayFieldName` stays for the human branch — moves into the command's human
  rendering); failures (`NOT_FOUND`, `INVALID_ARGUMENT`, `QUERY_FAILURE`,
  `WRITE_FAILURE`) emit error envelopes.
- `src/cli/commands/ingest-command.ts`: success doc → envelope, `source_account` →
  `sourceAccount`, items' `amount_cents`+`currency` → `amount: "EUR 45.30"`
  (`Money.toString()`), `lowConfidence` dropped from success `data` (always empty
  post-4.4a on the success path); needs-review exit-2 doc leaves stdout → stderr
  `NEEDS_REVIEW` envelope with payload in `error.details`; remaining `--json`-reachable
  failure sites (read/parse/idempotency/build/snapshot/commit, source-account) emit
  coded error envelopes as the final stderr line before `exitCode(...)`.
- `src/cli/commands/categorize-command.ts`: summary doc → envelope; **newly-reachable
  emissions** — zero-groups path now writes a success envelope to stdout (was: nothing,
  finding 4); non-interactive pending-groups path now writes a `NEEDS_REVIEW` stderr
  envelope (was: prose only); `rulesSkippedAsDuplicate` removed from the summary.
- **Untouched:** `program.ts` (command names hardcoded in command modules — no R4
  trigger), `src/core/**`, `src/infra/**`, `migrate`.
- **Newly-reachable paths under `--json`** (R10 green-on-landing pin candidates, per the
  4.4a retro Try item): categorize zero-groups stdout emission; categorize
  non-interactive stderr envelope; status/explain failure envelopes; ingest failure
  envelopes incl. the exit-3/4 commit-path interleaving (4.4a test (h) flips to assert
  the success-shaped stdout envelope *plus* the `WRITE_FAILURE` stderr envelope).
- **Docs:** new `docs/cli-json-contract.md`; README Documentation pointer.
- **Test flips (inventory from the pre-planning mechanics map):** feature scenarios —
  ingest.feature (8 scenarios incl. the two 4.4a non-interactive ones), categorize.feature
  `--json summary shape`, correct.feature `--json output` + R4 subprocess journey,
  status.feature (4 JSON scenarios incl. byte-identical determinism), explain.feature
  (3 incl. subprocess journey); unit — ingest-command-flags, ingest-command (test (h)),
  categorize-command, correct-command, status-command, status-formatter-json (property
  tests), status-stale-warn, explain-command-json-output, explain-formatter-json;
  integration — status-program (R4), ingest-commit, ingest-end-to-end-wiring,
  ingest-autotag-wiring. Flips are mechanical envelope-unwraps; step files gain one
  shared unwrap helper.

## Gherkin acceptance scenarios

**Scenario 1 — one envelope, every command (Scenario Outline).**
Given a migrated ledger with fixture data appropriate to `<command>`
When I run `accounting <command> --json <args>` as a subprocess on a success path
Then stdout is exactly one line, parsing to `{command: "<command>", ok: true, data: {...}}`
with the documented `data` keys for `<command>`
And stderr contains no JSON document, and the exit code is 0.
Examples: `status`, `explain`, `correct`, `ingest` (clean batch), `categorize`
(**zero candidate groups** — pins finding 4's empty-stdout fix).
*fails if:* any command's `--json` success path writes a bare un-enveloped document
(status-formatter-json.ts / explain-formatter-json.ts / correct-formatter-json.ts /
ingest-command.ts success emission / categorize-command.ts summary emission), or
categorize's zero-groups guard returns before writing stdout (categorize-command.ts:125-129).
*Mechanism:* subprocess (`spawnCli`, real SQLite) for the outline; in-process units per
command for the envelope fields.

**Scenario 2 — machine-readable failure on stderr (Scenario Outline).**
Given `<failure fixture>`
When I run `accounting <command> --json <args>`
Then stdout is empty
And the final stderr line parses to `{command: "<command>", ok: false, error: {code:
"<code>", message, suggestedAction?}}` (for `NEEDS_REVIEW`, `error.details` carries the
lowConfidence ids and duplicates payload)
And the exit code is `<exit>`, and nothing is persisted.
Examples: `ingest` low-confidence CSV → `NEEDS_REVIEW` / exit 2; `correct` unknown
transaction id → `NOT_FOUND` / exit 2.
*fails if:* the needs-review payload is still written to stdout
(ingest-command.ts:347-356) or a failure path exits without emitting the envelope
(correct-command.ts:48-50). *Mechanism:* subprocess for exit + streams; in-process unit
asserting `saveBatch` NOT called (repo mock) and envelope-last stderr ordering.

**Scenario 3 — conventions normalized (ingest as the outlier's proof).**
Given a clean BPCE CSV with ≥2 rows, distinct non-default amounts and categories (R8
mock diversity)
When I run `accounting ingest --file <csv> --non-interactive --json`
Then the envelope's `data` uses camelCase keys only (no `source_account`, no
`amount_cents` anywhere in the document)
And each item's amount renders as a `Money.toString()` string (`"EUR <decimal>"`)
And each item's `occurredAt` keeps its ISO 8601 offset, and the document is a single
compact line.
*fails if:* ingest-command.ts's snake_case sites survive, or a formatter reintroduces
`JSON.stringify(..., null, 2)` pretty-printing. *Mechanism:* subprocess + in-process
unit on the emitted document.

Existing flipped scenarios (inventoried in R2 above) carry the remaining breadth:
status byte-identical determinism, explain no-prose/R8-diverse shape, correct R4
subprocess journey, 4.4a non-interactive commit semantics — all re-assert through the
envelope after the flip; none are deleted.

## Slice plan

Prep (R30-exempt): `chore(docs): story-4.4b plan + P1/P2/P3 review`.

1. `test(cli): story-4.4b envelope helper + status envelope — failing` →
   `feat(cli): story-4.4b JSON envelope module; status emits compact enveloped JSON — minimal green`
   (helper types/functions + status success **and** failure envelopes; flips status
   unit/property/feature/R4-subprocess pins in the same slice).
2. `test(cli): story-4.4b explain envelope — failing` →
   `feat(cli): story-4.4b explain envelope + error envelope — minimal green`.
3. `test(cli): story-4.4b correct envelope + domain changedFields — failing` →
   `feat(cli): story-4.4b correct envelope; JSON changedFields uses domain account — minimal green`
   (finding 8).
4. `test(cli): story-4.4b ingest success envelope + camelCase/Money conventions — failing` →
   `feat(cli): story-4.4b ingest enveloped success doc, normalized conventions — minimal green`
   (scenario 3).
5. `test(cli): story-4.4b ingest failure envelopes, needs-review on stderr — failing` →
   `feat(cli): story-4.4b ingest coded error envelopes as final stderr line — minimal green`
   (scenario 2 ingest row; flips 4.4a test (h) to assert the added `WRITE_FAILURE`
   envelope).
6. `test(cli): story-4.4b categorize envelope, zero-groups emission, needs-review — failing` →
   `feat(cli): story-4.4b categorize enveloped paths; drop dead duplicate count — minimal green`
   (findings 4 + 9).
7. `docs(cli): story-4.4b JSON contract doc + README pointer` (deliverable slice — counts
   toward the envelope per R30).
8. `refactor(cli): <what emerges>` — or R11 empty with justification.

Envelope: 8 slices, within R13 (6–10). Retro: `chore(retro): story-4.4b`.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Breaking every `--json` shape at once strands an unknown consumer | None exist (pre-consumer era per 4.4a interview); the contract doc becomes the authority in the same PR |
| Test-flip breadth (~18 scenarios/files) balloons the diff and review | Flips are mechanical envelope-unwraps; one shared unwrap helper in test steps; full inventory pre-enumerated in R2 |
| stderr prose (commit counts, snapshot warnings) interleaves with the error envelope | Contract rule: envelope is the **final** stderr line; emission ordered immediately before `exitCode`/return; pinned by scenario 2 |
| status `--as-of` byte-identical determinism breaks under the envelope | Envelope adds only static fields; the existing determinism scenario flips and re-pins |
| Story exceeds one Sonnet round (§ 6.6) | Pre-named seam: slices 1–5 vs 6–7 split off as a follow-up story if round 1 exhausts; slices are per-command independent |
| Exit-code semantics drift while instrumenting failure paths | Exit codes pinned unchanged in every scenario and flipped test; only stream content changes |
| 4.4a emit-then-commit interleaving (success stdout + exit 3/4) confuses agents | Documented as the "branch on exit code first" rule; test (h) flip pins envelope + error-envelope coexistence |

Deferred / cross-references:

- **Finding 7** (silent audit-event `record()` degradation under `--json`) → deferred to
  **#180** (atomicity) — comment at DoD tagging.
- **`rulesSkippedAsDuplicate`** honest reintroduction → **#104** (comment at DoD).
- **#215** empty-batch commit lifecycle — contract doc notes the caveat; behaviour stays open.
- **Unblocks #186** (e2e journeys consume the documented contract).
- **`--dry-run`** (#213) unaffected; the doc's commit-semantics section names it as future.

## Verification plan

- `npm run lint && npm run build && npm test` green (CI).
- Subprocess proofs (per command): `accounting <cmd> --json ... | jq` → envelope parses,
  `command`/`ok`/`data` present, stdout is one line (`wc -l` = 1), exit 0.
- Needs-review fixture: stdout empty, final stderr line parses with
  `error.code == "NEEDS_REVIEW"` + `error.details.lowConfidence` populated, exit 2,
  SQLite row count unchanged.
- `grep -rn "null, 2" src/cli/` → no hits; `grep -rn "source_account\|amount_cents"
  src/cli/` → no hits.
- Contract-doc examples spot-checked against live `spawnCli` output (doc accuracy is a
  Phase-4 review item, not Gherkin).
- `domain_events` recording unchanged (4.1/4.4a wiring untouched).

## Suggestion log

Phase 2 run 2026-07-10, Reduced lane: `sibling-overlap` only (plan-reviewer dropped). No
open PRs — all findings are issue-coordination, none blocking.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | #215 (empty-batch lifecycle) is a behaviour decision on the same `runNonInteractive` → `commitBatch` region slices 4–5 instrument | ACKNOWLEDGE | Plan already defers + contract doc carries the caveat; whichever lands second re-verifies the other's path assumptions |
| 2 | #213 (`--dry-run`) self-sequences *after* 4.4b (its body waits for the envelope to add `data.dryRun`) | ACKNOWLEDGE | Sequencing already correct; contract doc names `--dry-run` as future |
| 3 | #186 (e2e journeys) should sequence after 4.4b to avoid asserting pre-envelope shapes | ACKNOWLEDGE | Plan already lists "unblocks #186" |
| 4 | #180 carries deferred audit finding 7 (silent `record()` degradation) | ACKNOWLEDGE | Already the plan's disposition; comment due at DoD |
| 5 | #104 will later *re-add* the `rulesSkippedAsDuplicate` field slice 6 deletes | ADOPT | DoD comment on #104 states the deletion and that reintroduction lands *inside* the envelope's `data.summary`; contract doc omits the field |
| 6 | #107 (shared command-deps base type) — same files, dormant, rebase-shape friction only | ACKNOWLEDGE | No new dep fields added by envelope wrapping; no action |
| 7 | #103/#93 target `runInteractiveLoop` — same file, disjoint region | ACKNOWLEDGE | Interactive paths stay prose by design (unreachable under `--json`) |
| 8 | #208 residue: item 1 (shared window helper) appears already resolved on main; remaining items don't touch 4.4b files | ACKNOWLEDGE | Tracker hygiene for a future backlog-refinement pass, not this story |
| 9 | #110/#109 (categorize refactors) overlap slice 6's file | ACKNOWLEDGE | No open PR; whichever lands second rebases; slice 6 keeps to emission paths |
| 10 | #183 (>2-entry corrections) shares correct-command.ts, different concern | ACKNOWLEDGE | Slice 3 touches JSON formatting only |
| 11 | #117 targets `ingest.steps.ts`, where the shared unwrap helper lands | ACKNOWLEDGE | Helper is additive; #117's extraction unaffected |
| 12 | #211 lint-smell item in status-command.test.ts — disjoint lines | ACKNOWLEDGE | No action |
| 13 | #86 (markdown-link-check) not yet a live gate for the new doc | ACKNOWLEDGE | No action |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — `sibling-overlap` only, Reduced lane): findings triaged above; no DEFER rows (all coordination points live on existing issues #215/#213/#186/#180/#104).
- [x] Draft PR with template sections 1–6 filled: [PR #216](https://github.com/xavierbriand/accounting/pull/216).
