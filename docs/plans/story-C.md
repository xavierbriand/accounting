# Story C (#75) — 'remember this rule' prompt + YAML write-back

## Context

The trio closer. Story A (#73) added inline category creation; Story B (#74) made YAML the only source of `autoTagRules`. Story C delivers the "one-time pain per merchant" promise: after the user picks/creates a category for a low-confidence row, the prompt offers to remember the choice as a rule. On confirm, the rule is appended to `accounting.yaml` (atomic write, comments preserved) so subsequent ingests auto-tag the same merchant without prompting.

**Epic / FR alignment.** Epic 2 / Story 2.4 (Interactive Ingest Command). Three FRs touched: **FR5** ("User can interactively Tag transactions") is materially extended — a new post-tagging step is added to the interactive loop; **FR6** ("System can automatically tag transactions based on exact merchant name matches from previous history") is now fulfilled in its full form (previous history accumulates *across* ingests, written by the user inline rather than hand-edited); **FR17** ("Snapshot Backup before any write operation") is reordered relative to the new YAML write — the YAML write happens BEFORE the DB snapshot per Q1-b, creating an asymmetry documented in § Risks.

### Maintenance sub-loop (§ 6.7) run 2026-04-28 pre-planning

- **Working tree:** clean; new branch `claude/story-C` created from `origin/main` at `bc8860a` (post-Story-B merge).
- **Open issues:** #73 + #74 closed (linked their merge commits). #75 (this) is the work item. #80 (process improvement proposal) is pending — not blocking. Seven `deferred-suggestion` items unchanged.
- **Open PRs:** Dependabot [#81 typescript-eslint 8.59.0 → 8.59.1](https://github.com/xavierbriand/accounting/pull/81). Patch-level dev-dep; routine merge per § 6.7. Flagged for the user; does not block Story C.
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Decision:** proceed.

### User decisions taken before planning (interactively)

Per `feedback_planning_clarifying_questions.md`, surfaced before writing this plan:

- **Q1 — Atomicity ordering:** YAML-write-once *before* DB-commit (option b). Remembered rules buffer in memory during the interactive loop; flush as a single atomic YAML write after `confirmBatch` returns true and before `saveBatch`. If YAML write fails (mtime race, conflict, I/O), **the entire ingest aborts** — transactions are NOT committed; the snapshot machinery is not even engaged. Reconciliation with Q4: option (a)'s framing of "transactions still commit to DB" was inconsistent with Q1-b; the chosen behaviour is "YAML failure aborts everything; clear stderr; user retries."
- **Q2 — Pattern suggestion heuristic:** start with the **single longest alphabetic token ≥4 chars** that isn't a noise token (option a). Pre-merge follow-up filed for a future story: a separate command that analyses the *whole* transaction set to suggest patterns retroactively (cross-batch heuristics).
- **Q3 — Edit-regex validation:** **non-empty + compiles + actually matches the current description** (option b). The third check ("must match what we're about to tag with it") catches typos like the user editing `altima` to `altimar` and surfaces it before write.
- **Q4 — mtime race recovery:** **fail loudly** (option a) — abort the YAML write, print a clear "your config changed externally; please re-run ingest" message to stderr, abort the entire ingest (per Q1-b reconciliation above). No automatic re-merge.
- **Q5 — Conflict / dedup behaviour:** triple disposition.
  - (a) Same `(category, pattern)` already in YAML → **silent no-op**.
  - (b) Same pattern in a **different** category group (e.g., `altima` already under `Insurance`, user wants `AutoInsurance`) → **fail loudly** with `'pattern <p> already exists under category <existing-cat>; remove or rename before adding under <new-cat>'`. Don't write anything.
  - (c) In-batch duplicate (user confirms `(cat, pat)` twice in one ingest run) → **collapse to one append** in the in-memory buffer.

Plus three decisions taken silently with no objection:
- **Per-batch read-once-then-write-once** (single `mtime` captured at session start, single atomic rename at end). Not per-rule.
- **Append position** within an existing category's `patterns:` list = **end** (after the last existing pattern, after any trailing comments). New top-level category groups appended after the last existing group (= after `recurring:` if no `autoTagRules:` exists yet).
- **Future-command callout (Q2 follow-up)** logged as an open action item in the retrospective; not in this PR.

## Production-code surface (R2)

- **New `InteractivePrompter` method** in `src/cli/utils/interactive.ts`:
  ```ts
  confirmRememberRule(
    description: string,
    suggestedPattern: string,
    category: string,
  ): Promise<RememberRuleResult>;

  type RememberRuleResult =
    | { action: 'skip' }
    | { action: 'remember'; pattern: string };
  ```
  Returns `{ action: 'skip' }` for `[n]`; `{ action: 'remember', pattern: <suggested-or-edited> }` for `[y]` / `[e]`. ESC at the optional edit `input()` re-shows the y/e/n select (same pattern as Story A's ExitPromptError carve-out).

- **New Core port** `src/core/ports/config-writer.ts`:
  ```ts
  export type ConfigWriterError =
    | { kind: 'mtime-race' }
    | { kind: 'conflict'; existingCategory: string; pattern: string }
    | { kind: 'io'; message: string };  // message is sanitised — no absolute paths

  export interface ConfigWriter {
    appendAutoTagRules(
      rules: ReadonlyArray<{ category: string; pattern: string }>,
    ): Promise<Result<void, ConfigWriterError>>;
  }
  ```
  **`io.message` sanitisation contract:** when `YamlConfigWriter` catches a Node `Error` (typically from `fs.renameSync` or `fs.writeFileSync`), the message is rewritten via a small `sanitizeFsError(err): string` helper that strips absolute paths (replaces them with `<config>` token) before constructing the variant. Mirrors the `sanitizeSqlError` pattern at [src/cli/commands/ingest-command.ts:163](../../src/cli/commands/ingest-command.ts) (introduced for SQL errors in story-2.5).

- **New Infra impl** `src/infra/config/yaml-config-writer.ts` — wraps `yaml.parseDocument` (first use of the doc API in the repo) + `fs.renameSync` atomic write (mirroring the pattern from `src/infra/db/node-sqlite-snapshot-service.ts`). Constructor takes `(yamlPath: string, expectedMtimeNs: bigint)` captured by the caller at config-load time.

- **New Core helper** `src/core/ingest/pattern-suggester.ts`:
  ```ts
  export function suggestPattern(description: string): string | null;
  ```
  Pure. Returns the longest alphabetic token ≥4 chars that isn't a noise token; `null` if no eligible token. Property-tested with `fast-check`.

- **`runInteractiveLoop` extension** in `src/cli/commands/ingest-command.ts`:
  - After each successful `change` action, call `suggestPattern(description)`. If `null` → skip the remember prompt. Else → call `confirmRememberRule`. Buffer `{ category, pattern }` into a session-local `rememberedRules: Array<...>` (collapse duplicates per Q5-c).
  - After the loop returns and `confirmBatch` returns true, but **before** the `snapshotService.create` + `saveBatch` flow, invoke `configWriter.appendAutoTagRules(rememberedRules)`. On `Result.fail`, write a human-readable stderr message (mtime / conflict / io) and `exitCode(5)`; transactions NOT committed.

- **`src/cli/program.ts` wiring** — at config-load time (line ~37 of program.ts), after `configService.load()` succeeds, obtain the resolved config path via the concrete `FileConfigService.getResolvedConfigPath(): string` getter (added this story — see next bullet). Capture `fs.statSync(configPath).mtimeNs` and construct `new YamlConfigWriter(configPath, mtimeNs)`. Pass into `IngestCommandDeps.configWriter`.

- **`src/infra/config/config-service.ts` — `FileConfigService.getResolvedConfigPath(): string`** *(new public method on the concrete class, NOT on the `ConfigService` port)*. Returns the path that `load()` actually read (project-dir variant or XDG fallback). Internally, `load()` is updated to set a private `#resolvedPath: string | undefined` field as it picks projectPath/xdgPath; `getResolvedConfigPath` throws if called before a successful `load()`. Keeps the port narrow; only `program.ts` (which constructs the concrete class directly) consumes the new method.

- **`IngestCommandDeps` extension** in `src/cli/commands/ingest-command.ts`:
  ```ts
  readonly configWriter: ConfigWriter;
  ```
  New required field. All call sites that build `IngestCommandDeps` (`program.ts`, every test that constructs deps) updated. For unit tests that don't exercise the writer, a no-op stub `{ appendAutoTagRules: async () => Result.ok() }` is acceptable.

- **Public CLI surface — exit code 5** is new. Documented here as a stable scriptable contract: `5 = YAML write failed (mtime race / conflict / I/O)`. No flags, no JSON-shape change. Existing exit codes (0, 1, 2, 3, 4) unchanged.

## Behaviour

### Pattern suggester

Tokenise on `/[\W_]+/`. Filter to tokens matching `/^[a-z]+$/` (alphabetic only, post-lowercase) with `length ≥ 4`. Drop noise tokens (case-insensitive whole-string match against the noise list). Return the longest survivor; tie-break by first occurrence in the description. Return `null` if no token survives.

**Noise list** (French banking + generic legal-form noise — extracted from real BPCE description shapes; tunable based on retro feedback):
```
sarl, sas, sasu, sa, eurl, scop, scea, sci, gie, asbl, snc, scs,
cb, vir, prlv, carte, dab, retrait, paiement, facture, achat,
date, ref, num, montant, libelle, operation, type, code,
france, paris
```

**Locale-determinism:** all comparisons use ASCII `String.prototype.toLowerCase()`. Inherits from Stories A/B.

### `confirmRememberRule` prompt UX

**When `suggestPattern` returns a non-null suggestion (typical case):**
```
Always tag descriptions matching /<pattern>/i as <Category>?
  [y] yes, append to accounting.yaml
  [e] edit the regex first
  [n] no, just use it for this transaction
```

**When `suggestPattern` returns null (description is all-noise / numeric / sub-4-char):**
```
No pattern suggestion for this description. Remember as a rule?
  [e] enter a pattern manually
  [n] no, just use it for this transaction
```

Two-option select; the `[e]` branch is the same `input()` validator. This closes the UX gap surfaced in Phase-2 review (#17): users can still link a remembered rule to descriptions where the heuristic doesn't have a confident token.

`[e]` opens an `input()` whose `validate` callback runs four checks in order: (1) trim/non-empty, (2) **length ≤ 200** (ReDoS guard against pathologically long backtracking patterns; user-typed bound), (3) `new RegExp(p, 'i')` compiles, and (4) `compiledRegex.test(description)` returns true. Reject with a specific message per failure. ESC inside the `input()` throws `ExitPromptError`; caught locally and re-shows the y/e/n (or e/n) select (same `while (true)` pattern as Story A's `selectCategory`).

### YAML write semantics (`YamlConfigWriter.appendAutoTagRules`)

1. **Stat the file.** If `fs.statSync(yamlPath).mtimeNs !== expectedMtimeNs` → `Result.fail({ kind: 'mtime-race' })`.
2. **`yaml.parseDocument`** the file content. The `Document` API preserves comments and key order on round-trip (proven via integration test, see § Verification).
3. **Build a per-rule plan** before mutating:
   - For each `(category, pattern)`:
     - Check existence under each existing category group.
     - If found in **the same** category: skip (Q5-a — silent no-op).
     - If found in a **different** category: `Result.fail({ kind: 'conflict', existingCategory, pattern })` — abort, **no partial write**.
     - Else → mark for append.
   - Q5-c (in-batch dup) is handled upstream in the `runInteractiveLoop` buffer; the writer assumes the input list is already deduplicated.
4. **Mutate the `Document`:**
   - For each "mark for append" rule whose category group exists: append `pattern` to the end of the `patterns:` `YAMLSeq` for that group.
   - For each whose category group is absent: append a new map `{ category, patterns: [pattern] }` to the end of the `autoTagRules:` `YAMLSeq` (creating the top-level `autoTagRules:` key after `recurring:` if absent).
5. **Serialize** via `doc.toString()`.
6. **Atomic write:** write to `<yamlPath>.tmp.<pid>.<8 hex bytes>`, set `0o600` (mirror snapshot service), `fs.renameSync` to the final path.

### Atomicity sequence (per Q1-b)

1. Stage outcomes (`runInteractiveLoop`): for each `change`, ask remember; collect in `rememberedRules` buffer.
2. Show summary table.
3. `confirmBatch` (existing).
4. **NEW:** `configWriter.appendAutoTagRules(rememberedRules)` — single atomic YAML write. On failure → stderr + `exitCode(5)`; ABORT (no DB write, no snapshot).
5. `snapshotService.create` (existing).
6. `transactionRepository.saveBatch(outcomes)` (existing).
7. `snapshotService.remove` (existing).

Failure modes after step 4 succeeds (steps 5-7) are existing behaviour; the YAML rules persist in that case (rules are idempotent; harmless if the user retries).

## Gherkin scenarios (R6)

```gherkin
Feature: Remember-this-rule prompt + YAML write-back

  Scenario: pattern-suggester returns the longest alphabetic token ≥4 chars
    Given the description "ALTIMA COURTAGE 9876"
    When suggestPattern is invoked
    Then it returns "courtage"  # altima=6 chars, courtage=8 chars; longest wins
    And fails if the longest-token rule is not respected (guards core/ingest/pattern-suggester.ts).

  Scenario: pattern-suggester drops noise tokens
    Given the description "VIR SARL CARREFOUR"
    When suggestPattern is invoked
    Then it returns "carrefour"  # vir<4 (filtered by length); sarl in NOISE_TOKENS; carrefour=9 chars
    And fails if noise tokens leak past the filter (guards the NOISE_TOKENS list).

  Scenario: pattern-suggester returns null when no token qualifies
    Given the description "CB 12345 23/04"
    When suggestPattern is invoked
    Then it returns null
    And fails if a noise-only or numeric-only description yields a non-null suggestion (guards the null-fallback path).

  Scenario: confirmRememberRule offers y/e/n with the suggested pattern
    Given a 'change' action with description "ALTIMA COURTAGE", category "AutoInsurance"
    When confirmRememberRule is invoked with suggestedPattern "courtage"
    Then the select menu shows three labelled choices
    And [y] returns { action: 'remember', pattern: 'courtage' }
    And fails if the suggested pattern is not the default in the prompt's [y] branch.

  Scenario: confirmRememberRule shows e/n (no [y]) when suggestedPattern is null
    Given a 'change' action with description "CB 12345" (suggestPattern returns null)
    When confirmRememberRule is invoked with suggestedPattern = null
    Then the select menu shows two labelled choices ([e] enter pattern manually, [n] skip)
    And [e] opens the same compile-and-match validator
    And [n] returns { action: 'skip' }
    And fails if the prompt is silently skipped, denying the user the chance to remember a rule for an all-noise description (guards the null-suggester UX gap).

  Scenario: confirmRememberRule edit branch validates compile-and-match
    Given the user picks [e] for description "ALTIMA COURTAGE", suggested "courtage"
    When the user submits "altimar" (typo — does not match)
    Then the validate callback rejects with "pattern does not match the current description"
    When the user resubmits "altima"
    Then the prompt accepts and returns { action: 'remember', pattern: 'altima' }
    And fails if a non-matching edit is accepted (guards Q3-b's third check).

  Scenario: confirmRememberRule [n] returns skip
    When the user picks [n]
    Then result is { action: 'skip' }
    And fails if [n] silently records a rule (guards the negative path).

  Scenario: ESC at the edit input re-shows the y/e/n menu
    Given the user picks [e] then presses ESC
    Then ExitPromptError is caught and the y/e/n select re-displays
    And fails if ESC bubbles out (guards the same cancel-is-local pattern as Story A's selectCategory).

  Scenario: YamlConfigWriter appends a pattern to an existing category group
    Given accounting.yaml has autoTagRules with one Transport group containing ["uber|bolt"]
    When appendAutoTagRules is invoked with [{ category: 'Transport', pattern: 'taxi' }]
    Then the file's Transport group contains ["uber|bolt", "taxi"] in that order
    And no other top-level section is reordered or rewritten
    And every # comment in the original file is preserved verbatim
    And fails if doc round-tripping loses comments (guards the parseDocument round-trip claim).

  Scenario: YamlConfigWriter creates a new category group when absent
    Given accounting.yaml has autoTagRules with only Transport
    When appendAutoTagRules is invoked with [{ category: 'AutoInsurance', pattern: 'altima' }]
    Then a new group { category: AutoInsurance, patterns: ['altima'] } appears after Transport
    And fails if the new group is inserted elsewhere in the document (guards append-position invariant).

  Scenario: YamlConfigWriter detects mtime race and aborts
    Given a YamlConfigWriter constructed with mtime T0
    And the file's mtime on disk is now T1 (≠ T0)
    When appendAutoTagRules is invoked
    Then it returns Result.fail({ kind: 'mtime-race' })
    And the file content on disk is unchanged
    And fails if the writer mutates the file under a race condition (guards Q4-a).

  Scenario: YamlConfigWriter rejects pattern-different-category conflict
    Given accounting.yaml has autoTagRules with Insurance: ["altima"]
    When appendAutoTagRules is invoked with [{ category: 'AutoInsurance', pattern: 'altima' }]
    Then it returns Result.fail({ kind: 'conflict', existingCategory: 'Insurance', pattern: 'altima' })
    And the file content on disk is unchanged
    And fails if the writer silently moves the pattern or appends to the new category (guards Q5-b).

  Scenario: YamlConfigWriter is silent no-op on duplicate (category, pattern)
    Given accounting.yaml has autoTagRules with Transport: ["uber"]
    When appendAutoTagRules is invoked with [{ category: 'Transport', pattern: 'uber' }]
    Then it returns Result.ok and the file content on disk is unchanged (byte-equal)
    And fails if the writer appends a duplicate (guards Q5-a).

  Scenario: YamlConfigWriter writes atomically (tmp + rename)
    Given a YamlConfigWriter
    When appendAutoTagRules is invoked successfully
    Then post-write the final file is byte-different from the original
    And no .tmp.<pid>.<rand> sibling file remains in the directory
    And the final file's permissions are 0o600 on POSIX
    And fails if the file is written in-place without rename or if a tmp sibling remains (guards atomicity invariant; mirrors snapshot-service pattern at src/infra/db/node-sqlite-snapshot-service.ts:10-40).

  Scenario: ingest CLI subprocess writes YAML before committing DB (R4)
    Given an accounting.yaml with autoTagRules: [Transport]
    And a CSV with one description "ALTIMA COURTAGE"
    When the dist build is invoked via spawnCli with a sequenced prompter that defines AutoInsurance and remembers "altima"
    Then accounting.yaml on disk now contains autoTagRules.AutoInsurance.patterns: ["altima"]
    And the DB contains the new transaction tagged Expense:AutoInsurance
    And fails if program.ts wires the writer incorrectly or if YAML-then-DB ordering is reversed (guards composition root).

  Scenario: ingest CLI subprocess aborts when YAML mtime drifts mid-session (R4)
    Given a YAML file at T0 and a sequenced prompter that confirms a remember
    When the file is touched (mtime → T1) before the writer flushes
    Then the CLI exits 5 with stderr "your accounting.yaml changed externally; please re-run ingest"
    And the DB is unchanged (no commit, no snapshot)
    And fails if a partial commit lands (guards Q1-b + Q4-a integration).

  Scenario: round-trip — define new + remember + re-ingest auto-tags (BDD end-to-end, carry-over from Story A retro)
    Given a fresh accounting.yaml with no autoTagRules entry for ALTIMA
    When the user runs ingest on a CSV containing "ALTIMA COURTAGE", defines AutoInsurance, and confirms remember "altima"
    And then runs ingest again on a CSV containing "ALTIMA SOLO"
    Then the second ingest auto-tags it as Expense:AutoInsurance with confidence 'high', no prompt
    And fails if the YAML round-trip via parseDocument doesn't survive a re-load (guards the full feature loop).
```

## Files to change

- **[src/core/ingest/pattern-suggester.ts](../../src/core/ingest/pattern-suggester.ts)** *(new)* — pure function `suggestPattern(description: string): string | null`. ASCII `toLowerCase()`. Module-level `NOISE_TOKENS: readonly string[]`. Exported as `NOISE_TOKENS` for the property test (mirrors Story B's `RESERVED_TOKENS` export pattern).

- **[src/core/ports/config-writer.ts](../../src/core/ports/config-writer.ts)** *(new)* — `ConfigWriter` interface + `ConfigWriterError` discriminated union. Pure types; no impl.

- **[src/infra/config/yaml-config-writer.ts](../../src/infra/config/yaml-config-writer.ts)** *(new)* — `YamlConfigWriter` class implementing `ConfigWriter`. Constructor: `(yamlPath: string, expectedMtimeNs: bigint)`. `appendAutoTagRules` per § Behaviour. Imports `parseDocument` from `'yaml'` (R3-relevant — see Reuse section).

- **[src/cli/utils/interactive.ts](../../src/cli/utils/interactive.ts)** — extend `InteractivePrompter` with `confirmRememberRule`. Add to `inquirerPrompter`. New `RememberRuleResult` type union exported.

- **[src/cli/commands/ingest-command.ts](../../src/cli/commands/ingest-command.ts)** —
  - Extend `IngestCommandDeps` with `configWriter: ConfigWriter`.
  - In `runInteractiveLoop`: after a successful `change`, call `suggestPattern`; if non-null, call `prompt.confirmRememberRule`; buffer the result. Return `{ resolved, rememberedRules }` (extend the return type).
  - In the post-loop flow (around line ~141 today): after `confirmBatch` returns true, call `configWriter.appendAutoTagRules(rememberedRules)`. On failure → stderr + `exitCode(5)`. On success → proceed to existing snapshot + saveBatch.

- **[src/cli/program.ts](../../src/cli/program.ts)** — at config-load (around line 37), after a successful load, capture `fs.statSync(configPath).mtimeNs` and construct `new YamlConfigWriter(configPath, mtimeNs)`. Pass into the ingest deps.

- **[tests/unit/core/ingest/pattern-suggester.test.ts](../../tests/unit/core/ingest/pattern-suggester.test.ts)** *(new)* — golden cases per Gherkin scenarios 1-3 + fast-check property test asserting **four invariants** when the result is non-null: (1) alphabetic only, (2) length ≥4, (3) present in the lowercased description, (4) not in `NOISE_TOKENS`, AND **(5) is the LONGEST eligible token in the description** (the determinism invariant that defines the function — flagged by Phase-2 review #26). Tie-break: first occurrence in description order; the property test enforces this with a deterministic generator that produces tied lengths.

- **[tests/integration/infra/config/yaml-config-writer.test.ts](../../tests/integration/infra/config/yaml-config-writer.test.ts)** *(new)* — uses `os.tmpdir()` + `fs.mkdtempSync` (existing pattern from `tests/integration/cli/ingest-end-to-end-wiring.test.ts`). Covers Gherkin 8-13: append to existing, create new, mtime race, conflict, dedup no-op, atomic write (verifies the `.tmp.<pid>.<rand>` file appears and is renamed by sampling `fs.readdirSync` at write time — or just asserts the final file is byte-different and the tmp is gone).

- **[tests/unit/cli/utils/interactive.test.ts](../../tests/unit/cli/utils/interactive.test.ts)** — extend with `confirmRememberRule` tests (Gherkin 4-7): offers menu, `[y]` returns suggested, `[e]` validates compile + match, `[n]` skip, ESC re-shows.

- **[tests/unit/cli/commands/ingest-command.test.ts](../../tests/unit/cli/commands/ingest-command.test.ts)** — extend with: (a) buffer-then-flush ordering (writer called before `saveBatch`), (b) writer failure aborts ingest with exit 5, no `saveBatch` called.

- **[tests/_helpers/spawn-cli.ts](../../tests/_helpers/spawn-cli.ts)** — extend `SpawnOpts` with optional `stdin?: string` and switch the `stdio` config from `['ignore', 'pipe', 'pipe']` to `['pipe', 'pipe', 'pipe']` when stdin is provided. Stays backwards-compatible (existing callers omit the field). This is required to drive the interactive prompts in subprocess; without it, the R4 test cannot exercise the new code paths. `@inquirer/prompts` reads from stdin via raw-mode TTY by default — we run subprocess with `INQUIRER_FORCE_TTY=0` env var (or equivalent) so it falls back to line-buffered stdin reads. *Phase-2 review #6 surfaced this gap; the plan now pins the mechanism rather than leaving it for Sonnet to design.*

- **[tests/integration/cli/ingest-remember-rule-wiring.test.ts](../../tests/integration/cli/ingest-remember-rule-wiring.test.ts)** *(new — R4 subprocess smoke)* — uses extended `spawnCli` with `stdin` option + `writeStubYaml` from `tests/_helpers/inline-config.ts`. Covers Gherkin 14-15. **Implementer fallback:** if the `INQUIRER_FORCE_TTY=0` approach proves unreliable (the package may require a TTY for raw-mode key handling), fall back to driving the subprocess via a `--scripted-prompts <json>` CLI flag added to `program.ts` *for tests only* (gated by `NODE_ENV === 'test'`), which feeds the prompter from a fixture JSON rather than stdin. Sonnet picks the path that lands clean and notes the choice in the return report.

- **[tests/features/ingest.feature](../../tests/features/ingest.feature)** + **[tests/features/steps/ingest.steps.ts](../../tests/features/steps/ingest.steps.ts)** — add the round-trip scenario (Gherkin 16): define-new + remember on first ingest, auto-tag on second. **This closes the Story A retro carry-over** ("end-to-end BDD scenario for define-new + auto-tag interaction"). The step parameterised by sequenced prompter — keep ≤ ~20 LOC per Story A retro. Judgment-call to land or split if step plumbing exceeds that.

- **[accounting.example.yaml](../../accounting.example.yaml)** — add a one-line comment above `autoTagRules:` noting that the section is also written by `npm run ingest` in interactive mode (forward reference for users browsing the example).

- **[docs/security-checklist.md](../security-checklist.md)** — add the user-typed-label carve-out from Story A retro Try-list. Three data points (Story A inline category, Story B YAML category, Story C YAML pattern) — codify now: "User-typed labels (category names, account aliases, auto-tag pattern strings) are not subject to the no-echo rule — they're the user's own classifiers, not third-party identifiers." This addresses the third carry-over from Story B retro.

## Reuse / what already exists

- **`yaml` package's `parseDocument` API** — the `yaml@^2.8.3` package (already a runtime dep, [package.json:36](../../package.json)) exposes `parseDocument`, `Document`, and `YAMLSeq`. Story C is the first use of the doc API in this repo. **R3 (tool-bundle import audit) — verify named exports exist.** Pre-flight check: `node -e "const y = require('yaml'); console.log(typeof y.parseDocument, typeof y.Document)"` should print `function function`. The implementer runs this in slice 1 before writing the import; landing the import without the verification step caused the Story A `@inquirer/core` deviation. **This Phase-1 sub-rule fulfils Story A retro Try #1.**
- **Atomic-write tmp+rename pattern** — `src/infra/db/node-sqlite-snapshot-service.ts:10-40`. `<path>.tmp.${pid}.${crypto.randomBytes(8).toString('hex')}`, then `fs.renameSync`. Mirror verbatim.
- **Story A's `ExitPromptError` cancel pattern** in `src/cli/utils/interactive.ts` (the `selectCategory` `while (true)` loop) — re-applied inside `confirmRememberRule`.
- **Story B's category-shape validator `validateNewCategoryName`** at `src/core/categories/category-name.ts` — NOT used here (this story validates regex strings, not category names; the category was already validated in Story B's flow).
- **Existing tmp-dir test pattern** — `os.tmpdir()` + `fs.mkdtempSync(prefix)` + `fs.rmSync(dir, { recursive: true, force: true })` in `afterEach`.
- **Story B's writeStubYaml** at `tests/_helpers/inline-config.ts:21` — existing `autoTagRules` override is exactly what the R4 subprocess test needs.

**R3 conclusion:** no new framework or library entered deps. The `yaml` package's `parseDocument` API is a new *call* but on an already-imported library. Verify the named exports per the new sub-rule above.

## Scope guardrails

- **No** UI for editing/deleting existing rules (out of scope per the issue).
- **No** bulk "remember all of these" mode (out of scope per the issue).
- **No** YAML schema changes — Story B's grouped-by-category shape is reused verbatim.
- **No** new CLI flag.
- `program.ts` is touched → **R4 applies.** Subprocess test at `tests/integration/cli/ingest-remember-rule-wiring.test.ts`.
- New custom Sub-Agent additions / spec changes are **not** in scope here. Story B retro Try-list items related to agent-spec tweaks defer to the next process-touching PR.

## Slicing & commits (target 9–11, per **R13**)

Story C is unusually wide (3 new files in Core + Infra; 1 new prompt method; 2 new integration tests; 1 new BDD scenario; security-checklist edit). The slice count sits at the upper end of R13. Justified by the cross-layer scope.

1. `test(core/ingest): pattern-suggester rules — failing`
2. `feat(core/ingest): suggestPattern + NOISE_TOKENS + property test — minimal green`
3. `test(infra/config): YamlConfigWriter happy path (append, new group, comment preservation) — failing`
4. `feat(infra/config): YamlConfigWriter appendAutoTagRules + atomic write — minimal green`
5. `test(infra/config): YamlConfigWriter mtime race + conflict + dedup no-op — failing`
6. `feat(infra/config): YamlConfigWriter rejection paths — minimal green`
7. `test(cli/interactive): confirmRememberRule prompt (offers + edit-validate + skip + ESC) — failing`
8. `feat(cli/interactive): confirmRememberRule + ingest-loop integration + program.ts wiring (YAML-before-DB) — minimal green`
9. `test(integration/cli): ingest-remember-rule-wiring subprocess (R4) — failing`
10. `feat(integration/cli): R4 subprocess smoke — green` *(or merged with slice 9 if green-on-landing per Story-B-retro pattern)*
11. `test(features/ingest): define-new + remember + re-ingest round-trip — landing rule per Story A retro carry-over`
12. `chore(docs): security-checklist user-label carve-out + accounting.example.yaml hint comment`
13. `refactor: <pending Phase-4 classification>` — **R-rule from Story A retro:** authored *after* Phase-4. Omitted if Phase-4 produces no work.

**Slice count target:** 11 in the green path (9-12 omitting splits). Slice 13 deferred per Story A retro Try-list.

**Beyond R13 ceiling?** R13 targets 6–10. Story C lands at 11+ slices in the green path because R4 + BDD round-trip + security-checklist doc are three additional concerns layered on the cross-layer feature. The plan documents this explicitly — Sonnet may compress slices 5+6 (rejection paths) if a single test commit can drive both rejection branches without confusion, dropping to 10 slices. Implementer flags the decision in the return report.

**R11 disposition:** slice 13 deferred until after Phase-4 per Story A retro Try-list. No empty pre-author.

## Verification

- `npm run lint && npm run build && npm test` green locally and in CI.
- 100% branch coverage on `pattern-suggester` (pure Core helper) and on `YamlConfigWriter` rejection paths.
- Property test (fast-check) for `suggestPattern`: shrinkable inputs, asserted invariants per § Files-to-change.
- **Subprocess smoke (R4):** `tests/integration/cli/ingest-remember-rule-wiring.test.ts` boots the dist build, runs ingest with a sequenced prompter, asserts the YAML on disk gained the new pattern and the DB gained the tagged transaction.
- **Round-trip BDD scenario:** define-new + remember on first ingest → auto-tag on second ingest. Closes Story A retro carry-over.
- **Manual:** ingest a CSV containing `ALTIMA COURTAGE`, define `AutoInsurance` inline, accept the suggested pattern. Inspect `accounting.yaml` post-ingest — comments preserved, `autoTagRules.AutoInsurance.patterns: ["courtage"]` (or whatever the suggester returns) appended cleanly. Re-run ingest on a CSV with another `ALTIMA …` row → confirm auto-tag with no prompt.
- **Manual race:** during the interactive prompt (between read and write), `touch accounting.yaml` from another shell → confirm batch → expect exit 5 + clear stderr message + DB unchanged.

## Risks / open questions

- **Pattern-suggester noise-list maintenance.** The initial noise list is derived from BPCE descriptions; it will need iteration as users encounter merchants whose names are close to noise tokens (e.g. a merchant literally named `Sasu Foo` would lose `sasu`). The retro reserves a section for "what surprises us about real bank descriptions." Recovery: edit `NOISE_TOKENS` + the property test in a follow-up.
- **`yaml.parseDocument` round-trip fidelity.** The library claims comment + key-order preservation but flow-style maps and certain anchor patterns can drift. The integration test asserts byte-equality of the *header* and *non-target* sections after a write. If a real-world `accounting.yaml` exhibits drift, file an issue + add the offending shape to a regression fixture.
- **Future-command callout (Q2 follow-up).** A separate command analysing the whole transaction set for cross-batch patterns is desirable but out of scope; logged in the retro as an open action item.
- **Audit-trail asymmetry — YAML rule persists without a corresponding ledger event.** Per Q1-b, the YAML write happens before the DB snapshot+commit. If steps 5-7 (snapshot/saveBatch/snapshot-remove) fail *after* step 4 (YAML write) succeeded, the YAML carries a new rule for transactions that were never committed. From the [docs/quality-assurance.md](../quality-assurance.md) audit-trail invariant ("every user action that changes state leaves a traceable entry"), this is a partial deviation: the YAML edit is itself a traceable state change (the user's git or backups can show it), but it isn't tied to a ledger transaction id. **Deliberate trade-off** — rules are idempotent and self-healing: on the next ingest, the new rule auto-tags the previously-failed merchant correctly; the user re-runs and the transactions land. No data loss, no silent corruption. Documented here so the trade-off is explicit; future-Story 3.x liquidity work that depends on cross-state invariants should re-examine this.
- **YAML symlink hijacking — known unaddressed gap.** The `validateDbPath` symlink check at [src/infra/db/db-path-validator.ts](../../src/infra/db/db-path-validator.ts) protects the DB file but has no equivalent for `accounting.yaml`. A symlink at the YAML path could redirect Story C's atomic write. The CLI is single-user local-first; the threat model is the user themselves. **Out of scope for Story C** — generalising the symlink check to all config-file paths is a separate maint refactor. The security-checklist edit in slice 12 documents this gap with a `[deferred]` note pointing at a new issue (filed during slice 12 if not already open). Phase-2 review #24 flagged this.
- **ReDoS via user-edited regex** — the `[e]` edit branch creates `new RegExp(p, 'i')` from user input. A pathological pattern `(a+)+$` could cause catastrophic backtracking when matched against a long description. **Mitigation:** length cap of 200 chars on the user-typed pattern (validate callback rejects longer). Threat actor is the user themselves; cap is cheap insurance, not a security boundary.

## Suggestion log (Phase 2 critical review — P1/P2/P3)

Findings from `plan-reviewer` on commit `a41154e`. Resolutions: `adopt` (plan rewritten), `defer` (linked issue), `reject` (rationale).

| # | Phase | Finding (one-line) | Resolution | Link / reason |
| - | ----- | ------------------ | ---------- | ------------- |
| 1 | P1 | R1/R3/R4 baseline compliance | acknowledge | Compliant. |
| 2 | P1 | R2 — `IngestCommandDeps.configWriter` extension not enumerated in Production-code surface | adopt | Added explicit `IngestCommandDeps` extension bullet; all call-site updates noted. |
| 3 | P1 | R2 — exit code 5 is a public CLI surface | adopt | Production-code surface now enumerates exit code 5 as a stable scriptable contract. |
| 4 | P1 | R4/R7 — `spawnCli` doesn't drive stdin; subprocess interactive-input mechanism unspecified | adopt | Plan now pins the mechanism: extend `SpawnOpts` with `stdin?: string` + flip `stdio` to `'pipe'`, with `INQUIRER_FORCE_TTY=0` env. Documented fallback to a `--scripted-prompts` test-only flag if the inquirer raw-mode TTY requirement is unworkable. |
| 5 | P1 | R6 — Gherkin scenario 1 left-in-place draft note | adopt | Cleaned up the `# longest…wait revisit` comment; final Then-clause unambiguous. |
| 6 | P1 | R6 — Gherkin scenario 2 reasoning incorrect (sepa/proxi NOT in NOISE_TOKENS) | adopt | Reworked the example to use only tokens whose noise/length filters are accurate (`VIR SARL CARREFOUR`). Comment now correctly explains: vir<4 length-filtered, sarl noise-filtered, carrefour=longest-eligible. |
| 7 | P1 | R7 — atomicity scenario hedge ("or just asserts the final file is byte-different") | adopt | Tightened to byte-difference + tmp-sibling-absence + 0o600 perms; dropped the transient-observation hedge. |
| 8 | P1 | FR coverage — FR5 + FR17 not cited despite being materially extended | adopt | Context paragraph now cites all three: FR5 (extended), FR6 (fulfilled), FR17 (reordered with documented asymmetry). |
| 9 | P1 | Epic alignment (Story 2.4) — fine | acknowledge | Compliant. |
| 10 | P2 | `io.message` could leak filesystem absolute paths | adopt | `ConfigWriterError.io.message` now spec'd to be sanitised via a `sanitizeFsError` helper mirroring the existing `sanitizeSqlError` pattern. |
| 11 | P2 | Mock-diversity / R8 not triggered (no new structured output) | acknowledge | N/A. |
| 12 | P2 | Audit-trail asymmetry: YAML rule can persist without committed transactions | adopt | Documented in § Risks as a deliberate trade-off; rules are idempotent and self-heal on retry; flagged for future liquidity-engine work to revisit. |
| 13 | P2 | Null-suggester skip denies user the chance to remember a rule for an all-noise description | adopt | Added two-option fallback prompt (`[e] enter pattern manually`, `[n] skip`) when suggester returns null. New Gherkin scenario added. |
| 14 | P3 | `program.ts` cannot get `configPath` from the narrow `ConfigService.load()` port | adopt | Added `FileConfigService.getResolvedConfigPath(): string` (concrete-class method, port unchanged); `program.ts` consumes the concrete class anyway. |
| 15 | P3 | Slice 8 bundles three layers (interactive + ingest-loop + program.ts wiring) | acknowledge | Defended pattern (Story B slice 7 precedent); compile-time chain forces the bundle. |
| 16 | P3 | Slice count 11+ vs R13 ceiling | acknowledge | Documented in plan; cross-layer scope justifies. |
| 17 | P3 | R11 deferred (slice 13 only authored after Phase-4) | acknowledge | Compliant with Story-A retro Try-list R-rule. |
| 18 | P3 | R12 commit subjects compliant | acknowledge | Compliant. |
| 19 | P3 | ReDoS via user-edited regex pattern | adopt | Added 200-char length cap as the second `validate` step; documented in § Risks as cheap insurance (user is threat model). |
| 20 | P3 | YAML symlink-hijacking gap (no equivalent of `validateDbPath`) | adopt | Documented in § Risks; security-checklist slice 12 carries the explicit `[deferred]` note + new issue ref. Generalising the symlink check is a separate maint refactor. |
| 21 | P3 | Property test missing the LONGEST-token determinism invariant | adopt | Property test spec extended to four invariants; LONGEST + tie-break first-occurrence is now property #5. |

**DoR check.** All 21 findings have a non-blank Resolution (14 `adopt` + 7 `acknowledge` + 0 `defer` + 0 `reject`). Zero deferred → no GitHub issues filed for plan findings (the symlink-gap issue is filed separately during slice 12, not as a deferred plan suggestion).
