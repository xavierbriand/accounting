# Epic 3, Story 3.1 — Versioned Split Rules (Validity Window)

## Context

Epic 2 closed with [#1cfa015](https://github.com/xavierbriand/accounting/commit/1cfa015) (story-maint-05 `@inquirer/prompts` 5→8) and [#22678a3](https://github.com/xavierbriand/accounting/commit/22678a3) (`tmp`/`uuid` overrides). Epic 3 ("Liquidity Engine & Settlement") now starts. Story 3.1 lays the **validity-window** spine that the rest of Epic 3 (Stories 3.2 Buffer State Reader, 3.3 Recurring Cost Forecast, 3.4 Safe Monthly Transfer Calc, 3.5 Status CLI) all build on.

**Problem.** Today `AppConfig.splits: readonly SplitRule[]` ([src/core/config/app-config.ts:25](src/core/config/app-config.ts:25)) is a flat list — one set of ratios, applied to every transaction regardless of date. The "Promotion & The Config Tweak" and "Job Loss" journeys ([docs/prd.md:83-99](docs/prd.md:83)) both require ratios that **change at a date**: a March 10 grocery splits 50/50, a March 20 utility 80/20 if the rule changed on March 15. Without versioned rules, settlement (FR8) and dynamic equity (FR12) cannot be implemented, and re-running `settle` against historical data would yield different results depending on today's config (FR22 violation).

**Outcome.** YAML config gains a `splits[].validFrom` grouped-window structure; a Core `SplitRulesService.getSplitsAsOf(date)` resolves the active ratios for any in-range date. **Pure Core + Zod boundary; no DB migration, no CLI command.** Stories 3.2–3.5 will compose this.

**Maintenance sub-loop** (CLAUDE.md § 6.7): `npm audit --omit=dev` reports **0 vulnerabilities**. **3 PRs open** ([#50](https://github.com/xavierbriand/accounting/pull/50) story-maint-04 dbPath validation · [#52](https://github.com/xavierbriand/accounting/pull/52) story-maint-06 ESLint 9→10 · [#36](https://github.com/xavierbriand/accounting/pull/36) product-dev-loop plugin scaffold) — all DRAFT, all touching different files than 3.1 (CLI / DB / `.claude/`). **No file overlap, parallel work safe.** Open issue triage: 8 `deferred-suggestion` items still relevant; #17 (per-account currency consistency) flagged as **Story 3.4 candidate**, not blocking 3.1; #34 (999-row hash cap) and #21 (dbPath traversal — covered by #50) **not on Epic 3 path**; **#42 (vitest config drift)** owns consolidating `vitest.config.ts` + `vitest.config.js`; Story 3.1 edits whichever file is loaded by vitest and verifies, but does **not** consolidate (issue #42 retains scope). **Proceed.**

**User decisions taken before planning** (via AskUserQuestion in plan-mode session):
- Epic 3 = 5 stories starting with 3.1.
- Versioned rules live in **YAML config**, not DB tables. In-memory lookup via Core service.
- Categories will persist at write — but **Story 3.2's** concern; 3.1 doesn't touch the ledger schema.

**Plan-design decisions taken this session:**
- **YAML shape:** **grouped windows**, not flat per-rule effective dates. Makes "ratios in this window sum to 1.0" structural rather than inferred from `validFrom`-equality.
- **`validTo` semantics:** **implicit half-open intervals**. Each window covers `[validFrom_k, validFrom_{k+1})`; the latest covers `[validFrom_last, ∞)`. No `validTo` field stored — contiguous-by-construction, no overlap possible.
- **No backwards-compat shim.** Old-shape configs (flat `[{partner, ratio}]`) **rejected** with a clear error. No production users; per CLAUDE.md "don't add backwards-compatibility shims when you can just change the code."
- **Service surface minimal:** `getSplitsAsOf(date) → Result<readonly SplitRule[]>`. `listAllWindows()` deferred to Story 3.5 when it's actually consumed.
- **Determinism (FR22 spine):** the Service must not call `Date.now()`, `new Date()` with no arg, or read any clock. Greppable assertion (regex-based per P3 review #10) in tests.
- **Date-only vs ISO-8601-with-offset (P3 review #7).** CLAUDE.md § 3 mandates *transactions* carry ISO 8601 with offset to preserve "receipt truth." Story 3.1 adopts date-only `YYYY-MM-DD` for `validFrom` and for the `getSplitsAsOf(date)` argument because **config validity boundaries denote a calendar day in the user's life, not a wall-clock instant**. The shift from "50/50" to "60/40" happens at a date, not at midnight in some timezone. This distinction propagates to all Validity-Window queries in Epic 3 (Stories 3.3 fixed costs, 3.4 transfer calc): date-only inputs.
- **Date string echo in `getSplitsAsOf` errors is intentional (P2 review #3).** Errors include the input date verbatim (e.g. `'date "2023-12-31" precedes earliest split window'`). Date strings are *query parameters*, not stored data, and contain no household PII (no name, IBAN, account identifier). The echo aids debugging. This decision propagates to all Validity-Window query errors in Epic 3.
- **`min(2)` rules per window enforces the couples-app product constraint (P2 review #5).** PRD describes this as a "Couples Expense Sharing App" — at least two partners. A future Family-mode could relax this; ship the constraint explicitly so the relaxation is a deliberate choice, not a silent regression.
- **PII-safe error messages.** Existing Story-1.4 tests assert errors do **not** echo `partner` values ([tests/unit/infra/config/config-schema.test.ts:67](tests/unit/infra/config/config-schema.test.ts:67)). New partner-roster-drift error must follow the same rule — reference *position/index*, not the partner name.
- **Acceptance harness:** `quickpickle ^1.11.1` is already in `package.json` but never wired into vitest config. **Story 3.1 lands the wireup** — first `.feature` file in the project. Cost amortizes over Stories 3.2–3.5.

## Story (verbatim from [docs/epics.md](docs/epics.md))

> **Story 3.1: Versioned Split Rules**
>
> As a System,
> I want split-rule ratios to carry effective dates,
> So that historical transactions are settled with the rule that was active on their date — not today's rule.
>
> **Acceptance Criteria:**
>
> **Given** A YAML config with multiple split-rule windows (each with a `validFrom` date and a list of `partner: ratio` rules),
> **When** I ask the `SplitRulesService` for the active ratios as of a given date,
> **Then** It returns the rules from the latest window whose `validFrom` is on or before that date.
> **And** Windows are half-open `[validFrom_k, validFrom_{k+1})`; the last extends to `+∞`.
> **And** Windows are sorted strictly ascending by `validFrom`; out-of-order or duplicate `validFrom` is rejected at parse.
> **And** Each window's ratios sum exactly to 1.0 (within a `±1e-9` tolerance).
> **And** All windows declare the same partner set; loading rejects roster changes with a path-cited error (no PII echoed).
> **And** `getSplitsAsOf` is pure: it never reads the system clock — re-running with the same `date` argument yields byte-identical output regardless of `Date.now()`.

**FR coverage:** **FR12** (Dynamic Equity Splits — foundation; the actual splitting of transactions lands in Story 3.4) + **FR22** (Deterministic Temporal Calculations — the validity-window pattern itself; reused by 3.3 fixed costs and 3.4 transfer calc).

## Selected solution

Three changes in Core, one in Infra (boundary), three new test files, **six** existing test files migrated to the grouped-window shape (P2 review #1), one example-config migration, one vitest config wireup, two doc edits. No new dependencies (quickpickle and fast-check already installed).

### 1. YAML shape — grouped windows

```yaml
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Alex, ratio: 0.5 }
      - { partner: Sam,  ratio: 0.5 }
  - validFrom: "2026-03-15"
    rules:
      - { partner: Alex, ratio: 0.6 }
      - { partner: Sam,  ratio: 0.4 }
```

**Why grouped, not flat per-rule dates:** the "ratios in this window sum to 1.0" check becomes a single per-array `superRefine` — no inference of which rules belong together. Easier to read in YAML; less ambiguous when a partner roster genuinely needs to change in the future (a separate epic; out of v1 scope).

**Rejected:** flat shape `splits: [{partner, ratio, validFrom}]` — requires inferring window membership from `validFrom`-equality, complicates the per-window sum check, and makes partner-set drift between windows harder to explain in errors.

### 2. Implicit half-open intervals

We do **not** store `validTo` in YAML. A window covers `[validFrom_k, validFrom_{k+1})`; the latest covers `[validFrom_last, ∞)`.

- Half-open intervals are the standard, contiguous-by-construction representation.
- No overlap possible (geometrically).
- A query at a window's `validFrom` returns *that* window (start-inclusive), never the prior one (end-exclusive). This is the explicit half-open contract; a property test guards it.
- A query strictly before `validFrom_0` returns `Result.fail("date precedes earliest split window")` — explicit absence; never silent extrapolation.

### 3. Type extensions ([src/core/config/app-config.ts](src/core/config/app-config.ts))

```ts
export interface SplitRule {            // unchanged
  readonly partner: string;
  readonly ratio: number;
}

export interface SplitWindow {          // new
  readonly validFrom: string;           // ISO 8601 date-only: '^\d{4}-\d{2}-\d{2}$'
  readonly rules: readonly SplitRule[];
}

export interface AppConfig {
  readonly splits: readonly SplitWindow[];   // was: readonly SplitRule[]
  // ...other fields unchanged...
}
```

### 4. Zod boundary ([src/infra/config/config-schema.ts](src/infra/config/config-schema.ts))

Replace the existing `splits` validator (currently a flat array with a sum-to-1 check on the whole list) with a window-level schema:

```ts
const SplitWindowSchema = z.object({
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be ISO 8601 date (YYYY-MM-DD)'),
  // min(2): enforces the couples-app product constraint — see Plan-design decisions.
  rules: z.array(SplitRuleSchema).min(2),
}).strict().superRefine((win, ctx) => {
  // 1. ratios sum to 1.0 (±1e-9) — same tolerance as Story 1.4
  const sum = win.rules.reduce((a, r) => a + r.ratio, 0);
  if (Math.abs(sum - 1.0) > 1e-9) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rules'],
      message: `ratios must sum to 1.0 (got ${sum.toFixed(4)})` });
  }
  // 2. unique partners within window — path cited, name NOT echoed (PII)
  const names = win.rules.map(r => r.partner);
  names.forEach((n, i) => {
    if (names.indexOf(n) !== i) ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['rules', i, 'partner'], message: 'duplicate partner',
    });
  });
});

// In RawConfigSchema:
splits: z.array(SplitWindowSchema).min(1).superRefine((wins, ctx) => {
  // 3. windows in strict ascending validFrom order; duplicates rejected
  for (let i = 1; i < wins.length; i++) {
    if (wins[i].validFrom <= wins[i - 1].validFrom) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'validFrom'],
        message: `must be strictly after the previous window's validFrom` });
    }
  }
  // 4. partner roster identical across all windows — path cited, names NOT echoed (PII)
  const ref = new Set(wins[0].rules.map(r => r.partner));
  for (let i = 1; i < wins.length; i++) {
    const here = new Set(wins[i].rules.map(r => r.partner));
    if (here.size !== ref.size || [...here].some(p => !ref.has(p))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'rules'],
        message: `partner roster differs from window 0` });
    }
  }
}),
```

**Validation rules locked (E.1–E.5 from the workspace plan):**
1. Each window has ≥2 rules whose ratios sum to 1.0 (±1e-9). ≥2 enforces the couples-app product constraint (PRD).
2. `validFrom` is ISO 8601 calendar date — no time, no offset.
3. Windows are sorted ascending by `validFrom`; duplicates rejected.
4. All windows declare the **same partner set** (set equality, order-insensitive).
5. ≥1 window required.

`parseRawConfig` returns `data.splits` directly — no Money construction needed (ratios are plain `number` in `[0, 1]`).

### 5. Core service ([src/core/splits/split-rules-service.ts](src/core/splits/split-rules-service.ts) — new)

```ts
import { Result } from '@core/shared/result.js';
import type { SplitRule, SplitWindow } from '@core/config/app-config.js';

export class SplitRulesService {
  constructor(private readonly windows: readonly SplitWindow[]) {}

  getSplitsAsOf(date: string): Result<readonly SplitRule[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Result.fail(`date must be ISO 8601 date (YYYY-MM-DD): got "${date}"`);
    }
    if (this.windows.length === 0 || date < this.windows[0].validFrom) {
      return Result.fail(`date "${date}" precedes earliest split window`);
    }
    let active = this.windows[0];
    for (const w of this.windows) {
      if (w.validFrom <= date) active = w;
      else break;
    }
    return Result.ok(active.rules);
  }
}
```

**Why this shape works:**
- String comparison on `YYYY-MM-DD` is lexicographically equivalent to chronological — no `Date` object needed (and crucially, no clock dependency for FR22).
- Linear scan is O(n) but n is the number of life-events for one couple over the app's lifetime — measured in single digits to low tens, never thousands. Binary search is YAGNI.
- Half-open intervals fall out of the `<=` comparison: at `date === w.validFrom`, the iteration assigns `active = w` and continues; the `else break` only fires when `w.validFrom > date`.
- No `new Date()`, no `Date.now()`, no `Date.UTC` — a regex-based greppable invariant tested in slice 5 below.
- The empty-windows branch (`this.windows.length === 0`) is defense-in-depth — the schema enforces ≥1 — but the Service trusts its constructor input only weakly (idiomatic Core), and the empty case has its own slice 5 test for branch coverage.

**Folder placement:** `src/core/splits/` — new top-level domain folder under Core, mirroring `src/core/ingest/`, `src/core/ledger/`, `src/core/config/`. Splits are an Epic-3 first-class concept; co-locating in `src/core/config/` would muddy "config = parsing" vs "splits = domain logic."

### 6. quickpickle wireup

`quickpickle ^1.11.1` is already in `package.json` ([line 46](package.json:46)) but never plugged into vitest. Story 3.1 lands the wireup so 3.2–3.5 inherit a working harness.

**Step 1 — verify which vitest config file is loaded** (P3 review #2 + #3). Two files exist today (`vitest.config.ts` + `vitest.config.js`); issue [#42](https://github.com/xavierbriand/accounting/issues/42) owns the consolidation. Slice 2 starts by determining which file vitest actually loads (rename `.js` to `.js.bak` temporarily and re-run `npm test` — if green, `.ts` is loaded; if it errors, `.js` is loaded). Edit that file only. **Restore the renamed file before commit.** The slice 2 commit body MUST include the verification line.

**Edit the loaded file** — add the plugin and `.feature` glob:

```ts
import { defineConfig } from 'vitest/config';
import { quickpickle } from 'quickpickle';
import path from 'path';

