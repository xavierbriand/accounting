# Story maint-09 — Fix `TransactionBuilder` empty-accounts wiring + retire stale Story 2.5 prompt

## Context

Tenth story on the pre-Epic-3 maintenance track. Closes [#60](https://github.com/xavierbriand/accounting/issues/60) (the bug) and [#61](https://github.com/xavierbriand/accounting/issues/61) (the polish). Surfaced during a manual end-to-end ingest test against a real BPCE export — the exact rehearsal the workflow asks for before opening the Story 3.2 plan.

**The bug.** [src/cli/program.ts:66](src/cli/program.ts) constructs `new TransactionBuilder([], undefined, nodeUuidGen)` — empty accounts array — *before* the config that holds the accounts is loaded. Since [transaction-builder.ts:87-90](src/core/ingest/transaction-builder.ts) rejects any `sourceAccount` not present in `this.accounts`, every row of every real CSV is rejected with `Build failed for "...": Unknown sourceAccount: <id>` and the user lands on `Found 0 new transactions`. Ingest is functionally dead end-to-end.

**Why CI didn't catch it.** Every existing unit test (`tests/unit/cli/commands/ingest-command*.test.ts`) injects a mock `transactionBuilder: { buildAll: () => Result.ok(...) }`, bypassing the real class entirely. The integration test ([tests/integration/cli/ingest-commit.test.ts:82](tests/integration/cli/ingest-commit.test.ts)) constructs a real `TransactionBuilder([mainAccount], ...)` *directly* — never exercising the `program.ts` wiring. There is no test that runs the actual CLI entry point against a real CSV. Closing this gap is part of this story.

**The polish.** [src/cli/utils/interactive.ts:41](src/cli/utils/interactive.ts) still says `(nothing will be written yet — Story 2.5 adds DB writes)` in the confirm prompt. Story 2.5 has shipped; `commitBatch` does real writes with snapshot + rollback. The parenthetical is now a misleading claim that ingest is a dry run. Riding along — both fixes touch the ingest CLI surface and bundling avoids a separate trivial PR.

**Maintenance sub-loop (§ 6.7)** run 2026-04-25 pre-planning:
- `git status` clean (working tree reverted), main synced.
- Open issues: 5 prior `deferred-suggestion` items + #60 / #61 just filed. Priorities unchanged.
- Dependabot: no open PRs.
- `npm audit`: no high/critical (unchanged from story-maint-08 baseline).
- **Proceed-to-planning.**

## Story

> As a couple managing finances on this CLI, I want `accounting ingest` to actually build transactions from real bank CSVs (not reject every row) so that I can review and commit them — and I want the confirmation prompt to stop telling me writes won't happen.

Closes #60 and #61. No FR coverage (defect repair + cosmetic polish). Walks [docs/engineering-standards.md](docs/engineering-standards.md) (DI shape) and [docs/architecture.md](docs/architecture.md) (composition root).

## Selected solution

Two options considered for #60.

**Option A — factory injection** (chosen). Change `IngestCommandDeps.transactionBuilder` from a pre-built `Pick<TransactionBuilder, 'buildAll'>` instance to a factory `(accounts: readonly AccountConfig[]) => Pick<TransactionBuilder, 'buildAll'>`. Inside `runIngestCommand`, after `loadAndParse` returns `config`, call `transactionBuilder(parsed.config.accounts).buildAll(fresh)`. In `program.ts`, pass `(accounts) => new TransactionBuilder(accounts, undefined, nodeUuidGen)`.

- Pro: dependency type now reflects what the command actually needs ("a way to build transactions given accounts"), not a frozen instance.
- Pro: no double config load. Config is loaded once, accounts flow through naturally.
- Pro: integration test simplifies — `mainAccount` is already in `config.accounts`; the factory picks it up.
- Con: every test that mocks `transactionBuilder` updates mechanically (`{ buildAll: ... }` → `() => ({ buildAll: ... })`). Six tests, ~30 sec of edits. Acceptable cost.

**Option B — eager config load in `program.ts`**. Load config inline in the `ingest` action before constructing the builder; pass `config.accounts` to the constructor; let `runIngestCommand` reload config inside `loadAndParse` as today.

- Pro: smaller diff (one file, no test changes — mocks keep their shape).
- Con: config is loaded twice per invocation. Cheap but wrong.
- Con: leaves the architectural smell — the dep type still says "I need a pre-built instance" when the truth is "I need a factory taking accounts". Future-us trips on this again.
- Con: error handling for the eager load duplicates the path inside `loadAndParse`. Two error sources for the same failure.

**Option A chosen.** Smaller test churn isn't worth the design lie. The factory shape is the honest expression of the dependency.

For #61 — single option: drop the parenthetical from the confirm message. No alternative considered (string change, one line).

### Chosen implementation

1. **[src/cli/commands/ingest-command.ts](src/cli/commands/ingest-command.ts)** — define a named type alias and change the dep type:
   ```typescript
   export type TransactionBuilderFactory =
     (accounts: readonly AccountConfig[]) => Pick<TransactionBuilder, 'buildAll'>;

   export interface IngestCommandDeps {
     // ...
     readonly transactionBuilder: TransactionBuilderFactory;
     // ...
   }
   ```
   Inside `runIngestCommand`, replace `transactionBuilder.buildAll(fresh)` with:
   ```typescript
   const builder = transactionBuilder(parsed.config.accounts);
   const buildResult = builder.buildAll(fresh);
   ```

2. **[src/cli/program.ts](src/cli/program.ts)** — replace the empty-array constructor with a factory lambda. Use `ConstructorParameters<typeof TransactionBuilder>[0]` so `AccountConfig` doesn't need to be imported at the composition root:
   ```typescript
   const transactionBuilder = (accounts: ConstructorParameters<typeof TransactionBuilder>[0]) =>
     new TransactionBuilder(accounts, undefined, nodeUuidGen);
   ```

3. **[src/cli/utils/interactive.ts:41](src/cli/utils/interactive.ts)** — drop the parenthetical:
   ```typescript
   message: `Commit these ${count} transactions?`,
   ```

4. **Tests — mechanical updates** (factory shape):
   - [tests/unit/cli/commands/ingest-command.test.ts](tests/unit/cli/commands/ingest-command.test.ts) — six occurrences of `transactionBuilder: { buildAll: ... }` → `transactionBuilder: () => ({ buildAll: ... })`.
   - [tests/unit/cli/commands/ingest-command-flags.test.ts](tests/unit/cli/commands/ingest-command-flags.test.ts) — five occurrences, same shape change.
   - [tests/integration/cli/ingest-commit.test.ts:82-98](tests/integration/cli/ingest-commit.test.ts) — drop the local `const transactionBuilder = new TransactionBuilder([mainAccount], ...)`; replace the deps entry with `transactionBuilder: (accounts) => new TransactionBuilder(accounts, undefined, nodeUuidGen)`. The factory will be called with `config.accounts` which already contains `mainAccount`.
   - [tests/perf/ingest-throughput.test.ts:135-155](tests/perf/ingest-throughput.test.ts) — same shape change as integration test.

5. **New regression test (the gap that let #60 ship)** — `tests/integration/cli/ingest-end-to-end-wiring.test.ts`:
   - Reuses the tsx-spawn pattern from [uninit-db-hint.test.ts](tests/integration/cli/uninit-db-hint.test.ts).
   - Setup per test: `mkdtempSync` a tmpdir; copy `tests/fixtures/csv/bpce-valid.csv` to `<tmp>/bpce-valid_real.csv`; write a minimal `accounting.yaml` to `<tmp>` with one bank account whose `filenamePrefix: "bpce-valid_"`; spawn `migrate` to seed schema; spawn `ingest` against the CSV with `cwd=<tmp>` so `FileConfigService` finds the local YAML.
   - **Assertion strategy** — assert on the stderr `Found N new transactions` line, *not* on JSON `summary.total`. Rationale (P1 critical review): the BPCE fixture's `Libelle simplifie` columns include `SUPERMARCHE FICTIF`, `PHARMACIE IMAGINAIRE`, `TRANSPORT FICTIF` — none of which match any [auto-tag-rules.ts](src/core/ingest/auto-tag-rules.ts) pattern → 3 low-confidence. With `--non-interactive`, that triggers exit 2 *before* the JSON `items` array is populated. The pre-low-confidence stderr line `Found 5 new transactions — 2 auto-tagged, 3 need review.` is the only assertion that's both (a) robust to confidence routing and (b) directly tied to the bug class (under the bug it reads `Found 0 new transactions`).
   - Assertions:
     - stderr matches `/Found 5 new transactions/`.
     - stderr does **not** match `/Build failed/`.
     - exit code is 2 (low-confidence count is non-zero under the fix). A failing pre-fix run exits 0 (zero built, zero low-confidence), so the exit-code assertion is itself a regression signal.
   - **Sanity check** the test by reverting the fix locally and confirming it fails with the `Unknown sourceAccount` flood. (Sonnet returns this confirmation in the red→green log per Story 1.3 retro action E.)

6. **No test for #61.** Asserting the exact prompt text is fragile (any future wording polish breaks it for no signal). Cosmetic chore commit; verified by code review. Decision documented here so the P1 retro-check (Story 2.5 retro action C — Gherkin-to-test mapping audit) treats the absence as deliberate, not a coverage gap.

## Gherkin acceptance scenarios

```gherkin
Feature: Ingest CLI builds transactions from real bank CSVs

  Scenario: Real BPCE fixture ingests with all rows built (regresses #60)
    Given an accounting.yaml with one bank account whose filenamePrefix is "bpce-valid_"
    And a CSV at <tmp>/bpce-valid_real.csv copied from tests/fixtures/csv/bpce-valid.csv
    And a fresh migrated DB at <tmp>/test.db
    When I run `accounting ingest --file <csv> --non-interactive --json --db-path <tmp>/test.db` with cwd=<tmp>
    Then stderr contains "Found 5 new transactions"
    And stderr contains no "Build failed" lines
    And the process exits with code 2 (3 low-confidence rows trigger needs-review path)
```

(One scenario only. Issue #61 is a cosmetic chore — no Gherkin, by design; see § "No test for #61" above.)

## Slice plan for Sonnet

Target **5 commits + retrospective**. Slightly under the 6–10 band — defended below.

1. **`test(cli): ingest end-to-end wiring against real CSV — failing (story-maint-09)`**
   - New file `tests/integration/cli/ingest-end-to-end-wiring.test.ts` per § 5 above.
   - Fails under current code: every row trips `Unknown sourceAccount`, stderr shows `Found 0 new transactions` (assertion `/Found 5 new transactions/` fails) and is full of `Build failed` (assertion `not.toMatch(/Build failed/)` fails). Exit code is 0 (vs 2 under the fix), failing that assertion too.
   - Sonnet's red→green log must include the literal `Unknown sourceAccount` line from the failing run, proving the test exercises the bug.

2. **`feat(cli): TransactionBuilder factory injection — minimal green (story-maint-09)`**
   - Apply changes 1, 2, 4 from § "Chosen implementation" (production code + mechanical test mock updates + new `TransactionBuilderFactory` type alias).
   - All previously-green tests stay green. The new subprocess test from slice 1 turns green.

3. **`chore(cli): drop stale Story 2.5 placeholder from confirm prompt (story-maint-09)`**
   - Apply change 3. One-line edit. No test (rationale in § "No test for #61").

4. **`refactor: empty slot — no cleanup identified (story-maint-09)`**
   - Per § 6.4. The factory-injection change is itself the cleanup; no further restructuring opportunity surfaces. Body documents the no-op.

5. **`chore(retro): story-maint-09 retrospective`** — Keep / Change / Try.

**Why 5 commits, not 6–10.** The CLAUDE.md band is for feature stories that span multiple Gherkin scenarios. This story has one acceptance scenario (#60 regression) plus one trivial chore (#61). Splitting the factory diff into more `test:` / `feat:` pairs would over-decompose — the unit-test mock updates can't be tested independently of the factory landing (TypeScript compile fails until both move together). Adapter-rule analogue from Story 2.1 retro: the minimum-viable fix intrinsically bundles the production change and its mock surface. Slicing finer here invites green-on-landing collapses.

## Risks & deferred items

- **Subprocess test cost.** One tsx spawn (well, two: migrate + ingest) adds ~2 s to the integration tier. Tolerable; same pattern is already in use for two prior tests. Watch the trend — if subprocess tier breaks 10 s aggregate, story-maint-XX should harvest into a faster shape (compiled `dist/` invocation, perhaps).
- **Parent-directory cwd assumption.** The new test relies on `tsx` being invocable from `node_modules/.bin/tsx` and the program.ts at a fixed relative path — same brittleness as `uninit-db-hint.test.ts`. If the project layout ever shifts, both tests update together.
- **Fixture-row-count coupling.** The test asserts `Found 5 new transactions`. Adding a 6th row to `bpce-valid.csv` deliberately invalidates this assertion — the test reminds maintainers to confirm the new row's expected confidence routing. Acceptable coupling for a regression test that's specifically tied to the fixture contents.
- **No assertion on the prompt-string change for #61.** Documented above. If wording drift becomes a recurring issue in retros, a tiny snapshot test of the message strings could be added in a future maintenance story; not worth introducing snapshot infra for one line today.
- **`AppConfig.dbPath` still unused at the wiring boundary.** Same observation as story-maint-04 retro: the YAML's `dbPath` field isn't read by `program.ts` (only `--db-path` flag is). Out of scope here; flagged again so the next person to wire it does so via `validateDbPath` and the same factory pattern.

## Verification plan

End-to-end manual verification by the user (not Sonnet) before merging:
1. `rm -f accounting.db accounting.db-shm accounting.db-wal && npm run migrate`
2. `npm run ingest -- --file ~/Downloads/04154785438_21042025_21042026.csv --non-interactive --json` — expect zero `Build failed` lines and an actual transaction count in the `Found N new transactions` stderr line.
3. Run interactively (no `--non-interactive`) and confirm the prompt reads `Commit these N transactions?` without the Story 2.5 parenthetical.

CI gates: `npm run lint && npm run build && npm test` green. The new subprocess test is in the integration tier, runs by default.

## Suggestion log

Phase 2 (P1 / P2 / P3) run by Opus on 2026-04-25.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Original plan asserted `summary.total === 5` and exit 0. The BPCE fixture's `Libelle simplifie` columns (`SUPERMARCHE FICTIF`, `PHARMACIE IMAGINAIRE`, `TRANSPORT FICTIF`) match no auto-tag rules → 3 low-confidence under the fix → `--non-interactive` exits 2 *before* writing the full JSON `items` array. JSON-based assertion would fail under both bug and fix. | adopted | Test redesigned to assert on the stderr `Found N new transactions` line (fires before low-confidence early-exit) + exit code 2. See § "Chosen implementation" item 5. |
| P1 | Sonnet's red→green log must literally show the failing run produces the `Unknown sourceAccount` flood, not just "test failed". | adopted | Added explicit instruction in slice 1; codifies Story 1.3 retro action E for this story. |
| P2 | Privacy: the new test writes a stub `accounting.yaml` with partner names. Real names (`Alex` / `Sam`) are template values from `accounting.example.yaml`; no PII exposure. Fixture CSV uses fictional vendors (`SUPERMARCHE FICTIF` etc.). | rejected | No PII concern; template names are by design. |
| P3 | The `IngestCommandDeps.transactionBuilder` factory should have a named type alias rather than an inline function type, both for readability and so future deps that need a similar shape can reference the same name. | adopted | Added `export type TransactionBuilderFactory = ...` to `ingest-command.ts`. See § "Chosen implementation" item 1. |
| P3 | Should there be a helper `writeTestConfig(tmpDir, opts)` for inline YAML-write reuse? The new subprocess test inlines the YAML; future subprocess tests might too. | rejected | Premature abstraction. Single caller today; YAML write is 5–10 lines. Revisit when a third subprocess test needs it. |
| P3 | `program.ts` annotates the factory parameter as `ConstructorParameters<typeof TransactionBuilder>[0]` rather than importing `AccountConfig` directly. Coupling smell? | rejected | Composition root is allowed to peek at concrete-class shapes — it's the boundary that wires concrete to abstract. Importing `AccountConfig` here would just add a redundant import; the constructor-parameters trick is an honest expression of "whatever shape `TransactionBuilder` wants". |

3 adopted / 3 rejected / 0 deferred. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 6 findings (3 adopted, 3 rejected). No deferred items.
- [ ] Draft PR with template sections 1–6 filled. **Next action.**
