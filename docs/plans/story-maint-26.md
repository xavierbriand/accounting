# Story maint-26 — Commander parse errors bypass the `--json` contract

## Context

The user reported confusing output from `npm run ingest --json` when `-f/--file` was
omitted. Investigation (done in chat, not re-litigated here) found two distinct things:

1. **User-education issue, not a code bug**: `npm run ingest --json` (no `--` separator)
   sends `--json` to npm itself, not to the script. npm then prints its own generic
   error JSON (`{"error":{"code":1,"summary":"","detail":""}}`) — unrelated to this
   repo's contract. Confirmed by reproduction; no code change needed.
2. **Genuine gap** (this story's scope): even when `--json` correctly reaches the CLI
   (`node dist/cli/program.js ingest --json`, or `npm run ingest -- --json`), a missing
   required option/argument, unknown option, or excess argument is caught by
   **Commander's own parser before any action handler runs** — entirely bypassing
   [src/cli/utils/json-envelope.ts](../../src/cli/utils/json-envelope.ts). Commander
   prints its own plain-text message to stderr and exits 1, unconditionally, regardless
   of `--json`. Confirmed by direct reproduction:
   ```
   $ npx tsx src/cli/program.ts ingest --json 1>/dev/null
   error: required option '-f, --file <path>' not specified
   $ echo $?
   1
   ```
   This violates [docs/cli-json-contract.md § 2](../cli-json-contract.md) ("stderr
   carries... the failure envelope" under `--json`) and § 4's registry (bad-flag
   errors → `INVALID_ARGUMENT`, exit 2).

   This exact gap is **already documented as a known, deliberate omission** from
   story-4.4b, in [tests/features/correct.feature](../../tests/features/correct.feature)'s
   "Reason required" scenario comment: *"Commander's own requiredOption('--reason', ...)
   enforcement... is not exercised by any test in this suite... mirrors
   ingest/categorize's requiredOption('-f, --file', ...) likewise untested via
   subprocess omission."* This story closes that gap.

No FR — this completes FR20/story-4.4b, it doesn't add a requirement.

### Maintenance sub-loop (§ 6.7) — run 2026-07-16, pre-planning

- **Sibling work check**: no open PR or issue addresses this gap. One relevant
  sibling: PR #221 (Dependabot, `commander` 14.0.3 → 15.0.0) is open but not merged;
  [issue #223](https://github.com/xavierbriand/accounting/issues/223) already tracks
  the major bump as a future full story (Node 20→22/24 + commander 15). This story
  targets the currently-pinned `commander@^14.0.3`; flagged as a risk for #223 to
  re-verify (see Risks).
- **Story-id uniqueness**: `story-maint-26` confirmed free — `docs/plans/`,
  `docs/retrospectives/`, `docs/status.d/` on `origin/main` go up to `-25`
  (`-20` exists only in retrospectives, an already-merged Light-lane story); no open
  PR branch uses `-26`.
- **Working tree clean**: yes; branch `claude/cli-error-output-format-cecd23`
  (session-assigned) is the story branch — used in place per new-story-preflight step 2,
  fetched against `origin/main` with nothing new to rebase onto.
- **Open issues**: reviewed (50 open); none overlap this gap.
- **Backlog refinement**: skipped this run (not required every sub-loop; no signal
  this area needs a hygiene pass).
- **Open PRs**: 5 open, all Dependabot (`inquirer/prompts`, `commander`, `zod`,
  `better-sqlite3`, dev-dependencies group) — routine, unrelated to this story.
- **`npm audit --audit-level=high`**: 0 vulnerabilities.
- **Proceed to planning**: yes.

## Story

> As a script or LLM agent driving the CLI under `--json`, I want Commander's own
> argument-parsing failures (missing required option/argument, unknown option, excess
> arguments) to also produce the standard failure envelope on stderr with the correct
> `INVALID_ARGUMENT` code, so I can rely on one parsing rule for every CLI failure
> instead of special-casing "did Commander reject this before the command even ran."

## Domain model

No model impact — pure CLI/infra wiring around an existing library (Commander)'s
error-handling hook; no Core domain concept changes.

## Selected solution

In [src/cli/program.ts](../../src/cli/program.ts): call `program.exitOverride()` once
(propagates to all subcommands via Commander's `copyInheritedSettings`, confirmed by
reading `node_modules/commander/lib/command.js`), wrap the final
`program.parse(process.argv)` in a try/catch, and in the catch:

- If `err` isn't a `CommanderError`, rethrow (unchanged behavior for anything else).
- Pass through untouched (`process.exit(err.exitCode)`) for `commander.help`,
  `commander.helpDisplayed`, `commander.version` — these aren't failures.
- For the bad-usage codes (`commander.missingMandatoryOptionValue`,
  `commander.optionMissingArgument`, `commander.missingArgument`,
  `commander.excessArguments`, `commander.unknownOption`, `commander.invalidArgument`):
  - Derive `commandName` from `process.argv[2]`, only trusted if it's one of the five
    known `--json`-capable commands (`ingest`, `correct`, `status`, `explain`,
    `categorize`).
  - If `commandName` is known **and** `process.argv.includes('--json')`, write
    `formatJsonError(commandName, { code: 'INVALID_ARGUMENT', message: err.message })`
    (reusing the existing `json-envelope.ts` export, no new envelope logic) to stderr
    as the final line — Commander's own prose (already written by `.error()` before
    throwing) precedes it, which § 2 of the contract explicitly permits ("Prose
    progress/warning lines... may precede it").
  - Exit **2** — unconditionally, whether or not `--json` was set.
- `commander.unknownCommand` (wholly unrecognized subcommand, e.g. `accounting
  frobnicate`) is deliberately **not** handled — there's no known command name for the
  envelope, mirroring the `migrate`-is-excluded precedent in contract § 8.

**Alternatives considered and rejected:**
- *Per-command `configureOutput()` overrides* — rejected: `writeErr` callbacks have no
  clean way to know the command/`--json` state without re-parsing `argv` anyway;
  one central catch in `program.ts` is simpler.
- *Only emit the JSON line under `--json`, but keep exit 1 without it* — rejected:
  every other `INVALID_ARGUMENT` site in the codebase (`ingest-command.ts`,
  `status-command.ts`, `correct-command.ts`, `categorize-command.ts`, all confirmed by
  grep) calls `exitCode(2)` unconditionally, regardless of `--json`. A two-tier exit
  code for the same logical failure would be a new inconsistency, not a fix.
- *Suppress Commander's own prose* — rejected: unnecessary; § 2 already allows prose to
  precede the final JSON line, and existing paths (`SNAPSHOT_FAILURE`/`WRITE_FAILURE`)
  already interleave this way.
- *Also handle `commander.unknownCommand`* — rejected/out of scope: no command identity
  to report; same rationale as `migrate`'s exclusion.

## Production-code surface (R2)

- `src/cli/program.ts`: add `program.exitOverride()` + try/catch around
  `program.parse(process.argv)`, per above. No changes to any `*-command.ts` file or
  to `json-envelope.ts` — pure reuse of existing exports.
- `docs/cli-json-contract.md` (R31): add a note that Commander-level parse errors
  (missing required option/argument, unknown option, excess arguments) now also
  produce the failure envelope under `--json`, with the explicit `unknownCommand`
  exclusion; note exit code 2 applies even without `--json` for this class of error.
- `tests/features/correct.feature`: update the "Reason required" scenario comment —
  it currently says Commander's `requiredOption` enforcement "is not exercised by any
  test in this suite"; that becomes false once this story lands.

## Gherkin acceptance scenarios

Mechanism: **subprocess** (R7) — this is composition-root (`program.ts`) wiring,
unreachable from any in-process action-handler test; same class as the existing R4
precedent [tests/integration/cli/status-program.test.ts](../../tests/integration/cli/status-program.test.ts).
New/extended assertions live in `tests/integration/cli/` (plain Vitest
`describe/it`, matching that precedent — this repo's R4 tests aren't `.feature` files).

1. **Missing required option under `--json`**
   Given the `ingest` command, When run with `--json` and no `-f/--file`,
   Then it exits 2 and stderr's final line is
   `{"command":"ingest","ok":false,"error":{"code":"INVALID_ARGUMENT","message":"required option '-f, --file <path>' not specified"}}`.
   *fails if* `program.ts` doesn't intercept Commander's
   `missingMandatoryOptionValue` error under `--json` (guards the exact bug reported).

2. **Unknown option under `--json`, different command**
   Given the `status` command (no `requiredOption`s — isolates the `unknownOption`
   code path from the required-option path), When run with `--json --nope`,
   Then it exits 2 and stderr's final line is an `INVALID_ARGUMENT` envelope with
   `"command":"status"`.
   *fails if* the fix only handles missing-required-option and not other Commander
   parse-error codes, or `commandName` resolution breaks for a command with no
   `requiredOption`.

3. **Same failure, no `--json`** — regression guard for the non-json exit-code change
   Given `ingest` with no `-f/--file` and no `--json`,
   Then it exits **2** (not the old Commander default of 1) and stderr contains
   Commander's prose message but **no** JSON line.
   *fails if* the exit-code consistency fix regresses, or a JSON line leaks onto
   stderr when `--json` was never requested.

Additional non-Gherkin verification (edge cases/passthroughs, not separate
TDD-driving scenarios — folded into the Verification plan below): `--help`/`--version`
still exit 0 unaffected; `accounting bogus-command --json` still exits with
Commander's original code and no envelope (explicit scope-boundary guard).

## Slice plan (Reduced lane, R13 target 6–10)

1. `chore(docs): story-maint-26 plan + P1/P2/P3 review` — prep, R30-exempt.
2. `test(cli): ingest --json with -f omitted still prints plain prose, no envelope — failing` — R4 subprocess test, red.
3. `feat(cli): route ingest's commander parse errors through the --json envelope — minimal green` — the `program.ts` change (command-agnostic, but slice 2/3 prove it via `ingest`, the literal reported bug).
4. `test(cli): status/correct/categorize commander parse errors also envelope under --json` — sibling coverage; likely green-on-landing (R10) since the fix is centralized.
5. `test(cli): non-json exits 2 without a JSON line; --help/--version/unknown-command pass through unaffected` — regression guards; likely green-on-landing (R10).
6. `refactor(cli): tidy program.ts parse-error handling` — or empty refactor + R11 justification if nothing to clean up.
7. `chore(docs): cli-json-contract.md commander-parse-error note (R31) + drop stale correct.feature comment`
8. `chore(retro): story-maint-26 retrospective`

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Commander 15.0.0 major bump (issue #223, PR #221 open) may change `CommanderError` codes/`exitOverride` semantics | Note cross-reference in #223; that story must re-verify this fix's code-list against commander 15's behavior before merging the bump. |
| `--json` appearing as the *value* of another option (e.g. `correct --description "--json"`) would false-positive the `argv.includes('--json')` check | Accepted, low-severity edge case — consistent with "don't validate scenarios that can't happen"; noted here, not solved with a full re-parse. |
| Exit code for missing required option/argument/unknown option changes 1 → 2, **including for plain human (non-`--json`) usage** | Deliberate consistency fix (matches every other `INVALID_ARGUMENT` site); called out explicitly here and in the PR description since it's a user-visible behavior change beyond the literal bug report. |
| `commander.unknownCommand` intentionally uncovered | Documented non-goal, mirrors `migrate` exclusion (contract § 8); no follow-up issue unless requested. |

## Verification plan

- `npm run lint && npm run build && npm test` green.
- Manual repro of the user's original report: `npm run ingest -- --json` (no `-f`)
  from a clean checkout → confirm the final stderr line matches the documented
  `INVALID_ARGUMENT` envelope, exit code 2.
- Manual repro without `--json`: confirm exit code 2, prose only, no JSON line.
- Spot-check `--help`, `--version`, `accounting bogus-command --json` unaffected.
- `docs/cli-json-contract.md` updated in the same PR (R31); drift-scan
  (`npx tsx harness/drift-scan/drift-scan.ts`) passes.

## Suggestion log

Filled at Phase 2 (`sibling-overlap` review — Reduced lane drops `plan-reviewer`).
Agent re-ran the sub-loop's sibling check independently (keyword search across all 30
open issues + both open PRs, not just the plan's own claims) — see full report below
the table.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | PR #221 (commander 14→15 bump) + issue #223 (Node/commander-15 major-bump story) — re-confirmed accurate; `CommanderError` code list this story hardcodes should be re-verified when #223 lands | ACKNOWLEDGE | Already carried in the plan's Risks table; no plan change — #223 is the right place to re-verify, not this story. |
| 2 | Issue #88 (`accounting.yaml` symlink-hijacking check) proposes touching `program.ts`, but a different region (config-path validation, near the top) than this story's change (parse-error catch, at the bottom around `program.parse()`) | ACKNOWLEDGE | No conflict; no open PR attacks it. Noted for awareness on future rebases, no action here. |
| 3 | Issue #93 (autotag rules not applying to later rows in the same ingest run) also names `program.ts` (composition-root `transactionBuilder` wiring), again a disjoint region | ACKNOWLEDGE | No conflict; no open PR attacks it. Same disposition as #2. |

**Verdict (agent):** No blocking overlaps. No open PR/issue already addresses the
Commander-parse-error-bypasses-`--json`-envelope gap itself.

## DoR checklist

- [x] Phase 0 (Model): No model impact declared above.
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — `sibling-overlap`, Reduced lane): findings triaged above, all ACKNOWLEDGE, no blockers.
- [ ] Draft PR with template sections 1–6 filled.

## Lane

**Reduced** — `src/cli`-only change (program.ts composition root), no Core/DB/migration
touch. Phase 0 skipped, Phase 2 review = `sibling-overlap` only, Phase 4 review =
`code-reviewer` + `sibling-overlap`. Envelope: R13.