export default defineConfig({
  plugins: [quickpickle()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/features/**/*.feature'],
    alias: {
      '@core': path.resolve(__dirname, './src/core'),  // or import.meta.dirname for the .js variant
    },
  },
});
```

The dual-file state remains a [#42](https://github.com/xavierbriand/accounting/issues/42) concern; Story 3.1 does not consolidate (would widen scope).

### 7. accounting.example.yaml migration

Replace lines 32–39 with the grouped-window shape (one window, open-ended — preserves the example's "Alex + Sam 50/50" intent):

```yaml
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Alex, ratio: 0.5 }
      - { partner: Sam,  ratio: 0.5 }
```

A second window can be added by the user as their life events demand; the example carries one to keep cognitive load minimal.

## Critical files to create / touch

| Path | Change |
|---|---|
| [src/core/config/app-config.ts](src/core/config/app-config.ts) | **edit** — add `SplitWindow`; change `AppConfig.splits` to `readonly SplitWindow[]`. Keep `SplitRule`. |
| [src/core/splits/split-rules-service.ts](src/core/splits/split-rules-service.ts) | **new** — class with `getSplitsAsOf`. |
| [src/infra/config/config-schema.ts](src/infra/config/config-schema.ts) | **edit** — `SplitWindowSchema` + window-level superRefine; pass `data.splits` straight through `parseRawConfig`. |
| [vitest.config.ts](vitest.config.ts) **or** [vitest.config.js](vitest.config.js) | **edit (one only — whichever vitest loads)** — register `quickpickle()` plugin; add `tests/features/**/*.feature` to `include`. |
| [tests/unit/infra/config/config-schema.test.ts](tests/unit/infra/config/config-schema.test.ts) | **edit** — replace flat-splits cases with window cases (10 cases incl. positive-multi-roster, partner-set drift PII-safe, ascending-order); update `minimalValid` fixture to grouped shape. |
| [tests/unit/core/splits/split-rules-service.test.ts](tests/unit/core/splits/split-rules-service.test.ts) | **new** — 9 unit cases + 2 fast-check properties + regex-based no-clock assertion. |
| [tests/features/split-rules.feature](tests/features/split-rules.feature) | **new** — 3 Gherkin scenarios. |
| [tests/features/steps/split-rules.steps.ts](tests/features/steps/split-rules.steps.ts) | **new** — quickpickle step defs against `parseRawConfig` + `SplitRulesService`. |
| [tests/integration/infra/config/config-service.test.ts](tests/integration/infra/config/config-service.test.ts) | **edit** (P2 #1) — migrate inline `validYaml` fixture to grouped-window shape; update assertion `config.splits[0].rules[0].partner === 'Alex'` (was `config.splits[0].partner`); `splits.toHaveLength(1)` (was `2` — one window now). |
| [tests/unit/cli/commands/ingest-command.test.ts](tests/unit/cli/commands/ingest-command.test.ts) | **edit** (P2 #1) — migrate `splits:` fixture from flat to one-window grouped shape. |
| [tests/unit/cli/commands/ingest-command-flags.test.ts](tests/unit/cli/commands/ingest-command-flags.test.ts) | **edit** (P2 #1) — same as above. |
| [tests/integration/cli/ingest-commit.test.ts](tests/integration/cli/ingest-commit.test.ts) | **edit** (P2 #1) — same as above. |
| [tests/perf/ingest-throughput.test.ts](tests/perf/ingest-throughput.test.ts) | **edit** (P2 #1) — same as above. |
| [accounting.example.yaml](accounting.example.yaml) | **edit** — migrate `splits:` block to grouped-window shape. |
| [docs/epics.md](docs/epics.md) | **edit** — replace Epic 3 placeholder with Story 3.1 acceptance criteria; seed 3.2–3.5 placeholders **as one-line titles only** (P3 #11 — no Given/When/Then for unwritten ACs). |
| [docs/plans/story-3.1.md](docs/plans/story-3.1.md) | **new** — this file. |

**Reused (no edit):** [`Result.ok` / `Result.fail`](src/core/shared/result.ts), [`formatZodError`](src/infra/config/config-schema.ts:127), [`parseRawConfig`](src/infra/config/config-schema.ts:135), `fast-check ^4.7.0`, `quickpickle ^1.11.1`. **No new runtime or test deps.** [Money](src/core/shared/money.ts) and [Transaction](src/core/ledger/transaction.ts) untouched.

## Gherkin scenarios

Three scenarios — at the CLAUDE.md § 6.6 ceiling. Each carries a `# fails if …` annotation that names a 3.1-local production path (P1 #2 + #3).

