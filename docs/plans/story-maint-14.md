# Story maint-14 — `code-reviewer` sub-agent for Phase 4 post-implementation review

## Context

Fifth story of the **Refactor epic** (Epic M-A). User direction: introduce a sub-agent symmetric to `plan-reviewer` (story-maint-13) that carries the Phase 4 retro-check (CLAUDE.md § 6.1 phase 4) — walking P1/P2/P3 against the actual diff, plan, and tests after Sonnet implementation but before merge.

Currently Phase 4 is run inline by Opus. Same three problems as Phase 2 had pre-maint-13:

1. **Context cost.** Opus loads canon docs + plan + diff + tests for each Phase 4 review.
2. **Comparability drift.** Inline review depends on which sub-rules (R5/R6/R7/R8/R9) Opus pulls into focus. A pinned-spec sub-agent walks the same checklist every time.
3. **Mechanical-vs-judgment conflation.** Walking the checklist is mechanical; the refactor disposition (fix-now / defer-issue / no-action) is judgment.

Symmetric to `plan-reviewer`: the new `code-reviewer` agent (Sonnet model) reads the diff + plan + canon, walks the Phase-4-specific checklist, returns structured findings. Opus consumes findings, decides disposition (in-PR fix vs follow-up issue vs acknowledge-no-action), and either executes via the trivial-inline carve-out (R9) or delegates to Sonnet.

**Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning** — copy-pasted from [docs/templates/maintenance-sub-loop.md](docs/templates/maintenance-sub-loop.md):

