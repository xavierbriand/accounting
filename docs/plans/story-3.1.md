# Epic 3, Story 3.1 — Versioned Split Rules (Validity Window)

## Context

Epic 2 closed with [#1cfa015](https://github.com/xavierbriand/accounting/commit/1cfa015) (story-maint-05 `@inquirer/prompts` 5→8) and [#22678a3](https://github.com/xavierbriand/accounting/commit/22678a3) (`tmp`/`uuid` overrides). Epic 3 ("Liquidity Engine & Settlement") now starts. Story 3.1 lays the **validity-window** spine that the rest of Epic 3 (Stories 3.2 Buffer State Reader, 3.3 Recurring Cost Forecast, 3.4 Safe Monthly Transfer Calc, 3.5 Status CLI) all build on.

**Problem.** Today `AppConfig.splits: readonly SplitRule[]` ([src/core/config/app-config.ts:25](src/core/config/app-config.ts:25)) is a flat list — one set of ratios, applied to every transaction regardless of date. The "Promotion & The Config Tweak" and "Job Loss" journeys ([docs/prd.md:83-99](docs/prd.md:83)) both require ratios that **change at a date**: a March 10 grocery splits 50/50, a March 20 utility 80/20 if the rule changed on March 15. Without versioned rules, settlement (FR8) and dynamic equity (FR12) cannot be implemented, and re-running `settle` against historical data would yield different results depending on today's config (FR22 violation).

**Outcome.** YAML config gains a `splits[].validFrom` grouped-window structure; a Core `SplitRulesService.getSplitsAsOf(date)` resolves the active ratios for any in-range date. **Pure Core + Zod boundary; no DB migration, no CLI command.** Stories 3.2–3.5 will compose this.

**Maintenance sub-loop** (CLAUDE.md § 6.7): `npm audit --omit=dev` reports **0 vulnerabilities**. **3 PRs open** ([#50](https://github.com/xavierbriand/accounting/pull/50) story-maint-04 dbPath validation · [#52](https://github.com/xavierbriand/accounting/pull/52) story-maint-06 ESLint 9→10 · [#36](https://github.com/xavierbriand/accounting/pull/36) product-dev-loop plugin scaffold) — all DRAFT, all touching different files than 3.1 (CLI / DB / `.claude/`). **No file overlap, parallel work safe.** Open issue triage: 8 `deferred-suggestion` items still relevant; #17 (per-account currency consistency) flagged as **Story 3.4 candidate**, not blocking 3.1; #34 (999-row hash cap) and #21 (dbPath traversal — covered by #50) **not on Epic 3 path**; #42 (vitest config drift) flagged in Risks but **not adopted into 3.1 scope** to keep this story tight. **Proceed.**

**User decisions taken before planning** (via AskUserQuestion in plan-mode session):
- Epic 3 = 5 stories starting with 3.1.
- Versioned rules live in **YAML config**, not DB tables. In-memory lookup via Core service.
- Categories will persist at write — but **Story 3.2's** concern; 3.1 doesn't touch the ledger schema.

**Plan-design decisions taken this session:**
- **YAML shape:** **grouped windows**, not flat per-rule effective dates. Makes "ratios in this window sum to 1.0" structural rather than inferred from `validFrom`-equality.
- **`validTo` semantics:** **implicit half-open intervals**. Each window covers `[validFrom_k, validFrom_{k+1})`; the latest covers `[validFrom_last, ∞)`. No `validTo` field stored — contiguous-by-construction, no overlap possible.
- **No backwards-compat shim.** Old-shape configs (flat `[{partner, ratio}]`) **rejected** with a clear error. No production users; per CLAUDE.md "don't add backwards-compatibility shims when you can just change the code."
- **Service surface minimal:** `getSplitsAsOf(date) → Result<readonly SplitRule[]>`. `listAllWindows()` deferred to Story 3.5 when it's actually consumed.
- **Determinism (FR22 spine):** the Service must not call `Date.now()`, `new Date()` with no arg, or read any clock. Greppable assertion in tests.
- **PII-safe error messages.** Existing Story-1.4 tests assert errors do **not** echo `partner` values ([tests/unit/infra/config/config-schema.test.ts:67](tests/unit/infra/config/config-schema.test.ts:67)). New partner-roster-drift error must follow the same rule — reference *position/index*, not the partner name.
- **Acceptance harness:** `quickpickle ^1.11.1` is already in `package.json` but never wired into `vitest.config.ts`. **Story 3.1 lands the wireup** — first `.feature` file in the project. Cost amortizes over Stories 3.2–3.5.

## Story (to be added verbatim to [docs/epics.md](docs/epics.md))

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
> **And** Each window's ratios sum exactly to 1.0 (Largest-Remainder-safe).
> **And** All windows declare the same partner set; loading rejects roster changes with a path-cited error (no PII echoed).
> **And** `getSplitsAsOf` is pure: it never reads the system clock — re-running with the same `date` argument yields byte-identical output regardless of `Date.now()`.

**FR coverage:** **FR12** (Dynamic Equity Splits — foundation; the actual splitting of transactions lands in Story 3.4) + **FR22** (Deterministic Temporal Calculations — the validity-window pattern itself; reused by 3.3 fixed costs and 3.4 transfer calc).

## Selected solution

Three changes in Core, one in Infra (boundary), three new test files, one example-config migration, one `vitest.config.ts` wireup, two doc edits. No new dependencies (quickpickle already installed).

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
1. Each window has ≥2 rules whose ratios sum to 1.0 (±1e-9).
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
- No `new Date()`, no `Date.now()`, no `Date.UTC` — a greppable invariant tested in slice 4 below.

**Folder placement:** `src/core/splits/` — new top-level domain folder under Core, mirroring `src/core/ingest/`, `src/core/ledger/`, `src/core/config/`. Splits are an Epic-3 first-class concept; co-locating in `src/core/config/` would muddy "config = parsing" vs "splits = domain logic."

### 6. quickpickle wireup

`quickpickle ^1.11.1` is already in `package.json` ([line 46](package.json:46)) but never plugged into vitest. Story 3.1 lands the wireup so 3.2–3.5 inherit a working harness.

**Edit [vitest.config.ts](vitest.config.ts)** — add the plugin:

```ts
import { defineConfig } from 'vitest/config';
import { quickpickle } from 'quickpickle';
import path from 'path';

export default defineConfig({
  plugins: [quickpickle()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/features/**/*.feature'],
    alias: {
      '@core': path.resolve(__dirname, './src/core'),
    },
  },
});
```

**`vitest.config.js` is left alone.** Issue [#42](https://github.com/xavierbriand/accounting/issues/42) (vitest config drift) owns consolidating the two files; folding it into Story 3.1 widens scope. **Risk:** the `.js` may shadow the `.ts` depending on vitest's resolution order — verify in slice 1 by deleting `.js` locally and re-running tests; if green, file a follow-up to drop `.js`.

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
| [vitest.config.ts](vitest.config.ts) | **edit** — register `quickpickle()` plugin; add `tests/features/**/*.feature` to `include`. |
| [tests/unit/infra/config/config-schema.test.ts](tests/unit/infra/config/config-schema.test.ts) | **edit** — replace flat-splits cases with window cases; PII assertions kept. |
| [tests/unit/core/splits/split-rules-service.test.ts](tests/unit/core/splits/split-rules-service.test.ts) | **new** — unit + 2 fast-check properties + greppable-no-clock assertion. |
| [tests/features/split-rules.feature](tests/features/split-rules.feature) | **new** — 3 Gherkin scenarios. |
| [tests/features/steps/split-rules.steps.ts](tests/features/steps/split-rules.steps.ts) | **new** — quickpickle step defs against `parseRawConfig` + `SplitRulesService`. |
| [accounting.example.yaml](accounting.example.yaml) | **edit** — migrate `splits:` block to grouped-window shape. |
| [docs/epics.md](docs/epics.md) | **edit** — replace Epic 3 placeholder with Story 3.1 acceptance criteria; seed 3.2–3.5 placeholders. |
| [docs/plans/story-3.1.md](docs/plans/story-3.1.md) | **new** — this file. |

**Reused (no edit):** [`Result.ok` / `Result.fail`](src/core/shared/result.ts), [`formatZodError`](src/infra/config/config-schema.ts:127), [`parseRawConfig`](src/infra/config/config-schema.ts:135), `fast-check ^4.7.0`, `quickpickle ^1.11.1`. **No new runtime or test deps.** [Money](src/core/shared/money.ts) and [Transaction](src/core/ledger/transaction.ts) untouched.

## Gherkin scenarios

Three scenarios — at the CLAUDE.md § 6.6 ceiling. Each carries a `# fails if …` annotation per § 6.1 P4 audit rule.

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
    # fails if: SplitRulesService picks the wrong window (off-by-one, picks first match
    # instead of latest applicable, or treats interval as fully-closed). Also fails if
    # getSplitsAsOf reads the system clock instead of using the date argument.

  Scenario: a configuration with two windows sharing a validFrom is rejected at parse
    Given a config has two split windows both starting on "2024-01-01"
    When the configuration is loaded
    Then loading fails with an error citing the duplicate validFrom by index
    And the error message contains no stack trace and no Zod-internal type name
    # fails if: Zod schema accepts duplicate validFrom values (ordering becomes
    # undefined, downstream getSplitsAsOf would silently pick whichever sorts first).
    # Also fails if the error surfaces a Zod type name like "ZodError" instead of
    # the formatZodError-rendered human sentence.

  Scenario: partner roster must be identical across all windows (path-cited, PII-safe)
    Given a config where window 0 has partners "Alex, Sam"
    And window 1 has partners "Alex, Jordan"
    When the configuration is loaded
    Then loading fails with an error citing the offending window by index
    And the error message does NOT echo any partner name verbatim
    # fails if: the boundary check lets partner sets drift across windows (downstream
    # Money.allocate in Story 3.4 would receive a mismatched ratio array, silently
    # producing wrong settlement amounts). Also fails if the error message echoes a
    # partner name — partner names are user-controlled and treated as PII per
    # security-checklist.md and the existing Story-1.4 test pattern
    # ([config-schema.test.ts:67] expects "not.toContain('Alex')").
```

## Plan for Sonnet (commit slices)

Target **7–8 commits**. Every subject carries `(Story 3.1)`. Subject lines use **summary verbs** (CLAUDE.md § 6.4 retro), scenario detail in commit body. Slice = one behaviour + tests + minimal green (CLAUDE.md § 6.6 retro from Story 1.4).

1. `chore(docs): Story 3.1 plan + epics.md acceptance criteria (Story 3.1)`
   Commit this plan file at `docs/plans/story-3.1.md`. Update `docs/epics.md`: replace Epic 3 "*Detailed stories to be defined…*" with the Story 3.1 acceptance block + seeded placeholders for 3.2–3.5 (one-line per story so the epic-level decomposition is canonical going forward).

2. `test(features): split rules acceptance suite — failing (Story 3.1)`
   Wire `quickpickle()` into [vitest.config.ts](vitest.config.ts) `plugins` and add `tests/features/**/*.feature` to `include`. Create `tests/features/split-rules.feature` with the three Gherkin scenarios (verbatim from above). Create `tests/features/steps/split-rules.steps.ts` with skeleton step defs that throw `Error('not implemented')`. `npm test` shows three failing acceptance scenarios; `npm run lint` and `npm run build` stay green. **Verification step in the commit body:** locally delete `vitest.config.js`, re-run tests, confirm green; if so, leave the deletion out of this commit (issue #42 owns it) but record the verification in the body.

3. `test(config): split-window schema validation suite — failing (Story 3.1)`
   Edit [tests/unit/infra/config/config-schema.test.ts](tests/unit/infra/config/config-schema.test.ts):
   - Replace the existing flat-splits `minimalValid` fixture with a one-window grouped fixture (so existing happy-path tests stay covered).
   - Add a `describe('split windows', () => { ... })` block:
     - (a) accepts grouped-window shape;
     - (b) rejects flat (old-shape) splits with a clear error citing the missing `validFrom` field;
     - (c) rejects duplicate `validFrom` across windows (path-cited);
     - (d) rejects out-of-order windows (path-cited);
     - (e) rejects per-window ratios not summing to 1.0;
     - (f) rejects partner roster drift between windows (path-cited; **no partner-name echoed** — `expect(error).not.toContain('Alex')` and same for `'Jordan'`);
     - (g) rejects `validFrom` with a time component (`"2024-01-01T00:00:00Z"`) — date-only contract;
     - (h) rejects a window with <2 rules (degenerate single-partner config);
     - (i) accepts a single-window config (open-ended, the default first-time setup).
   All nine cases fail because the schema is still flat-list. Each test carries a `// fails if …` comment per Story 1.3 retro.

4. `feat(config): accept split-window structure with validation — minimal green (Story 3.1)`
   Edit [src/core/config/app-config.ts](src/core/config/app-config.ts) and [src/infra/config/app-config.ts](src/infra/config/config-schema.ts) per Selected Solution §3 + §4. Migrate [accounting.example.yaml](accounting.example.yaml) splits block to the grouped shape (kept as one open-ended window). All nine schema tests + the existing `parseRawConfig` happy-path tests pass.

5. `test(splits): SplitRulesService.getSplitsAsOf + properties — failing (Story 3.1)`
   New [tests/unit/core/splits/split-rules-service.test.ts](tests/unit/core/splits/split-rules-service.test.ts):
   - **Unit cases** (each with `// fails if …`):
     - (a) returns the latest window's rules for a date in the latest range;
     - (b) returns earlier window's rules for a date inside that earlier range;
     - (c) at `date === windows[k].validFrom`, returns window k (start-inclusive — not k-1);
     - (d) at `date === windows[k+1].validFrom - 1 day` (string-arithmetic via `'2026-03-14'`), returns window k (end-exclusive);
     - (e) for a date strictly before `windows[0].validFrom`, returns `Result.fail` with a message that includes `"precedes earliest split window"`;
     - (f) for a date string failing the ISO regex (`"2026/03/15"`, `"03/15/2026"`, `"2026-3-15"`, `""`), returns `Result.fail` with a message that includes `"ISO 8601"`;
     - (g) **greppable no-clock assertion** — read the source file at `src/core/splits/split-rules-service.ts` and assert `!source.includes('Date.now') && !source.includes('new Date()') && !source.includes('Date.UTC')` (FR22 spine).
   - **Property tests (`fast-check`):**
     - **(P1) Sum invariant.** For any generated sequence of N (1..6) windows where each window's two rules have ratios `r` and `1 - r` (so the boundary sum-to-1 check is satisfied by construction), and any generated date string drawn from the union of windows' ranges, `getSplitsAsOf(date).value.reduce((a, r) => a + r.ratio, 0)` equals 1.0 within 1e-9.
     - **(P2) Boundary inclusivity.** For any generated window sequence and any window k, `getSplitsAsOf(windows[k].validFrom).value` deep-equals `windows[k].rules` (start-inclusive guarantee). Sample size 100.
   All cases + properties fail because no `SplitRulesService` exists yet.

6. `feat(splits): SplitRulesService resolves active window — minimal green (Story 3.1)`
   Add [src/core/splits/split-rules-service.ts](src/core/splits/split-rules-service.ts) per Selected Solution §5. Unit + property tests pass. The acceptance scenarios from slice 2 still fail (steps not wired).

7. `feat(features): wire split-rules acceptance steps — green (Story 3.1)`
   Implement [tests/features/steps/split-rules.steps.ts](tests/features/steps/split-rules.steps.ts) — Given/When/Then handlers that build a YAML payload, call `parseRawConfig`, build a `SplitRulesService`, exercise `getSplitsAsOf`, and assert. The three Gherkin scenarios pass.
   **Acceptable green-on-landing per CLAUDE.md § 6.4** — slices 4 + 6 already cover every production path the scenarios exercise; this commit is pure step-defs glue. Sonnet's return report must call this out under "Deviations" with the rationale "step-defs landed green because slices 4+6 already covered the schema and service paths the acceptance suite drives."

8. `refactor(splits): tidy or noop (Story 3.1)`
   Walk the new code with the 60-LOC + duplication trigger (Story 2.3 retro). If `SplitRulesService.getSplitsAsOf` exceeds 50 LOC or has ≥2 duplicated blocks, extract. Otherwise commit empty with body: *"No refactor identified: getSplitsAsOf is N LOC, single-loop, no duplication. Schema additions stayed inside the existing per-array `superRefine` pattern. Tests pass; coverage 100% on `src/core/splits/`."*

**Estimated 8 commits.** Slice 7 ships green-on-landing (documented). Slice 8 may be empty (documented). No green-on-landing risk in slices 3–6: each adds genuinely new behaviour or a new file; the schema grows incrementally.

### Deps pre-authorised

None. All runtime + test deps already present (`quickpickle ^1.11.1`, `fast-check ^4.7.0`, `zod ^4.3.6`).

### Verification (end-to-end, pre-merge)

- `npm run lint && npm run build && npm test` — all green.
- Branch coverage: **100% on `src/core/splits/`** (Core gate, CLAUDE.md § 7.3).
- `git grep -n "Date\\.now\\|new Date()\\|Date\\.UTC" src/core/splits/` returns **no matches** (FR22 spine).
- Manually load the migrated [accounting.example.yaml](accounting.example.yaml) via a one-off `tsx -e "..."` invocation; confirm `parseRawConfig` succeeds and `new SplitRulesService(config.splits).getSplitsAsOf('2026-04-25').isSuccess === true`. **Do not commit the throwaway script.**
- Inject a deliberately-broken example yaml (duplicate `validFrom`); confirm the same one-off script prints the human-readable error from `formatZodError` (no stack trace, no `ZodError` type name). Revert the yaml.

## Risks & deferrals

- **Issue [#42](https://github.com/xavierbriand/accounting/issues/42) (vitest config drift `.ts` vs `.js`).** Story 3.1 only edits the `.ts` config; the `.js` is left untouched. **Risk:** if vitest happens to load `.js` first, the quickpickle plugin won't register and acceptance scenarios will fail to run (silent test pass — *no* `.feature` files would be picked up). **Mitigation:** slice 2's commit body documents a verification step (locally delete `.js`, re-run, confirm green). If `.ts` is loaded, leave `.js` alone — issue #42 will close it. If `.js` is loaded, fold the deletion into slice 2 with a body line "closes #42 in passing" and re-run all of P1/P2/P3 against the deletion.
- **Issue [#17](https://github.com/xavierbriand/accounting/issues/17) (per-account currency consistency).** Tagged Story 3.4 candidate. Not blocked by 3.1. Re-evaluate in 3.4 planning.
- **PII-safety regression risk.** Existing tests assert errors don't echo `'Alex'` / `'Sam'` / `'Car'`. New partner-roster-drift error must follow suit (path index, not name). Slice 3 case (f) explicitly asserts `not.toContain('Alex')` and `not.toContain('Jordan')`.
- **Date-string contract.** `getSplitsAsOf` accepts only `YYYY-MM-DD`. Downstream Stories 3.2–3.5 will need a clear convention: do callers always normalise to date-only before calling? **Decision:** yes — date-only is the canonical input form for all Validity-Window queries in Epic 3. Documented inline in the service file and in the upcoming Story 3.2 plan.
- **No `validTo` field stored.** A future requirement to model "this rule sunset on a known date" (rare — partners more typically transition rules, not retire them) would require a schema change. Out of v1 scope. If it comes up, the half-open contract makes the migration trivial: a "sunset" window with the same partner roster but `ratio: 0` for every partner — or a dedicated sentinel; defer the design.
- **Acceptable green-on-landing in slice 7.** The TDD-by-intent invariant still holds: the step-defs *would* fail against a stripped-down schema or service. Documented in Sonnet's Deviations section.
- **Empty-refactor slice 8.** Only justifiable if the service is genuinely under 50 LOC with no duplication — verify, don't assume.