```gherkin
Feature: Versioned split rules (Story 3.1)

  Scenario: active ratios resolve to the latest window whose validFrom <= date
    Given a config with two split windows:
      | validFrom  | partner | ratio |
      | 2024-01-01 | Alex    | 0.5   |
      | 2024-01-01 | Sam     | 0.5   |
      | 2026-03-15 | Alex    | 0.6   |
      | 2026-03-15 | Sam     | 0.4   |
    When I look up the active splits as of "2026-04-20"
    Then the active ratios are Alex 0.6 and Sam 0.4
    And looking up the active splits as of "2026-03-15" also returns 0.6 / 0.4 (start-inclusive)
    And looking up the active splits as of "2026-03-14" returns 0.5 / 0.5 (end-exclusive)
    And looking up the active splits as of "2023-12-31" returns Result.fail with "precedes earliest split window"
    # fails if: SplitRulesService picks the wrong window — off-by-one, picks first match
    # instead of latest applicable, treats interval as fully-closed, or silently
    # extrapolates past the earliest validFrom (the 2023-12-31 line guards that). Clock
    # purity is owned by the slice 5 (g) regex assertion, not by this scenario.

  Scenario: a configuration with two windows sharing a validFrom is rejected at parse
    Given a config has two split windows both starting on "2024-01-01"
    When the configuration is loaded
    Then loading fails with an error citing the duplicate validFrom by index
    And the error message contains no stack trace and no Zod-internal type name
    # fails if: Zod schema accepts duplicate validFrom values (downstream getSplitsAsOf
    # would silently pick whichever sorts first — non-deterministic). Also fails if
    # the error surfaces "ZodError" or a stack trace instead of formatZodError's output.

  Scenario: partner roster must be identical across all windows (path-cited, PII-safe)
    Given a config where window 0 has partners "Alex, Sam"
    And window 1 has partners "Alex, Jordan"
    When the configuration is loaded
    Then loading fails with an error citing the offending window by index
    And the error message does NOT echo any partner name verbatim
    # fails if: parseRawConfig accepts windows with non-identical partner sets, allowing
    # the parsed config to ship mismatched rosters into any downstream consumer. Also
    # fails if the error message echoes a partner name — partner names are user-controlled
    # and treated as PII per the existing Story-1.4 test pattern
    # ([config-schema.test.ts:67] expects "not.toContain('Alex')").
```