- [x] **Working tree clean.** `git status` clean post-PR-#69 merge; main rebased to `bfc5be6`.
- [x] **Open issues.** 6 deferred-suggestions ([#23](https://github.com/xavierbriand/accounting/issues/23), [#34](https://github.com/xavierbriand/accounting/issues/34), [#43](https://github.com/xavierbriand/accounting/issues/43), [#51](https://github.com/xavierbriand/accounting/issues/51), [#57](https://github.com/xavierbriand/accounting/issues/57), [#59](https://github.com/xavierbriand/accounting/issues/59)). None block this story.
- [x] **Open PRs.** None.
- [x] **`npm audit --audit-level=high`** — zero vulnerabilities.
- [x] **Proceed-to-planning.**

## Story

> As Opus running Phase 4 retro-check on a freshly-implemented story, I want a sub-agent that loads the diff, plan, tests, and canon docs, walks the P1/P2/P3 retro-check (R5/R6/R7/R8/R9 Phase-4 sub-rules), and returns a structured findings list — so that I keep my context budget for the disposition decision (fix-now-trivial / fix-now-Sonnet / defer-issue / acknowledge) and the actual refactor execution.

No FR coverage (workflow improvement). Walks [.claude/agents/plan-reviewer.md](.claude/agents/plan-reviewer.md) (sibling-agent shape reference), [CLAUDE.md § 6.1 phase 4 + § 8](CLAUDE.md), [docs/engineering-standards.md](docs/engineering-standards.md), [docs/quality-assurance.md](docs/quality-assurance.md), [docs/architecture.md](docs/architecture.md), [docs/security-checklist.md](docs/security-checklist.md).

## Selected solution

### 1. Agent spec — `.claude/agents/code-reviewer.md`

**Frontmatter:**
```yaml
---
name: code-reviewer
description: Walk a freshly-implemented story through Phase 4 retro-check (CLAUDE.md § 6.1 phase 4) — P1/P2/P3 against the actual diff + plan + tests. Use after Sonnet returns a green implementation and before Opus produces the refactor plan. Returns a structured findings list; does NOT classify blocker/deferrable/no-action (Opus does that).
model: sonnet
tools: Read, Glob, Grep, Bash
---
```

**Body sections** (mirroring `plan-reviewer.md`'s 7-section layout):

- § 1. **Operating rules.** Inputs given in the prompt: PR number (or branch name) + plan path. Read the plan first; then the canon docs; then `gh pr diff <N>` (or `git diff main..HEAD`). Do not modify any file. Do not propose code changes inline — describe findings, not patches.
- § 2. **P1 — Functional retro-check.** Walks against the diff and tests:
  - **Gherkin-to-test mapping audit (R5).** For every Gherkin scenario in the plan, locate at least one corresponding test file/case in the diff. Report missing scenarios as P1 findings tagged R5.
  - **`fails if` honesty (R6).** For every new test in the diff, check the source for a `fails if …` comment. Confirm the comment names the production path it guards (i.e., not just "fails if the test breaks"). Examples in the spec.
  - **Test-mechanism honesty (R7).** For each test, classify as in-process (mocked deps, direct service call) or subprocess (`spawnCli`, `execFileSync`). Confirm the test's `fails if` claim does not exceed the chosen mechanism's reach. Specifically: in-process test cannot regress on wiring through `program.ts`; only a subprocess test can.
  - **Composition-root subprocess test required (R4).** Does the diff touch `src/cli/program.ts`? If yes, confirm at least one new or existing subprocess-tier integration test in the diff exercises the new wiring path.
  - **Production-code surface (R2).** Did the diff change any types, function signatures, or output formats (JSON shapes, table schemas)? If yes, was each enumerated in the plan's "Production-code surface" section? Mid-implementation surface-change discovery is a planning gap (R2 violation).
- § 3. **P2 — Product Quality / QA retro-check.** Walks against the diff + tests:
  - **Money / precision walk.** Any new monetary code? `+ - * /` on Money values? Largest Remainder allocations property-tested? Currency mismatch returns Result.fail?
  - **PII redaction in error messages and logs.** Any new error path that could leak IBANs / partner names / bank identifiers? Test fixtures clean of real PII?
  - **Mock-diversity check (R8).** For any new test asserting on structured output (JSON, table, machine-readable): does the test cover at least one non-default mock fixture? Spot-check: a `--json` test with `duplicates: [item]` (not just `duplicates: []`)?
  - **Append-only ledger.** Any UPDATE / DELETE introduced on ledger rows?
  - **Migration idempotency.** Any new migration? Re-runnable without error?
- § 4. **P3 — Engineering retro-check.** Walks against the diff:
  - **No `any` introduced.** Grep `any` in the diff; flag occurrences in production code.
  - **Strict types / explicit returns.** Exports have explicit return types?
  - **Function size.** Functions in the diff ≤ 50 LOC? Note any > 50 LOC; classify whether it's a P3 violation or naturally-coarse (router, action-callback).
  - **Core purity.** Code in `src/core/` free of Node APIs / `better-sqlite3` / `commander` / `process.exit`?
  - **Comments.** New comments in the diff fall in the "non-obvious why" category, not "what does this code do"?
  - **Trivial inline fix carve-out (R9).** Does the diff include any inline-Opus-executed refactor? If yes, confirm the carve-out criteria are met (≤ 5 LOC, single file, fix coordinates pre-specified, no design question).
  - **Empty refactor (R11).** If the diff includes an empty refactor commit, does the commit body have a justification (the canonical pattern from CLAUDE.md § 6.4)?
  - **Commit subject health (R12).** Diff's commit subjects summary-verb form, not enumeration?
  - **Slice-plan execution match.** Does the diff's commit sequence match the plan's slice plan? Note any slices that landed differently (bundled, split, reordered).
  - **Security checklist walk.** Specific items from `docs/security-checklist.md`: input validation, error message redaction, file system safety (path traversal, symlink), DB access patterns, secrets in logs.
- § 5. **Return format.** Same structure as `plan-reviewer` § 5 — P1/P2/P3 findings sections, rule-tag coverage check (R1..R15), counters. Each finding cites the diff line/file, NOT just the plan section. Include a "Phase-4-specific evidence" subsection for R5/R6/R7/R8 — list every Gherkin scenario walked, classified as covered/uncovered.
- § 6. **Stop conditions.** Report written; no file modified; no follow-up action.
- § 7. **Never.** Don't classify findings as blocker/deferrable/no-action. Don't write production code. Don't propose patches inline (just findings). Don't file issues. Don't modify the plan.

### 2. Wire into CLAUDE.md § 6.1 phase 4

Update phase 4 to reference the new agent, mirroring the phase-2 invocation reference added in maint-13:

> 4. **Code review + refactor** (Opus): invoke `code-reviewer` sub-agent (`subagent_type: "code-reviewer"`) with the PR number and plan path; consume the returned findings; classify each fix-now / defer-issue / acknowledge. Sub-rules (see § 8): R5 / R6 / R7 / R8 / R9. *Exit:* refactor merged, CI green.

One-line edit to CLAUDE.md § 6.1 phase 4. Total file size should stay ≤ 145 lines.

### 3. Dogfood test

Run `code-reviewer` against PR #69 (story-maint-13) — the most recently-merged PR. Compare findings to the inline-Opus Phase 4 retro-check on record (PR #69 sections 7 + 8 — though that PR's inline Phase 4 was lighter than usual because the dogfood for `plan-reviewer` consumed the review attention).

Acceptance for the dogfood:
- The agent returns a structured report in the format defined by § 5 of the agent spec.
- The agent surfaces the findings the inline-Opus pass produced (or close to it — same buckets, similar specificity).
- If the agent surfaces NEW findings the inline pass missed, document them in the retro and decide if any deserve in-PR fixes / follow-up issues.
- If the agent MISSES findings the inline pass had, refine the agent spec.

Per the maint-13 dogfood pattern: invoke via general-purpose-with-spec-inline (custom agents need session restart to register; documented in CLAUDE.md § 6.3 by maint-13).

## Production-code surface

**None.** Story is agent-spec + a CLAUDE.md wiring update. R15 collapse applies (extends to agent-spec stories per maint-12/13 retros).

## Gherkin acceptance scenarios

**None.** Verification surface is the dogfood test (run agent against PR #69 diff; compare with inline-Opus Phase 4 on record).

## Slice plan

R15 collapse extended to agent-spec stories. Target **4 commits** (matches maint-13 shape):

1. **`chore(docs): plan + P1/P2/P3 review (story-maint-14)`** — already authored.
2. **`feat(agent): add code-reviewer sub-agent + wire CLAUDE.md § 6.1 phase 4 (story-maint-14)`**
   - New file `.claude/agents/code-reviewer.md` (~150-180 LOC; mirrors `plan-reviewer.md` shape with Phase-4-specific checklists).
   - Update CLAUDE.md § 6.1 phase 4 with the invocation reference.
   - Verify CLAUDE.md ≤ 145 lines.
3. **`refactor: empty slot — agent-spec PR (story-maint-14)`**
   - Per § 6.4 + R15. Empty-with-justification body unless dogfood surfaces drift to fix.
4. **`chore(retro): retrospective + dogfood findings (story-maint-14)`**
   - Includes dogfood result against PR #69; CLAUDE.md edits if any retro-rule emerges; absorb any drift the dogfood reveals.

**Why 4 commits.** Same R15-extension justification as maint-13: zero behavioural code, no test/feat/refactor TDD rhythm. Empty refactor slot kept for rhythm legibility unless real cleanup emerges (as happened in maint-13's slice 3, which became the architecture.md drift fix).

## Risks & deferred items

- **The agent spec might over-count findings** the same way `plan-reviewer` did (26 vs 9 on its dogfood). Phase 4 has more sub-rules to walk per scenario, so noise risk is higher. Mitigation: keep the rule-tag coverage check as N/A bullets (verbose but legitimate); refine spec only if first real-story Phase 4 use shows >50% noise.
- **The agent spec might miss the kind of subtle finding** Opus catches via context (e.g., "this refactor would be cleaner with combinator X"). Soft suggestions like "Result combinator opportunities" exist in `plan-reviewer.md` § 4; mirror the pattern here for Phase 4 (e.g., "Could this 30-LOC duplicated block be extracted?").
- **Custom-agent registration requires session restart** (codified in CLAUDE.md § 6.3 by maint-13). Dogfood test uses general-purpose-with-inline-spec.
- **The dogfood target (PR #69) is itself an agent-spec story.** PR #69's diff is mostly markdown — light Phase 4 retro-check surface. The dogfood will validate the agent's mechanics but not stress its full P1/P2/P3 walk capacity. Real test will come at Story 3.2 Phase 4. Note this caveat in the retro.
- **Out of scope:**
  - Bundling Phase 2 + Phase 4 into one agent. Tried and rejected in maint-13's plan: same checklist shape but operating against different inputs (draft plan vs committed code) — bundling muddies the agent's purpose.
  - Auto-invocation enforcement. As with `plan-reviewer`, the new drift-scan retro item catches CLAUDE.md ↔ docs/ contradictions but doesn't directly catch "did Opus call the new agent." Live with it.

## Verification plan

1. `npm run lint && npm run build && npm test` — green (no production change; 292 tests).
2. `wc -l CLAUDE.md` — still ≤ 145 lines (target was 140; allow 5 for the phase 4 wiring delta).
3. File `.claude/agents/code-reviewer.md` exists; frontmatter valid; ~150-180 LOC.
4. Manual dogfood test: invoke the agent (via general-purpose with inline spec) against PR #69 diff; compare with inline-Opus Phase 4 findings on record.
5. Re-read CLAUDE.md § 6.1 phase 4 to confirm the wording is clear and the invocation reference is correct.

## Suggestion log

Phase 2 (P1 / P2 / P3) by Opus on 2026-04-26 — inline-Opus only (custom agents need session restart; `plan-reviewer` not yet registered in this session).

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Same agent for Phase 2 + Phase 4? | rejected | Different inputs (plan vs code). Bundling muddies purpose. Tier-separate agents already established (sonnet-implementer / plan-reviewer / code-reviewer). |
| P1 | Should the agent classify findings as blocker/deferrable? | rejected | Strictly Opus's call. Agent reports findings with rule-tag references; Opus translates R-tag to disposition. Same separation as plan-reviewer. |
| P1 | Strict return format mirroring plan-reviewer. | adopted | § 5 of spec defines structure with one Phase-4-specific addition: "Phase-4-specific evidence" subsection enumerating Gherkin scenario coverage walk. |
| P2 | Privacy: agent reads PR diffs which may contain PII. | adopted (lightly) | Internal repo with no real PII (template names, fictional vendors). Note in agent spec: "do not echo PII in findings; cite line numbers, not row contents." |
| P2 | `gh pr diff` access? | adopted | Yes; Bash tool included for `gh` and `git diff`. |
| P2 | Should the agent run linter/test commands? | rejected | Out of scope. The CI already runs them. The agent reads results, doesn't re-run. |
| P3 | Tool-bundle audit (R3) for the agent? | adopted (N/A) | No new deps; markdown file only. |
| P3 | Model: sonnet vs opus. | adopted (clarified) | Sonnet. Same tier match as plan-reviewer / sonnet-implementer. |
| P3 | Soft-suggestion category (e.g., "Could this be extracted to a combinator?"). | adopted | § 4 of spec includes a "Soft suggestions" sub-section with examples. Marked clearly as non-blocking. |
| P3 | Dogfood success criteria. | adopted (clarified) | ≥ 67% recall on inline-Opus findings; format stable; refine spec in this PR if needed. Caveat: PR #69 is light surface (markdown-only diff); first real stress test is Story 3.2 Phase 4. |

**Tally:** 6 adopted / 2 rejected / 0 deferred + 2 adopted-clarified. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 10 findings (8 adopted/clarified, 2 rejected, 0 deferred). Inline-Opus pass; `plan-reviewer` not yet registered in this session per CLAUDE.md § 6.3 session-restart note.
- [ ] Draft PR with template sections 1–6 filled. **Next action.**
