# Story D (#93) — `accounting categorize --file <csv>`: warm `accounting.yaml` autotag rules before ingest

## Context

[Issue #93](https://github.com/xavierbriand/accounting/issues/93) reports that rules defined mid-`ingest` only take effect on the *next* invocation: `TransactionBuilder.rules` is frozen at construction (`src/cli/program.ts:145`), and the interactive loop's `rememberedRules` are written to YAML only **after** the loop completes (`src/cli/commands/ingest-command.ts:148`). In a single run with many new categories — exactly the "first-time onboarding a year of statements" path — the user is re-prompted for every recurrence of an already-defined merchant.

The user picked **Option A from the issue — a dedicated greenfield command** (Option B, mid-run rule re-apply, will be filed as a separate issue and is **out of scope** for this story).

Story D adds `accounting categorize --file <csv>`: parses a CSV without touching the DB, finds descriptions whose categories aren't yet known to `autoTagRules`, walks the user through defining categories + regex for the most-frequent ones, and writes the warmed YAML in a single atomic append. The user then re-runs `ingest --file <csv>` against a config where most recurring merchants already have rules — so the existing per-run mechanic is sufficient.

**Epic / FR alignment.** Epic 2 / Story 2.4. **FR6** (auto-tagging) is materially extended — the user can now pre-seed rules from history without a full ingest cycle. **FR5** (interactive tagging during ingest) is unchanged. **FR17** (snapshot safety) is not engaged: the `categorize` command performs no DB writes. The single side-effect is the YAML write, reusing Story C's atomic-rename + mtime-race writer.

### Decisions taken before planning

- **Ranking strategy v1 = frequency** (distinct description string, sorted by occurrence count desc). Token-similarity grouping is an explicit v2 follow-up; the scanner exposes a `RankingStrategy` interface as the swap-point. (User explicitly deferred the ranking choice to plan-review — frequency is the recommendation; reviewer may overturn.)
- **`--limit` default = unbounded**; **`--min-count` default = 2** so one-off merchants don't generate prompts.
- **`--non-interactive` semantics** mirror `ingest`: if any group would require a prompt, exit non-zero (code `2`) without writing YAML.
- **Single YAML write at end-of-loop**, never per-rule. Same atomic-rename + mtime-race protection as `ingest`.
- **Skip-all** ⇒ exit `0` with summary "no rules added"; YAML untouched (no write call).

## Production-code surface (R2)

### New CLI subcommand wiring (`src/cli/program.ts`)

```ts
program
  .command('categorize')
  .description('Scan a CSV for unmatched descriptions and warm accounting.yaml autotag rules (no DB writes)')
  .requiredOption('-f, --file <path>', 'Path to the bank CSV file')
  .option('--non-interactive', 'Fail if any group would require a prompt (CI mode)', false)
  .option('--json', 'Output JSON summary instead of human-readable text', false)
  .option('--limit <n>',     'Stop after reviewing N groups (default: unbounded)', (v) => Number.parseInt(v, 10))
  .option('--min-count <n>', 'Skip groups with fewer than N occurrences (default: 2)', (v) => Number.parseInt(v, 10), 2)
  .option('--scripted-prompts <json>', '(test only) JSON array of canned prompt answers; gated by NODE_ENV=test')
  .action(async (options: CategorizeOptions) => { /* see runCategorizeCommand below */ });
```

The `categorize` command does **not** take `--db-path-override`; it never touches the DB. Config loading still goes through `resolveDbPathForCommand` (we need `config` and `configMtimeNs`); the resolved DB path is ignored.

### New CLI orchestrator (`src/cli/commands/categorize-command.ts` — new)

```ts
export interface CategorizeCommandOptions {
  readonly file: string;
  readonly nonInteractive: boolean;
  readonly json: boolean;
  readonly limit?: number;
  readonly minCount: number;
}

export interface CategorizeCommandDeps {
  readonly config: AppConfig;
  readonly csvParser: Pick<CsvParser, 'parse'>;
  readonly pickSourceAccount: typeof PickSourceAccountFn;
  readonly readFile: typeof ReadBpceCsvFn;
  readonly prompt: InteractivePrompter;
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly exitCode: (code: number) => void;
  readonly configWriter: ConfigWriter;
}

export async function runCategorizeCommand(
  opts: CategorizeCommandOptions,
  deps: CategorizeCommandDeps,
): Promise<void>;
```

Mirrors `runIngestCommand` deliberately (same `Writable`/`exitCode`/`prompt` shape) so test plumbing is shared.

### New Core scanner (`src/core/ingest/categorize-scanner.ts` — new)

```ts
export interface UnmatchedGroup {
  readonly description: string;     // canonical (verbatim of first occurrence; case preserved)
  readonly count: number;            // number of rows with this exact description
}

export function scanForUnmatched(
  descriptions: readonly string[],
  existingRules: readonly AutoTagRule[],
  opts: { readonly minCount: number },
): readonly UnmatchedGroup[];
```

Pure: no I/O, no Node APIs, no `process.exit`. Steps:
1. For each `description`, classify it with the **same predicate `TransactionBuilder` uses** — i.e. drop if either:
   - any `existingRules[i].pattern.test(description)` is true (the autotag-rule path), **or**
   - the description matches the card-settlement pattern (`PAIEMENT CARTE X?(\d{4})…`) handled by `TransactionBuilder.tryCardSettlement`. To keep the predicate canonical, **extract the card-settlement RegExp into a shared `src/core/ingest/auto-classify.ts` constant** that both `TransactionBuilder` and the scanner import. This closes the round-trip gap flagged by the plan-reviewer (P1-E): without it, card-settlement rows would appear in `categorize` prompts but be auto-tagged as `'high'` confidence by `ingest`, breaking the determinism note.
2. Group survivors by exact string equality, count occurrences.
3. Filter `count >= opts.minCount`.
4. Sort by occurrence count desc (frequency ranking — internal to the scanner; no `RankingStrategy` interface in v1 per YAGNI).

**v2 follow-up note.** Token-similarity grouping is the headline post-v1 enhancement. When v2 lands, refactor by introducing a `RankingStrategy` interface at that point (two concrete implementations = abstraction earned). v1 ships a plain function — no premature interface.

### New JSON output shape (machine contract)

`--json` prints a single-line JSON object on stdout:

```json
{
  "file": "<path>",
  "summary": {
    "scannedRows": 153,
    "alreadyMatched": 87,
    "candidateGroups": 12,
    "promptedGroups": 12,
    "rulesAdded": 9,
    "rulesSkippedByUser": 3,
    "rulesSkippedAsDuplicate": 0
  },
  "rules": [
    { "category": "AutoInsurance", "pattern": "altima" },
    { "category": "Transport", "pattern": "uber|bolt" }
  ]
}
```

`rulesSkippedAsDuplicate` reports `0` in v1 (see § Risks: Story C's `appendAutoTagRules` doesn't currently return a skipped-dup count; widening that port is a maint follow-up).

### Port extension — `InteractivePrompter`

**No new method needed for v1.** Existing `selectCategory` (with the "+ Define new category…" branch) handles the category step; existing `confirmRememberRule` handles the regex-input prompt with live `compiled.test(description)` validation. The orchestrator composes them:

```text
For each group g:
  result = prompt.selectCategory(g.description, currentCategory='Uncategorized', categoriesSoFar)
  if action === 'abort': flush partial buffer, stop, exit summary
  if action === 'keep':  treat as "skip this group" and continue
  if action === 'change':
      remember = prompt.confirmRememberRule(g.description, suggestPattern(g.description), result.category)
      if remember.action === 'remember': buffer { category, pattern }
```

Reusing `selectCategory` gives the user the same "Keep / Change to / Define new / Abort" UX they know from `ingest`. `Keep: Uncategorized` naturally maps to "skip this group".

`ScriptedPrompter` already supports both methods; no plumbing changes beyond adding `confirmRememberRule` script entries to the new fixtures.

### Stable exit codes

Verbatim mirror of `ingest-command.ts:55–80`:

- `0` — completed (rules added, none needed, or user aborted mid-loop after confirming ≥0 rules)
- `1` — config load failure / `readFile` failure / `csvParser.parse` failure
- `2` — `pickSourceAccount` mismatch (no account configured for this filename) **or** `--non-interactive` bail when at least one candidate group exists
- `5` — YAML write failed (mtime-race / conflict / I/O — mirrors ingest's Story-C handling)

No new exit code introduced. **Abort exits `0`** — confirmed-before-abort rules are flushed to YAML and the user is informed via stderr ("Aborted; N rules already confirmed were saved to accounting.yaml").

## Behaviour

1. **Resolve config** via `resolveDbPathForCommand`: reuse for `config` and `configService.getResolvedConfigPath()`. The resolved DB path is **ignored**. Exit `1` on failure.
2. **Stat YAML** for `configMtimeNs`; construct `YamlConfigWriter`. (Same as ingest.)
3. **Parse CSV** via the existing infra pipeline (`pickSourceAccount`, `readBpceCsv`, `NodeCsvParser`). Parse-error rows reported on stderr; valid siblings proceed (existing two-stage policy). **All-malformed CSV** (every row a parse error, `parseOutcome.items` empty) flows through to step 4 with an empty descriptions array → `groups = []` → step 8 prints "0 rules added" and exits `0`. Same posture as ingest's empty-after-parse path.
4. **Scan**: extract `parseOutcome.items.map(i => i.description)`, call `scanForUnmatched(descriptions, config.autoTagRules, { minCount })`. **All-already-matched** (every description filtered out by an existing rule) flows through with `groups = []` → step 7 skipped → step 8 prints "0 rules added" → exit `0` → YAML untouched.
5. **Non-interactive bail**: if `opts.nonInteractive && groups.length > 0`, print `"<N> group(s) need review; re-run without --non-interactive"` to stderr, exit `2`. **No YAML write.**
6. **Apply `--limit`** (slice `[0, limit)`). Walk groups in rank order, calling `selectCategory` then `confirmRememberRule`. Buffer `{ category, pattern }` (dedup as `category|pattern`, mirroring `runInteractiveLoop`). **On abort** (user picks "Abort" in `selectCategory`): exit the loop, proceed to step 7 with the partial buffer (confirmed-before-abort rules are user input — not lost). Print to stderr "Aborted; N rules already confirmed were saved to accounting.yaml" before step 8.
7. **Single YAML write at end of loop** (only if buffer non-empty): `configWriter.appendAutoTagRules(buffer)`. Exit codes mirror Story C handling.
8. **Print summary** — human-readable on stdout: `"N rules added to accounting.yaml. Re-run \`accounting ingest --file <csv>\` to apply."` Or `--json` shape above. Exit `0`.

**Determinism note.** The scanner uses the **same predicate** `TransactionBuilder` uses to decide a row is `'high'` confidence — both the autotag-rule path (`rules.find(r => r.pattern.test(description))`) and the card-settlement path (`tryCardSettlement`'s regex). The shared `auto-classify.ts` constant ensures both consumers stay in lockstep. Round-trip property: running categorize-then-ingest re-prompts for nothing the user already remembered, **including card-settlement rows** (P1-E fix).

## Gherkin scenarios (R6)

```gherkin
Feature: Define autotag rules from a CSV before ingest (categorize command)

  Scenario: scripted run appends two rules for the two recurring merchants
    Given a fresh accounting.yaml with no autoTagRules entry
    And a BPCE CSV with three rows for "ALTIMA COURTAGE 9876" and four rows for "UBER FRANCE"
    When I run "accounting categorize -f <csv> --scripted-prompts <script>" with a script that
      defines AutoInsurance for the ALTIMA group and Transport for the UBER group, remembering
      "altima" and "uber" respectively
    Then the process exits with code 0
    And accounting.yaml on disk contains autoTagRules.AutoInsurance.patterns ["altima"]
    And accounting.yaml on disk contains autoTagRules.Transport.patterns ["uber"]
    And no .db file exists in the temp dir
    # fails if categorize touches SQLite, mis-orders the writer call, or duplicates Story C's
    # confirmRememberRule UX (guards composition root + Core/Infra boundary in program.ts).

  Scenario: descriptions already covered by an existing rule are silently skipped
    Given an accounting.yaml whose autoTagRules.Transport.patterns include "uber"
    And a BPCE CSV with three rows for "UBER FRANCE" and three rows for "ALTIMA COURTAGE"
    When I run categorize with a script that ONLY scripts a confirmRememberRule for the ALTIMA
      group (no entry for UBER)
    Then the process exits with code 0
    And the script is fully consumed without "ScriptedPrompter: expected next entry" errors
    # fails if the scanner re-prompts on already-matching descriptions
    # (guards the existing-rule filter in scanForUnmatched).

  Scenario: --non-interactive errors when groups need review and writes nothing
    Given a fresh accounting.yaml with no autoTagRules entry
    And a CSV with two distinct recurring merchants (count >= minCount)
    When I run "accounting categorize -f <csv> --non-interactive"
    Then the process exits with code 2
    And stderr contains "2 group(s) need review"
    And accounting.yaml on disk is byte-identical to the input
    # fails if --non-interactive silently writes or exits 0 (guards CI mode invariant).

  Scenario: --json summary shape with multiple rules and a user-skipped group (R8 mock diversity)
    Given a CSV with three distinct recurring merchants
    When I run categorize with --json and a script that remembers two rules and skips the third group
    Then stdout is a single line of valid JSON
    And the JSON has summary.candidateGroups == 3, summary.rulesAdded == 2, summary.rulesSkippedByUser == 1
    And the JSON's rules array length is 2 with each entry exposing { category, pattern }
    # fails if the JSON shape regresses or collapses pluralisation (guards machine contract +
    # R8 mock-diversity invariant — non-default fixture exercises rulesSkippedByUser > 0
    # and a multi-rule rules array).

  Scenario: all descriptions already covered — no YAML write, exit 0 (P1-C edge case)
    Given an accounting.yaml whose autoTagRules cover every description in the CSV
    And a CSV with two recurring merchants both already matched
    When I run categorize without --scripted-prompts
    Then the process exits with code 0
    And stderr contains "0 rules added"
    And accounting.yaml on disk is byte-identical to the input
    And the prompter is never invoked
    # fails if categorize writes YAML when the buffer is empty, or prompts the user when
    # there is nothing to teach (guards the all-matched short-circuit in steps 4 + 7).

  Scenario: --min-count default of 2 hides one-off merchants
    Given a CSV with one row for "ONE-OFF SHOP" and three rows for "RECURRING MERCHANT"
    When I run categorize (default --min-count=2)
    Then the prompter is asked exactly once (only the recurring merchant)
    # fails if the one-off appears in the prompt sequence (guards default ranking + min-count).

  Scenario (property test, fast-check): scanner output is a permutation/subset of the input
    Given any input descriptions[] and any existingRules[]
    When scanForUnmatched is called
    Then every group.description in the output appears in the input
    And output groups are pairwise distinct by description
    And every output description has count >= minCount
    And no output description is matched by any existingRules[i].pattern
    # fails if the scanner fabricates, dedups incorrectly, or leaks already-matched
    # strings (guards core invariants).
```

## Files to change

- **`src/core/ingest/auto-classify.ts`** *(new — extracted from `transaction-builder.ts`)* — exports the shared autotag + card-settlement predicate (`isAlreadyClassified(description, rules) → boolean`) and the card-settlement RegExp constant. Imported by both `TransactionBuilder` and `categorize-scanner`. Pure Core. Closes the P1-E round-trip gap.
- **`src/core/ingest/categorize-scanner.ts`** *(new)* — pure scanner per § Production-code surface. Exports `UnmatchedGroup`, `scanForUnmatched`. Property-tested.
- **`src/cli/commands/categorize-command.ts`** *(new)* — orchestrator per § Production-code surface. Mirrors `runIngestCommand`. No DB deps.
- **`src/cli/program.ts`** — register `categorize` subcommand. Reuse `resolveDbPathForCommand` (config + `configService.getResolvedConfigPath()`), `ScriptedPrompter` flag plumbing, `YamlConfigWriter` construction.
- **`tests/unit/core/ingest/categorize-scanner.test.ts`** *(new)* — golden cases (frequency ranking, min-count filter, existing-rule filter, dedup) + fast-check property test.
- **`tests/unit/cli/commands/categorize-command.test.ts`** *(new)* — orchestrator with `ScriptedPrompter` + in-memory `ConfigWriter` stub. Covers: skip-all (no writer call), abort mid-loop (writer called with partial buffer), --non-interactive bail, --json shape, --limit truncation.
- **`tests/features/categorize.feature`** + **`tests/features/steps/categorize.steps.ts`** *(both new)* — Gherkin scenarios 1–5. Mirror `tests/features/steps/ingest.steps.ts`; `spawnCli` per scenario with `--scripted-prompts`.
- **`tests/integration/cli/categorize-end-to-end-wiring.test.ts`** *(new — R4 subprocess smoke)* — boots dist build with `--scripted-prompts`, asserts YAML mutation + **no `.db` file created**.
- **`accounting.example.yaml`** — one-line note above `autoTagRules:`: written by both `categorize` (greenfield) and `ingest` (interactive).
- **`docs/plans/story-D.md`** — this plan, moved into `docs/plans/` alongside the code at start of phase 3 (R1).

## Reuse / what already exists

Story D is mostly **new orchestration over existing pieces**:

- **CSV parsing** — `NodeCsvParser`, `readBpceCsv`, `pickSourceAccount` from `src/infra/`. Same parse-error policy (skip + report).
- **Config load + resolved-path lookup** — `resolveDbPathForCommand` in program.ts and `FileConfigService.getResolvedConfigPath()` (Story C).
- **YAML write** — `YamlConfigWriter.appendAutoTagRules` verbatim. Idempotent dedup, conflict detection, mtime-race protection, atomic rename, sanitised IO errors all already implemented.
- **Pattern suggestion** — `suggestPattern` from `src/core/ingest/pattern-suggester.ts` (Story C).
- **Prompter** — `selectCategory` + `confirmRememberRule` in `src/cli/utils/interactive.ts` verbatim. No port extension.
- **Scripted prompter** — `ScriptedPrompter` + the `--scripted-prompts` flag pattern from `program.ts` lines ~117–134.
- **`AutoTagRule`** shape — `{ pattern: RegExp; category: string }`.

**R3 audit conclusion:** no new framework or library imports. `commander`, `@inquirer/prompts`, `yaml`, `fast-check` are already deps. The Story 3.1 / Story C audits remain valid.

## Scope guardrails

- **No DB access.** The `categorize` command must not import `getDb`, `assertMigrated`, `validateDbPath`, or any `src/infra/db/*` symbol. Enforced by ESLint layer rules + the R4 subprocess test asserting no `.db` file appears.
- **No CSV mutation.** Read-only on the input CSV.
- **No new YAML schema** — Story B/C grouped-by-category shape is reused verbatim.
- **No editing or deletion of existing rules.** Append-only (Story C's writer enforces this).
- **No glob / multi-file input in v1** — single `--file <csv>`. Multi-file is logged as an open follow-up.
- **`program.ts` is touched → R4 applies.** Subprocess test at `tests/integration/cli/categorize-end-to-end-wiring.test.ts`.

## Slicing & commits (target 5–7, per **R14**)

Greenfield CLI surface — slices stay coarse because each behaviour stands alone and one-test-per-commit would inflate the count past R14 without adding signal.

1. `refactor(core/ingest): extract auto-classify predicate from transaction-builder` *(prep slice — pure refactor, behaviour-preserving; closes the P1-E gap before the scanner exists)*
2. `test(core/ingest): categorize-scanner — failing` *(golden cases + fast-check property test using `auto-classify`)*
3. `feat(core/ingest): scanForUnmatched (frequency-sorted output) — minimal green`
4. `test(features+integration): categorize end-to-end (scenarios 1, 2, 5, 6 + R4 subprocess) — failing`
5. `feat(cli): runCategorizeCommand + program.ts subcommand wiring — minimal green`
6. `test(cli): --non-interactive bail + --json multi-rule shape — failing` *(scenarios 3, 4)*
7. `feat(cli): --non-interactive bail + --json summary — minimal green`
8. `chore(docs): add accounting.example.yaml note + retro check`

**Slice count: 8.** Slightly above R14's 5–7 target, but the P1-E refactor slice (1) is preparatory and behaviour-preserving, and slices 6+7 are the test-then-feat split mandated by P3-J (no `test+feat` combined commits). The `refactor:` slice mandated by R11 lands either inside slice 1 (preparatory — already a refactor) **or** as an empty trailing commit if Phase-4 surfaces additional work; whichever resolves R11 here is documented at retro time.

**Justification for going one slice over R14:** the P1-E predicate-extraction is unavoidable for the round-trip property and would bloat slice 5 if folded in. Per CLAUDE.md § 6.6 ("split if >1 Sonnet round"), this story is still one Sonnet hand-off — one extra commit is preferable to a story split.

## Verification

- `npm run lint && npm run build && npm test` green locally and in CI.
- 100% branch coverage on `categorize-scanner.ts` (pure Core).
- Property test (`fast-check`) asserts the scanner's permutation/subset + min-count + existing-rule-filter invariants.
- **Subprocess smoke (R4):** `categorize-end-to-end-wiring.test.ts` runs the dist build, asserts YAML mutation + DB file absence.
- **Manual:** scaffold a fresh `accounting.yaml` with no `autoTagRules`. Run `accounting categorize -f sample.csv` against a BPCE statement; walk through the prompts; inspect YAML — comments preserved, new rules appended cleanly. Re-run `accounting ingest -f sample.csv` and confirm previously-prompted merchants are auto-tagged with no prompts.
- **Manual race:** during the categorize prompt loop, `touch accounting.yaml` from another shell, finish the prompts → expect exit 5 with the "config changed externally" message.

## Risks / open questions

- **Regex equality semantics.** The scanner filters using `existingRules[i].pattern.test(description)`. Two compiled `RegExp` objects with the same source aren't `===` equal, but `.test()` is what matters. Story C's YAML writer dedup uses pattern-source string-equality — the two filters compose cleanly. Flagged for awareness.
- **Partial-buffer flush on `abort`.** When the user picks `Abort` mid-loop, the orchestrator flushes the partial buffer to YAML rather than discarding it — confirmed rules are intentional input. Alternative: discard. **Recommendation: flush on abort, document in stderr** ("Aborted; N rules already confirmed were saved to accounting.yaml"). Phase-2 review may revisit.
- **Frequency ranking is naive.** `"ALTIMA COURTAGE 9876"` and `"ALTIMA COURTAGE 5432"` are distinct strings under exact-equality grouping; the user sees two prompts for the same merchant in a single run. The user's first-prompt regex (`altima`) makes the second occurrence auto-skip on the *next* run, but not in the same one. Mitigation: pick `Keep: Uncategorized` (skip group) on the second prompt. Token-grouping ranker is the v2 follow-up — when it lands, introduce a `RankingStrategy` interface at that point (per YAGNI: two concrete impls = abstraction earned).
- **`appendAutoTagRules` doesn't return a skipped-dup count** ([#104](https://github.com/xavierbriand/accounting/issues/104)). v1 reports `summary.rulesSkippedAsDuplicate: 0`; widening the writer's success type to `Result<{ added; skippedAsDuplicate }, …>` is filed as a maint follow-up.
- **Multi-file / glob support** ([#105](https://github.com/xavierbriand/accounting/issues/105)). Out of scope for v1. Filed as follow-up: "`categorize` supports `--file <pattern>` or repeated `--file` flags to scan a year of statements at once."
- **Token-similarity grouping (v2 ranker)** ([#106](https://github.com/xavierbriand/accounting/issues/106)). Headline follow-up — similarity threshold, leading-token canonicalisation, prompt UX showing the cluster.
- **Option B (re-apply mid-run) follow-up** ([#103](https://github.com/xavierbriand/accounting/issues/103)). Filed at story kickoff so the literal bug from #93 is still tracked.
- **Shared base type for `IngestCommandDeps` / `CategorizeCommandDeps`** ([#107](https://github.com/xavierbriand/accounting/issues/107)). Two callers now share `config`, `csvParser`, `pickSourceAccount`, `readFile`, `prompt`, `stdout`, `stderr`, `exitCode`, `configWriter`. Filed as a maint refactor — not adopted in this story to keep the diff small (P3-E).

## Suggestion log (Phase 2 critical review — P1/P2/P3)

*To be populated by `plan-reviewer`. DoR check on review completion.*