## Plan for Sonnet (commit slices)

Target **7–8 commits** (slice 1 already landed). Every subject carries `(Story 3.1)`. Subject lines use **summary verbs** (CLAUDE.md § 6.4 retro), scenario detail in commit body. Slice = one behaviour + tests + minimal green (CLAUDE.md § 6.6 retro from Story 1.4).

1. ✅ `chore(docs): Story 3.1 plan + epics.md acceptance criteria (Story 3.1)` — landed at [5b46766](https://github.com/xavierbriand/accounting/commit/5b46766).

2. `test(features): split rules acceptance suite — failing (Story 3.1)`
   **Step A** — verify which vitest config file is loaded: rename `vitest.config.js` → `vitest.config.js.bak` temporarily, run `npm test`; if green, `.ts` is loaded; if errors, `.js` is. Restore before commit. **The commit body MUST include this verification line** (P3 #3): e.g. *"Verified vitest loads `vitest.config.ts`: renamed `.js` to `.js.bak`, `npm test` green, restored `.js`."*
   **Step B** — Edit the loaded file: register `quickpickle()` in `plugins`; add `tests/features/**/*.feature` to `include`.
   **Step C** — Create `tests/features/split-rules.feature` with the three Gherkin scenarios (verbatim from above) and `tests/features/steps/split-rules.steps.ts` with skeleton step defs that throw `Error('not implemented')`.
   **Result:** `npm test` shows three failing acceptance scenarios; `npm run lint` and `npm run build` stay green.

3. `test(config): split-window schema validation suite — failing (Story 3.1)`
   Edit [tests/unit/infra/config/config-schema.test.ts](tests/unit/infra/config/config-schema.test.ts):
   - Replace the existing flat-splits `minimalValid` fixture with a one-window grouped fixture (so existing happy-path tests stay covered).
   - Add a `describe('split windows', () => { ... })` block with these cases (each carrying a `// fails if …` per Story 1.3 retro):
     - **(a)** accepts grouped-window shape (one window);
     - **(b)** rejects flat (old-shape) splits with a clear error citing the missing `validFrom` field;
     - **(c)** rejects duplicate `validFrom` across windows (path-cited);
     - **(d)** rejects out-of-order windows (path-cited);
     - **(e)** rejects per-window ratios not summing to 1.0;
     - **(f)** rejects partner roster drift between windows: asserts the error message contains `'splits.1.rules'` (path-citation; P3 #9) AND does NOT contain `'Alex'`, `'Sam'`, or `'Jordan'` (PII safety, P2 #1.f);
     - **(g)** rejects malformed `validFrom` via `it.each` over four inputs (P3 #6): `"2024-01-01T00:00:00Z"` (timestamp), `"2024-1-1"` (single-digit), `""` (empty), `" 2024-01-01"` (leading whitespace) — each asserts the rejection cites `validFrom` by path;
     - **(h)** rejects a window with <2 rules (couples-app constraint per Plan-design decision; P2 #5);
     - **(i)** accepts a single-window config (open-ended, the default first-time setup);
     - **(j)** **NEW — accepts two windows with identical partner sets in different order** (P1 #1): window 0 `[Alex, Sam]`, window 1 `[Sam, Alex]` — order-insensitive set equality. `// fails if: roster check uses array equality instead of set equality.`
   - Test the duplicate-partner-within-window error wording: `expect(error).toContain('duplicate partner')` (P2 #2 — testpinned wording).
   All ten cases fail because the schema is still flat-list.

4. `feat(config): accept split-window structure with validation — minimal green (Story 3.1)`
   Edit [src/core/config/app-config.ts](src/core/config/app-config.ts) and **[src/infra/config/config-schema.ts](src/infra/config/config-schema.ts)** (P3 #1 — note correct path; the prior plan said `src/infra/config/app-config.ts` which doesn't exist) per Selected Solution §3 + §4. Migrate [accounting.example.yaml](accounting.example.yaml) splits block to the grouped shape.
   **Migrate the five test files referenced above (P2 #1):**
   - [tests/integration/infra/config/config-service.test.ts](tests/integration/infra/config/config-service.test.ts) — migrate inline `validYaml`; update assertion to `config.splits[0].rules[0].partner === 'Alex'` and `config.splits[0].rules[0].ratio === 0.5`; change `splits.toHaveLength(2)` → `splits.toHaveLength(1)` and add `splits[0].rules.toHaveLength(2)`.
   - [tests/unit/cli/commands/ingest-command.test.ts:30](tests/unit/cli/commands/ingest-command.test.ts:30), [tests/unit/cli/commands/ingest-command-flags.test.ts:28](tests/unit/cli/commands/ingest-command-flags.test.ts:28), [tests/integration/cli/ingest-commit.test.ts:89](tests/integration/cli/ingest-commit.test.ts:89), [tests/perf/ingest-throughput.test.ts:142](tests/perf/ingest-throughput.test.ts:142) — change `splits: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }]` → `splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] }]`.
   All ten schema tests + the existing `parseRawConfig` happy-path tests + the five migrated test files pass.

5. `test(splits): SplitRulesService.getSplitsAsOf + properties — failing (Story 3.1)`
   New [tests/unit/core/splits/split-rules-service.test.ts](tests/unit/core/splits/split-rules-service.test.ts):
   - **Unit cases** (each with `// fails if …`):
     - **(a)** returns the latest window's rules for a date in the latest range;
     - **(b)** returns earlier window's rules for a date inside that earlier range;
     - **(c)** at `date === windows[k].validFrom`, returns window k (start-inclusive — not k-1);
     - **(d)** at `date === windows[k+1].validFrom - 1 day` (string-arithmetic via `'2026-03-14'`), returns window k (end-exclusive);
     - **(e)** for a date strictly before `windows[0].validFrom`, returns `Result.fail` with a message that includes `"precedes earliest split window"`;
     - **(f)** for a date string failing the ISO date-only regex, returns `Result.fail` with a message that includes `"ISO 8601"`. Cover via `it.each([...])` over: `"2026/03/15"`, `"03/15/2026"`, `"2026-3-15"`, `""`, **`"2026-04-20T14:30:00+02:00"`**, **`"2026-04-20T00:00:00Z"`** (P1 #4 — date+time inputs are explicitly rejected; FR22 boundary depends on it);
     - **(g)** **regex-based greppable no-clock assertion** (P3 #10) — read the source file at `src/core/splits/split-rules-service.ts` and assert: `expect(source).not.toMatch(/\bnew\s+Date\s*\(/)` AND `expect(source).not.toMatch(/\bDate\.now\s*\(/)` AND `expect(source).not.toMatch(/\bDate\.UTC\s*\(/)`. Catches whitespace variants the previous `.includes()` would miss. **FR22 spine.**
     - **(h)** **NEW — single-window service** (P1 #7): `new SplitRulesService([{ validFrom: '2024-01-01', rules: [...] }]).getSplitsAsOf('2026-04-25')` returns those rules. `// fails if: linear scan assumes ≥2 windows.`
     - **(i)** **NEW — empty-windows service** (P3 #4): `new SplitRulesService([]).getSplitsAsOf('2026-04-25')` returns `Result.fail` containing `"precedes earliest"`. Branch-coverage check; defense-in-depth.
   - **Property tests (`fast-check`)** — both wrap `expect(result.isSuccess).toBe(true)` before accessing `.value` (P3 #5):
     - **(P1) Sum invariant.** Generator: an array of 1..6 windows where each window's two rules have ratios `r` and `1 - r` for `r ∈ [0.01, 0.99]`. The `validFrom` arbitrary draws from `fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31') })` mapped to `YYYY-MM-DD`, then sorted strictly ascending and de-duplicated (P2 #4). The query date is drawn from a date arbitrary constrained to `>= windows[0].validFrom` AND `<= '2099-12-31'`. After `expect(result.isSuccess).toBe(true)`, assert `result.value.reduce((a, r) => a + r.ratio, 0)` equals 1.0 within 1e-9. ≥100 runs.
     - **(P2) Boundary inclusivity AND uniqueness** (P3 #8). For any generated window sequence, for every pair `(k, k-1)` with `k ≥ 1`, after `expect(both isSuccess).toBe(true)`: `getSplitsAsOf(windows[k].validFrom).value !== getSplitsAsOf(windows[k-1].validFrom).value` (distinct rule arrays at distinct boundaries). **Strengthens the prior existence check** — a buggy implementation that always returns the latest window would now fail. ≥100 runs.
   All cases + properties fail because no `SplitRulesService` exists yet.

6. `feat(splits): SplitRulesService resolves active window — minimal green (Story 3.1)`
   Add [src/core/splits/split-rules-service.ts](src/core/splits/split-rules-service.ts) per Selected Solution §5. Unit + property tests pass. The acceptance scenarios from slice 2 still fail (steps not wired).

7. `feat(features): wire split-rules acceptance steps — green (Story 3.1)`
   Implement [tests/features/steps/split-rules.steps.ts](tests/features/steps/split-rules.steps.ts) — Given/When/Then handlers that build a YAML payload, call `parseRawConfig`, build a `SplitRulesService`, exercise `getSplitsAsOf`, and assert. The three Gherkin scenarios pass.
   **Acceptable green-on-landing per CLAUDE.md § 6.4** — slices 4 + 6 already cover every production path the scenarios exercise; this commit is pure step-defs glue. Sonnet's return report must call this out under "Deviations" with the rationale "step-defs landed green because slices 4+6 already covered the schema and service paths the acceptance suite drives."

8. `refactor(splits): tidy or noop (Story 3.1)`
   Walk the new code with the 60-LOC + duplication trigger (Story 2.3 retro). If `SplitRulesService.getSplitsAsOf` exceeds 50 LOC or has ≥2 duplicated blocks, extract. Otherwise commit empty with body: *"No refactor identified: getSplitsAsOf is N LOC, single-loop, no duplication. Schema additions stayed inside the existing per-array `superRefine` pattern. Tests pass; coverage 100% on `src/core/splits/`."*

**Estimated 7 remaining commits + slice 1 already landed = 8 total.** Slice 7 ships green-on-landing (documented). Slice 8 may be empty (documented). No green-on-landing risk in slices 3–6: each adds genuinely new behaviour or a new file; the schema grows incrementally.

### Deps pre-authorised

None. All runtime + test deps already present (`quickpickle ^1.11.1`, `fast-check ^4.7.0`, `zod ^4.3.6`).

### Verification (end-to-end, pre-merge)

- `npm run lint && npm run build && npm test` — all green.
- Branch coverage: **100% on `src/core/splits/`** (Core gate, CLAUDE.md § 7.3).
- `git grep -E "Date\\.now\\(|new\\s+Date\\(|Date\\.UTC\\(" src/core/splits/` returns **no matches** (FR22 spine; regex-based per P3 #10).
- Manually load the migrated [accounting.example.yaml](accounting.example.yaml) via a one-off `tsx -e "..."` invocation; confirm `parseRawConfig` succeeds and `new SplitRulesService(config.splits).getSplitsAsOf('2026-04-25').isSuccess === true`. **Do not commit the throwaway script.**
- Inject a deliberately-broken example yaml (duplicate `validFrom`); confirm the same one-off script prints the human-readable error from `formatZodError` (no stack trace, no `ZodError` type name). Revert the yaml.
- **Slice 2 commit body contains the vitest-config-resolution verification line** (P3 retro-check item).

## Risks & deferrals

- **Issue [#42](https://github.com/xavierbriand/accounting/issues/42) (vitest config drift `.ts` vs `.js`).** Story 3.1 edits whichever file vitest loads (slice 2 verification step). It does **not** consolidate — issue #42 retains scope. If slice 2 reveals the unloaded file is silently shadowed (e.g. coverage thresholds in `.js` aren't applied because `.ts` wins), the slice-2 commit body documents the divergence and we open a follow-up to merge into the loaded file. Consolidation itself is out of 3.1 scope.
- **Issue [#17](https://github.com/xavierbriand/accounting/issues/17) (per-account currency consistency).** Tagged Story 3.4 candidate. Not blocked by 3.1. Re-evaluate in 3.4 planning.
- **Date-only vs ISO-8601-with-offset.** CLAUDE.md § 3 mandates *transactions* carry offset. Story 3.1 adopts date-only for `validFrom` and `getSplitsAsOf(date)` because config validity boundaries denote calendar days, not wall-clock instants. Documented in Plan-design decisions. Re-stated here for cross-reference.
- **Date echo in `getSplitsAsOf` errors is non-PII** (P2 #3). Date strings are query parameters, not stored data; echo is intentional and aids debugging. Decision propagates to Stories 3.2–3.5.
- **PII-safety regression risk.** Existing tests assert errors don't echo `'Alex'` / `'Sam'` / `'Car'`. New partner-roster-drift error follows suit (path index, not name). Slice 3 case (f) explicitly asserts `not.toContain('Alex')` AND `not.toContain('Jordan')` AND asserts the path citation `'splits.1.rules'` (P3 #9 mock-diversity).
- **Date-string contract for downstream stories.** `getSplitsAsOf` accepts only `YYYY-MM-DD`; Stories 3.2–3.5 must normalise to date-only before calling. Documented in Plan-design decisions.
- **No `validTo` field stored.** A future requirement to model "this rule sunset on a known date" would require a schema change. Out of v1 scope.
- **`accounting test --dry-run` Historical Integrity Check (P2 #7).** PRD journey "The Promotion & The Config Tweak" requires this command. Foundation lands here (3.1) → calculation engine in **Story 3.4** → CLI surface in **Story 3.5 or post-Epic-3**. Confirm scope in Epic 3 close-out. The journey is not deliverable from 3.1 alone.
- **Acceptable green-on-landing in slice 7.** The TDD-by-intent invariant still holds: the step-defs *would* fail against a stripped-down schema or service. Documented in Sonnet's Deviations section.
- **Empty-refactor slice 8.** Only justifiable if the service is genuinely under 50 LOC with no duplication — verify, don't assume.
- **`min(2)` rules per window enforces couples-app constraint** (P2 #5). A future Family-mode that allows 1+ partners is a deliberate feature decision, not a silent regression.
