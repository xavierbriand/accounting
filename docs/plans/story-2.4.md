# Epic 2, Story 2.4 — Interactive Ingest Command (CLI)

## Context

Stories 2.1–2.3 shipped the Core+Infra pipeline: CSV → IngestItems → filtered for dups → built into balanced `Transaction`s with categories and a confidence signal. Story 2.4 is the **first user-facing command**: `accounting ingest -f <file.csv>`. It reads one CSV, runs it through the pipeline, displays a summary, prompts the user to confirm/fix any low-confidence auto-tag, and exits without writing. DB writes + snapshot + atomic commit are Story 2.5.

**Why this story is bigger than the others.** Story 2.4 wraps four distinct concerns that previous stories kept isolated:
- **File I/O boundary** — Latin-1 read of the BPCE CSV.
- **Filename-to-source matching** (issue #25 comes home).
- **Pipeline orchestration** (parse → dedup → build).
- **Interactive UX** (table display, per-item prompt with arrow-key nav, final confirmation, `--non-interactive` / `--json` modes).

Plus the quickpickle acceptance-test wiring (issue #24) for the first `.feature` file of the project. Expect ~10 commits — larger than Stories 2.1–2.3 (adapter stories) but defensible given scope. Splitting into 2.4a/2.4b was considered and rejected: the interactive flow is the whole point of the "Sunday Morning Audit" journey; shipping the orchestration without the interactivity would ship half a feature.

**Maintenance sub-loop** (pre-planning, § 6.7): `npm audit` clean, zero Dependabot PRs, 14 open issues (#21, #22, #23, #24, #25, #26, #27, #29, plus older ones). Story 2.4 consumes **#24 (quickpickle)** and **#25 (filename matcher)**; does NOT consume #21 (dbPath traversal — its own security PR) or #22 (homedir fallback — its own PR). No CLAUDE.md § 1 refresh needed if Story 2.3's commit already set "Next story: 2.4" (it did — confirm in commit 1 and keep moving).

## Story (verbatim from [docs/epics.md](docs/epics.md))

> As a User, I want to interactively review and approve the tagged transactions in the terminal, so that I can fix incorrect auto-tags before they are committed.
>
> **AC1:** displays a summary table of "New Transactions Found".
> **AC2:** iterates through low-confidence items asking me to confirm or change the tag.
> **AC3:** supports keyboard navigation (arrows/enter) to select tags.
> **AC4:** does NOT write to the DB until I explicitly confirm the final batch.

FR coverage: **FR5** (interactive tagging), plus consumes and polishes FR4 (multi-bank ingest — via `pickSourceAccount`). Walks PRD § CLI-specific requirements (stdout/stderr separation, `--non-interactive`, `--json`, POSIX exit codes, "Conversational CFO" tone).

## Selected solution

A commander entry point that composes the Story 2.1–2.3 services, plus one new Infra helper and one new UX module.

### New deps (authorised in commit 2)

| Package | Version | Role | Rationale |
| --- | --- | --- | --- |
| `@inquirer/prompts` | ^5.x (or latest stable) | runtime | ESM-native, tree-shakable (`import { select, confirm }`), supports arrow-key `select` per AC3. Modern functional API beats `inquirer` monolith. |
| `cli-table3` | ^0.6 | runtime | Battle-tested ASCII tables. PRD explicitly names it as a reference option. Lighter than bringing in `ink`. |
| `quickpickle` | ^1.11 | dev | Vitest-native Gherkin runner — the first `.feature` lands with this story (closes #24). |

One runtime-dep justification goes in the PR description per engineering-standards.md § "New dependencies".

### CLI wiring

```
src/cli/
├── program.ts                 # NEW — commander entry, defines `ingest` + (existing) `migrate`
├── migrate.ts                 # existing — ported to a subcommand of the new program
└── commands/
    └── ingest-command.ts      # NEW — the orchestration + UX
└── utils/
    ├── printer.ts             # NEW — chalk helpers + cli-table3 table builder
    └── interactive.ts         # NEW — thin wrapper around @inquirer/prompts (mockable)
```

The existing `migrate.ts` becomes a commander subcommand to consolidate the entry point. The `package.json` `migrate` script switches to `tsx src/cli/program.ts migrate`, and a new `ingest` script (or direct invocation) is documented.

### New Infra module — `pickSourceAccount` (closes #25)

```ts
// src/infra/fs/pick-source-account.ts
export function pickSourceAccount(
  filePath: string,
  accounts: readonly AccountConfig[],
): Result<AccountConfig>;
```

- Takes the full path, computes `basename(filePath)`.
- Returns the **longest-prefix** match against `accounts[].filenamePrefix`.
- `Result.fail` with a PII-safe message for zero matches ("no account configured for this filename — add an entry to `accounts:` in accounting.yaml") or tied-length multi-match ("ambiguous filename — multiple account prefixes match").
- Lives under `src/infra/fs/` (not `src/cli/utils/`) because it operates on a filesystem concept (basename) and has no CLI/UX concerns — reusable from a future non-CLI caller.

### New Infra module — BPCE Latin-1 file reader

```ts
// src/infra/fs/read-bpce-csv.ts
export function readBpceCsv(filePath: string): Result<string>;
```

- `fs.readFileSync(filePath, 'latin1')` — honors Story 2.1's documented contract.
- Catches `ENOENT`, `EACCES`, etc. → `Result.fail` with user-friendly, PII-safe messages (name the path's basename, not the full absolute path, to avoid leaking home-directory structure into logs).
- A dedicated module (not inline in the command) so a future non-CLI caller (a future web UI? a test harness?) can reuse it without pulling in commander.

### Command handler signature

```ts
// src/cli/commands/ingest-command.ts
export interface IngestCommandOptions {
  readonly file: string;
  readonly nonInteractive: boolean;
  readonly json: boolean;
}
export interface IngestCommandDeps {
  readonly configService: ConfigService;
  readonly csvParser: CsvParser;
  readonly idempotencyService: IdempotencyService;
  readonly transactionBuilder: TransactionBuilder;
  readonly pickSourceAccount: typeof pickSourceAccountImpl;
  readonly readFile: typeof readBpceCsvImpl;
  readonly prompt: InteractivePrompter;  // mockable in tests; the real one delegates to @inquirer/prompts
  readonly stdout: Writable;
  readonly stderr: Writable;                // honored for NON-prompt messages only (see note below)
  readonly exitCode: (code: number) => void;
}
export async function runIngestCommand(opts: IngestCommandOptions, deps: IngestCommandDeps): Promise<void>;
```

The command is **async** (inquirer prompts are awaited) and takes a `deps` object so every collaborator is injectable in tests. The real `program.ts` wires production instances; tests inject fakes.

**Caveat — inquirer + injected streams.** `@inquirer/prompts` writes prompt output directly to `process.stderr` / reads from `process.stdin`; it does **not** honour the injected `stderr` `Writable`. That's fine: the `InteractivePrompter` abstraction is the mock surface in tests, so the real prompt-side stream is irrelevant in test runs. The injected `stderr` is used **only** for non-prompt messages the handler writes itself (summary counts, error messages, conversational info). This is flagged per Plan agent pushback; unit tests for stderr assertions only cover non-prompt paths.

### Interactive flow (per-item, matches AC2+AC3+AC4)

Per the AC wording "iterates through low-confidence items asking me to confirm or change the tag" — this is a **per-item loop**, not review-all-then-confirm. Sequence:

1. Parse + dedup + build (via Story 2.1–2.3 services).
2. Print to stderr: `"Found N new transactions — M auto-tagged, K need review."` (Conversational CFO tone; message never appears on stdout.)
3. Print to stdout the summary table of all N items: columns `Date | Description | Amount | Category | ✓`. High-confidence items get `✓`; low-confidence items show `?` in that column.
4. For each low-confidence `BuildOutcome` (in input order): show a single-line prompt to stderr ("`? UBER TRIP → Transport (auto). Confirm or change?`") and an `@inquirer/prompts.select` with options `[Keep: Transport, Change to: Groceries, Change to: Restaurant, …, Change to: Uncategorized, Abort]`. User's selection updates that item's category + recomputes the `BuildOutcome`'s `category` and sets `confidence: 'high'`.
5. After the loop, prompt via `@inquirer/prompts.confirm`: `"Commit these N transactions? (nothing will be written yet — Story 2.5 adds DB writes)"` — default **no**.
6. Exit 0 on accept with a message naming the count of confirmed items; exit 1 on decline or mid-flow abort.

### `--non-interactive` / `--ci` mode (PRD requirement)

- Every low-confidence item is a fail condition in non-interactive mode. Print to stderr: `"K items need manual review. Run without --non-interactive to review them, or re-ingest after updating accounting.yaml's auto-tag-rules."` Exit with code 2 (invalid input semantics per POSIX). No prompts.
- High-confidence-only batches succeed the same as interactive mode (but the final confirm is skipped — non-interactive implies auto-confirm).

### `--json` output mode

- Disables interactive prompts (implies `--non-interactive`).
- Prints a single JSON object to stdout on success:
  ```json
  { "file": "…", "source_account": "main-…", "summary": { "total": N, "autoTagged": M, "needsReview": K, "duplicates": D, "parseErrors": E }, "items": [ { "id": "…", "occurredAt": "…", "description": "…", "amount_cents": …, "currency": "EUR", "debit": "Expense:…", "credit": "Assets:Bank:…", "category": "…", "classification": "…" }, … ] }
  ```
- `idempotencyHash` is **omitted from the output** — YAGNI (no caller today needs it, and Story 2.2 retro's invariant is that the hash is a DB-boundary concern, not a CLI-output concern). Add the field if/when a downstream tool asks for it. *(Revised per Plan agent pushback: earlier draft cited "leak-by-derivation" as the reason — that's bogus since SHA-256 is one-way. YAGNI is the real justification.)*
- `--json` + non-high-confidence item → exit 2 + empty-items JSON + a `"needsReview"` array with item-ids.

### Exit code map

| Code | Meaning |
| --- | --- |
| 0 | Success — batch assembled and confirmed (or auto-confirmed). |
| 1 | Runtime error — file not found / parse stage failed at file level / user aborted during interactive loop / final confirm declined. |
| 2 | Invalid input — no matching account for filename, or `--non-interactive` with items needing review, or `--json` with items needing review. |

Stderr carries all human-facing messages (prompts, errors, conversational info). Stdout is reserved for the summary table (human) OR the JSON payload (`--json`). This keeps piping clean.

### Quickpickle wiring (closes #24)

- `npm install --save-dev quickpickle`.
- Add `tests/features/` directory + `tests/features/ingest.feature` with ONE happy-path scenario mirroring the Story 2.4 journey from the PRD's "Sunday Morning Audit" (read a synthetic CSV, inspect the summary, confirm — no real prompts, step defs stub `@inquirer/prompts` by injecting a deterministic `InteractivePrompter`).
- Wire vitest config per quickpickle docs. Step definitions in `tests/features/steps/ingest.steps.ts`.
- Strictly one `.feature` + one `.steps.ts` for this story. More scenarios are added in subsequent stories as CLI commands land.

### Rationale (vs alternatives)

- **`@inquirer/prompts` over `inquirer` / `prompts`.** ESM, tree-shakable, per-component import, active maintenance. `select` is the exact affordance AC3 requests.
- **`cli-table3` over hand-rolled.** PRD explicitly names it. Handles column alignment, truncation, coloured cells — avoids reinventing string padding for wide multilingual descriptions.
- **Quickpickle now, not later.** Closes #24; Story 2.4 is the first story with a user-visible behaviour that benefits from outside-in BDD.
- **`pickSourceAccount` in `src/infra/fs/`** (not `src/cli/utils/`). It's a filesystem-concept helper (basename matching); lives where `readBpceCsv` lives. A future non-CLI caller (e.g., a planned PWA) can reuse it.
- **Per-item prompt loop** (not review-all-then-confirm). AC literally says "iterates through" + "asking me to confirm or change". Per-item is also the journey ("Alex quickly tags them using arrow keys").
- **Single file per invocation.** AC says "a list of proposed transactions" (singular batch). User with 5 CSVs runs 5 invocations. Multi-file in one call would widen scope + complicate per-item source tagging. Future story if needed.
- **Runtime command-handler takes a `deps` object** (not a class). Two motivations: the command is fundamentally a script (not stateful domain logic), and `deps` is friendlier to vitest test doubles than constructor DI for async orchestration. Matches the `runMigrations(db)` style in `src/cli/migrate.ts`.
- **`exitCode` injection + no direct `process.exit`.** Per security-checklist.md § "Core contains no … `process.exit`" — the CLI is not Core, but injecting the exit lets tests assert exit codes without killing vitest.

## Critical files to create / touch

| Path | Change |
| --- | --- |
| `docs/plans/story-2.4.md` | **new** — this file (committed in chore 1 with CLAUDE.md § 1 refresh) |
| `package.json` | **edit** — add runtime deps (`@inquirer/prompts`, `cli-table3`) + dev dep (`quickpickle`); add `"ingest": "tsx src/cli/program.ts ingest"` script |
| `vitest.config.ts` / `vitest.config.js` | **edit** — wire quickpickle per its docs |
| `src/cli/program.ts` | **new** — commander entry: defines `ingest`, wraps existing `migrate` |
| `src/cli/migrate.ts` | **edit** — extract a `runMigrate(dbPath)` function; guard the top-level execution with `if (import.meta.url === \`file://${process.argv[1]}\`)` so importing the module from `program.ts` doesn't re-run migrations. Missing this guard would cause `npm run migrate` and `program.ts migrate` to both trigger — or worse, an `ingest` invocation that transitively imports `migrate.ts` would run migrations as a side-effect. Explicit guard closes that off. *(Plan agent catch.)* |
| `src/cli/commands/ingest-command.ts` | **new** — `runIngestCommand(opts, deps)` |
| `src/cli/utils/printer.ts` | **new** — chalk colour helpers + `formatSummaryTable(items)` using `cli-table3` |
| `src/cli/utils/interactive.ts` | **new** — `InteractivePrompter` interface + `inquirerPrompter` implementation |
| `src/infra/fs/pick-source-account.ts` | **new** — closes #25 |
| `src/infra/fs/read-bpce-csv.ts` | **new** — Latin-1 fs wrapper |
| `tests/unit/infra/fs/pick-source-account.test.ts` | **new** — zero, one, longest-wins, tied cases |
| `tests/unit/infra/fs/read-bpce-csv.test.ts` | **new** — happy path, ENOENT, EACCES |
| `tests/unit/cli/commands/ingest-command.test.ts` | **new** — orchestration with mocked deps (parser/idempotency/builder stubs); interactive loop with mock prompter; `--non-interactive`, `--json`, exit-code assertions |
| `tests/features/ingest.feature` | **new** — one happy-path scenario |
| `tests/features/steps/ingest.steps.ts` | **new** — step definitions invoking `runIngestCommand` with stubbed deps |
| `CLAUDE.md` | no edit (position line was refreshed in Story 2.3) |
| `accounting.example.yaml` | no edit (accounts already have `type`/`cardSuffix`) |

Reuses: `FileConfigService` ([src/infra/config/config-service.ts](src/infra/config/config-service.ts)), `NodeCsvParser` ([src/infra/csv/node-csv-parser.ts](src/infra/csv/node-csv-parser.ts)), `IdempotencyService` + `SqliteHashRepository` + `NodeHashFn` (Story 2.2), `TransactionBuilder` + `nodeUuidGen` (Story 2.3), `Result` ([src/core/shared/result.ts](src/core/shared/result.ts)).

**Not in scope:** DB writes (Story 2.5), snapshot backup (Story 2.5), `--dry-run` flag (Story 2.5 — Story 2.4 is implicitly dry-run by not writing), multi-file ingest in one invocation, user-customisable auto-tag rules (YAML overrides), path-traversal validation on the `-f` argument (file #21's scope — filed separately so it can land independently). `--json` output is **in scope** for this story per PRD requirement that every command support it.

## Gherkin scenarios

Two lanes of tests:
- **Acceptance (quickpickle / `.feature`):** one happy-path scenario wiring the full CLI with stubbed prompter.
- **Unit:** `tests/unit/cli/commands/ingest-command.test.ts` for per-behaviour coverage, stubbing deps.

```gherkin
# tests/features/ingest.feature — ONE scenario for this story; more follow as commands land
Feature: Ingest command — interactive tagging & confirmation

  Scenario: AC1+AC4 — happy path through a 5-row BPCE CSV
    Given an accounting.yaml with a bank account 'main-X' (filenamePrefix "X_") and a card account 'card-1234' (cardSuffix "1234")
    And a 5-row BPCE CSV at /tmp/X_2026.csv with 3 high-confidence items + 2 low-confidence items
    And the user's prompter is scripted to: keep the first low-confidence tag, change the second to 'Groceries', confirm the final batch
    When I run `accounting ingest -f /tmp/X_2026.csv`
    Then stderr shows "Found 5 new transactions — 3 auto-tagged, 2 need review."
    And stdout shows a 5-row table including Date/Description/Amount/Category columns
    And the second low-confidence item's category is 'Groceries' (not its original auto-tag)
    And the final confirm prompt appears once
    And the exit code is 0
    And the database file is NOT modified (no writes — Story 2.5)
    # fails if: the summary says a wrong count, the interactive loop is skipped entirely, the per-item
    # change isn't applied to the BuildOutcome, or the command writes to the DB
```

Unit-test scenarios (each as one `describe`, one `it` per assertion):

```gherkin
  Scenario: --non-interactive with zero low-confidence items exits 0
    Given the CLI run with --non-interactive and only high-confidence items
    When I run it
    Then exit code 0 and no prompts fire
    # fails if: the command falsely flags high-confidence as needing review

  Scenario: --non-interactive with low-confidence items exits 2 without hanging
    Given the CLI run with --non-interactive and at least one low-confidence item
    When I run it (test wrapped in vitest `{ timeout: 500 }`)
    Then exit code 2 and stderr names the count needing review
    # fails if: the command prompts anyway (hang risk in CI — the 500ms timeout would catch a regression
    # that silently reintroduces the prompt call). Explicit timeout per Plan agent catch.

  Scenario: --json with low-confidence items exits 2 and emits needsReview list
    Given the CLI run with --json and low-confidence items
    When I run it
    Then stdout is a single JSON object including needsReview[] with the item ids
    And exit code 2
    # fails if: stdout is polluted with human-readable strings, or JSON is malformed

  Scenario: --json success output includes debit/credit accounts, NO idempotency hashes
    Given a successful ingest with --json and all high-confidence items
    When I run it
    Then stdout JSON.items[*] has debit/credit/category/classification fields
    And NO items[*].idempotencyHash appears anywhere in the output
    # fails if: JSON leaks hashes (leak-by-derivation from descriptions)

  Scenario: filename with no matching account exits 2
    Given an accounting.yaml with accounts whose prefixes do NOT match the file's basename
    When I run `accounting ingest -f /tmp/orphan.csv`
    Then exit code 2 and stderr says 'no account configured for this filename'
    # fails if: exit is 1 (runtime-error semantics) or 0, or we silently pick any account

  Scenario: ambiguous filename match exits 2
    Given two accounts with tied-length prefixes that both match the file's basename
    When I run ingest
    Then exit code 2 and stderr says 'ambiguous filename'
    # fails if: the command picks the first-declared account silently

  Scenario: mid-loop abort exits 1 without writing
    Given the user selects 'Abort' during the interactive loop
    When I run ingest
    Then exit code 1 and stderr shows a "ingest cancelled" message
    # fails if: the partial state gets written (no DB writes expected anyway — Story 2.5 will enforce)

  Scenario: final confirm declined exits 1
    Given the user answers 'no' to the final confirm
    When I run ingest
    Then exit code 1 and stderr shows cancel message
    # fails if: exit is 0 and the command claims success without commit

  Scenario (#25): pickSourceAccount unit tests
    Given: [1-prefix-match, 0-matches, 2-longest-wins, tied-length-multi-match, empty-accounts] cases
    Then each produces the expected Result
    # fails if: the longest-prefix-wins rule is implemented as first-wins, or ties don't fail
```

## Plan for Sonnet (commit slices)

Story 2.4 is intrinsically bigger than an adapter story. Target **9–11 commits**; the adapter-story sizing rule from § 6.6 doesn't strictly apply (this is orchestration + UX + deps + acceptance-test framework bootstrap). Every subject carries `(Story 2.4)`.

1. `chore(docs): add Story 2.4 plan + file/ingest script scaffolding (Story 2.4)` — commits the plan file and the new `ingest` script entry in `package.json` (empty `program.ts` stub that throws).
2. `chore(deps): authorise @inquirer/prompts + cli-table3 + quickpickle (Story 2.4)` — `npm install` + commit `package.json` + `package-lock.json`. One-line justification per dep in the commit body (per engineering-standards.md). Wire `vitest.config.ts` for quickpickle.
3. `test(fs): pickSourceAccount longest-prefix match — failing (Story 2.4)` — covers zero/one/longest-wins/tied cases. Closes part of #25.
4. `feat(fs): pickSourceAccount + readBpceCsv minimal green (Story 2.4)` — implementations. Both helpers land together because they're the two small Infra/fs modules and tests for `readBpceCsv` are cheap to include in the same slice.
5. `test(cli): ingest command orchestration + summary table — failing (Story 2.4)` — unit tests for the happy path with stubbed deps + the summary table output shape. Creates `runIngestCommand` signature, empty body returns `exit(99)`.
6. `feat(cli): ingest command orchestration + printer + interactive loop minimal green (Story 2.4)` — implements `runIngestCommand`, `printer.ts`, `interactive.ts` wrapper. Wires `program.ts` commander routing (now covers `ingest` and the existing `migrate`).
7. `test(cli): --non-interactive + --json modes + exit codes — failing (Story 2.4)` — unit tests for the flag-driven branches.
8. `feat(cli): --non-interactive + --json minimal green (Story 2.4)` — implementation.
9. `test(features): ingest.feature happy-path scenario — failing (Story 2.4)` — first `.feature` + step defs, quickpickle-wired. Closes #24.
10. `feat(features): wire steps to runIngestCommand — minimal green (Story 2.4)` — step definitions construct stub deps and assert outputs. Proves the wiring works end-to-end through the quickpickle runner.
11. `refactor(cli): tidy ingest command (Story 2.4)` — or empty-refactor per § 6.4 if nothing to clean.

### Deps pre-authorised

- `@inquirer/prompts ^5` — runtime — rationale: ESM-native select prompt for AC3 arrow-key navigation; tree-shakable vs `inquirer` monolith.
- `cli-table3 ^0.6` — runtime — rationale: PRD-recommended table rendering; battle-tested.
- `quickpickle ^1.11` — dev — rationale: closes #24; Vitest-native Gherkin runner to land the first `.feature` file.

### Verification (end-to-end)

- `npm run lint && npm run build && npm test` all green.
- Every Gherkin scenario has a corresponding test.
- 100% branch coverage on `src/core/*` (unchanged by this story); pragmatic coverage on `src/cli/*` (every exit code path, every flag branch).
- **Manual smoke test (recommended, not blocking):** build + `node dist/cli/program.js ingest -f tests/fixtures/csv/bpce-valid.csv` against a local accounting.yaml referencing the fixture. Expected: summary table + interactive loop triggers on the synthetic low-confidence row if the fixture has one. Do NOT run against real `~/Downloads` data in CI.

## Risks & deferrals

- **Path-traversal validation on `-f`** (related to #21) — not in scope. #21 covers dbPath; a future PR can harden the CSV path too. For MVP, Node's own `fs.readFileSync` errors are acceptable.
- **homedir fallback (#22)** — not touched; independent fix in its own PR.
- **Multi-file ingest in one invocation** — deferred; user runs the command once per file. If ergonomics become painful after first-week usage, a future story can add `-f <file> -f <file>`. If the real-data run surfaces >15 low-confidence items per file (tedium risk on the per-item prompt), file a "batch-review mode" follow-up story (Story 2.4b).
- **User-customisable auto-tag rules (YAML overrides)** — still deferred (trigger condition from Story 2.3's plan — hasn't fired). Story 2.4's interactive per-item change is the MVP affordance.
- **Commit-stage atomicity + snapshot** — Story 2.5's scope. Story 2.4 deliberately ends at "confirmed batch" — no DB write, no backup.
- **Rich JSON output schema** — this story's `--json` is functional but minimal. Later stories (reports, explain) will expand.
- **Performance NFR (#27)** — the benchmark belongs after Story 2.5's full pipeline; Story 2.4's CLI already runs all of parse + dedup + build, so anecdotally we can note timing in the retro, but the gated NFR test lands with 2.5.
- **Quickpickle wiring fallback plan.** Slices 9–11 install and wire quickpickle + land the first `.feature` scenario. If quickpickle's vitest integration turns out to be fragile (config surprises, ESM-loader quirks, TS strict interop), Sonnet should **STOP at slice 8 and return with a clear note** — Story 2.4 then ships without quickpickle (the unit tests already cover every scenario) and #24 gets handled in a dedicated follow-up PR. Do NOT burn an hour wrestling quickpickle inside this story if the first wiring attempt doesn't take cleanly.

## Carryovers resolved

- Story 2.2 retro action B — Phase 4 will audit "this test fails if …" notes against production paths (applies to the unit tests introduced here).
- Story 2.3 retro action A — sonnet-implementer § 3 60-LOC-trigger already landed; applies to `runIngestCommand` which is likely to brush 50–80 LOC before extraction.
- #24 (quickpickle wiring) closes with slices 9–10.
- #25 (filename matcher) closes with slices 3–4.
