# Story maint-13 — `plan-reviewer` sub-agent for Phase 2 critical review

## Context

Fourth story of the **Refactor epic** (Epic M-A). Closes the user-prioritised process backlog item from the senior-engineer review: introduce a pinned-spec sub-agent that carries the P1/P2/P3 critical review (CLAUDE.md § 6.1 phase 2). Currently, every story's Phase 2 is run inline by Opus — Opus loads the canon docs (PRD, epics, QA, engineering-standards, architecture, security-checklist) into context and walks the three passes against the plan. Three problems:

1. **Context cost.** Loading ~700 lines of canon for each Phase 2 inflates Opus's context budget per story.
2. **Comparability drift.** Inline review depends on which rules Opus pulls into focus that day. A pinned-spec sub-agent walks the same checklist every time.
3. **Mechanical vs judgment conflation.** Phase 2 has two parts: scanning for findings (mechanical — walk the checklist) and tagging them adopted/deferred/rejected (judgment). Currently both happen in one agent. Splitting the scan to a sub-agent and keeping the tagging with the parent matches the agent-tier policy in CLAUDE.md § 6.2.

Per [story-maint-12 retro](docs/retrospectives/story-maint-12.md) action item, this story is also the first dogfood of the new [maintenance-sub-loop template](docs/templates/maintenance-sub-loop.md).

**Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning** — copy-pasted from [docs/templates/maintenance-sub-loop.md](docs/templates/maintenance-sub-loop.md):

- [x] **Working tree clean.** `git status` clean post-PR-#68 merge; main rebased to `3d5d8c6`.
- [x] **Open issues.** `gh issue list --state open --limit 50` — 6 deferred-suggestions ([#23](https://github.com/xavierbriand/accounting/issues/23), [#34](https://github.com/xavierbriand/accounting/issues/34), [#43](https://github.com/xavierbriand/accounting/issues/43), [#51](https://github.com/xavierbriand/accounting/issues/51), [#57](https://github.com/xavierbriand/accounting/issues/57), [#59](https://github.com/xavierbriand/accounting/issues/59)). None block this story.
- [x] **Open PRs.** None (no Dependabot, no drafts).
- [x] **`npm audit --audit-level=high`** — zero vulnerabilities.
- [x] **Proceed-to-planning.**

**Template dogfood feedback (story-maint-12 Try):** the template copy-pasted cleanly. One minor friction — the template's "Open PRs" entry has 3-line indented sub-rules (Routine bumps / Major bumps / Minor patch) which expands the Context section. Acceptable trade-off (the rules are operationally needed inline). No template change required.

## Story

> As Opus running Phase 2 critical review on a fresh plan, I want a sub-agent that loads the canon docs, walks the P1/P2/P3 checklist, and returns a structured findings list — so that I keep my context budget for the judgment-call work (adopt/defer/reject + integration into the suggestion log) instead of spending it on the mechanical scan.

No FR coverage (workflow improvement). Walks [.claude/agents/sonnet-implementer.md](.claude/agents/sonnet-implementer.md) (existing-agent shape reference), [CLAUDE.md § 6.1 phase 2 + § 6.2 + § 8](CLAUDE.md), [docs/quality-assurance.md](docs/quality-assurance.md), [docs/engineering-standards.md](docs/engineering-standards.md), [docs/architecture.md](docs/architecture.md), [docs/security-checklist.md](docs/security-checklist.md).

## Selected solution

### 1. Agent spec — `.claude/agents/plan-reviewer.md`

**Frontmatter:**
```yaml
---
name: plan-reviewer
description: Walk a draft story plan through the P1/P2/P3 critical review (CLAUDE.md § 6.1 phase 2). Use when Opus has authored a plan and needs the consistency check before locking the suggestion log. Returns a structured findings list; does NOT tag adopt/defer/reject (Opus does that).
model: sonnet
tools: Read, Glob, Grep, Bash
---
```

**Body sections** (mirroring sonnet-implementer.md's layout):
- § 1. **Operating rules.** Read the plan; read the canon docs (PRD, epics, QA, engineering-standards, architecture, security-checklist, CLAUDE.md § 8 R-tags); walk each pass with concrete sub-questions (enumerated below). Do not propose code; do not tag findings; do not modify any file.
- § 2. **P1 — Functional pass.** Sub-questions:
  - Does the plan satisfy a target FR/NFR in [docs/prd.md](docs/prd.md)? Cite the FR number or "no FR coverage" with rationale.
  - Does the story match an entry in [docs/epics.md](docs/epics.md)? Cite the epic.
  - Are Gherkin scenarios (if any) complete and unambiguous? Each scenario must have a `fails if …` clause that names the production path it guards (R6).
  - For each Gherkin scenario, classify as in-process or subprocess. If subprocess (R7) and the plan touches `src/cli/program.ts`, confirm the test surface includes a subprocess-level integration test (R4).
  - If the plan introduces a new test framework / runtime tool / CLI library, confirm the tool-bundle import audit is performed (R3).
  - If the plan changes types / function signatures / output formats, confirm the "Production-code surface" section enumerates them (R2).
- § 3. **P2 — Product Quality / QA pass.** Walk [docs/quality-assurance.md](docs/quality-assurance.md):
  - Money / precision: any new monetary code paths? Allocations use Largest Remainder? Currency mismatches return Result.fail?
  - Privacy / PII: any new logs, error messages, test fixtures, JSON outputs? IBANs / names / bank IDs redacted? Test fixtures clean?
  - Coherence: any new behaviour contradict existing scenarios?
  - Mock-diversity (R8) for structured outputs: at least one assertion against a non-default fixture in any new `--json` / table / structured-output test?
- § 4. **P3 — Engineering pass.** Walk [docs/engineering-standards.md](docs/engineering-standards.md), [docs/architecture.md](docs/architecture.md), [docs/security-checklist.md](docs/security-checklist.md):
  - No `any`; explicit return types on exports; functions ≤ 50 LOC; no comments except non-obvious why.
  - Core layer: no Node APIs, no `better-sqlite3`, no `commander`, no `process.exit`. Constructor DI only. Result discipline (no throw in Core).
  - Append-only ledger: no UPDATE / DELETE.
  - Migrations idempotent.
  - Security checklist: walk every item.
  - Slice-plan health: 6–10 commits target (R13); adapter-story 5–7 (R14); major-bump-zero-code collapse 4 (R15).
- § 5. **Return format.** Mandatory structure (mirrors sonnet-implementer's § 4 strictness):
  ```
  ## P1 — Functional findings
  - [tag] [finding statement, with line/section reference into the plan]
  - ...

  ## P2 — Product Quality / QA findings
  - ...

  ## P3 — Engineering findings
  - ...

  ## Rule-tag coverage check
  - R1..R15 each ticked or marked N/A with rationale.

  ## Counters
  - P1 findings: N
  - P2 findings: N
  - P3 findings: N
  - Total: N
  ```
  Findings are stated as observations, NOT as verdicts. Examples: "P3: slice 7 bundles flag rename + deps shape change + getDb signature change + 6 test file updates" — not "P3: slice 7 is too big." Opus decides "too big" from context.
- § 6. **Stop conditions.** Report written; no other output. Do not edit any file.
- § 7. **Never.** Do not tag adopted/deferred/rejected. Do not write production code. Do not modify the plan. Do not call the harness's CLI tools other than the bare necessary `gh issue list` for context.

### 2. Wire into CLAUDE.md § 6.1 phase 2

Update phase 2 to reference the new agent:

> 2. **Critical review** (Opus, P1/P2/P3): invoke `plan-reviewer` sub-agent (`subagent_type: "plan-reviewer"`) with the plan path; consume the returned findings; tag each adopted/deferred/rejected in the suggestion log. Deferred → GitHub issue. *Exit (DoR):* no un-tagged suggestions, every deferred has an issue link.

That's a small wording delta from the current "(Opus, P1/P2/P3): tag every suggestion adopted/deferred/rejected." Adds the explicit invocation step; the sub-rules R-references stay where they are.

### 3. Dogfood test

Run `plan-reviewer` against an existing plan as a verification step. Best target: [docs/plans/story-maint-12.md](docs/plans/story-maint-12.md) — recently shipped, has known suggestion-log structure, lets us compare the agent's findings to the inline-Opus findings already on record.

Acceptance for the dogfood:
- The agent returns a structured report in the format defined by § 5 of the agent spec.
- The agent surfaces the 9 findings the inline-Opus pass produced (or close to it — same buckets, similar specificity).
- If the agent surfaces NEW findings the inline pass missed, document them in the retro and decide if any deserve issues / fixes.
- If the agent MISSES findings the inline pass had, refine the agent spec.

The dogfood is run as part of Phase 4 retro-check, not as a slice commit — its result feeds back into the agent spec if needed.

## Production-code surface

**None.** Story is agent-spec-only + a CLAUDE.md wiring update. Per CLAUDE.md § 6.7 R15 collapse (extends to agent-spec stories per [story-maint-12 retro](docs/retrospectives/story-maint-12.md) Keep), no behavioural code, no tests.

## Gherkin acceptance scenarios

**None.** Zero behaviour change in the product; the agent is a workflow tool. Verification surface:
- File `.claude/agents/plan-reviewer.md` exists with valid frontmatter.
- Sample invocation `Agent({ subagent_type: "plan-reviewer", prompt: "Review docs/plans/story-maint-12.md" })` returns a structured report matching the agent's § 5 format.
- CLAUDE.md § 6.1 phase 2 references the new agent.

## Slice plan

R15 collapse extended to agent-spec stories. Target **5 commits** (including this plan, retro, and empty-refactor slot — same shape as story-maint-12):

1. **`chore(docs): plan + P1/P2/P3 review (story-maint-13)`** — already authored; this slice is the commit Opus does pre-handoff.

2. **`feat(agent): add plan-reviewer sub-agent + wire into CLAUDE.md § 6.1 phase 2 (story-maint-13)`**
   - New file `.claude/agents/plan-reviewer.md` with frontmatter + 7-section spec.
   - Update CLAUDE.md § 6.1 phase 2 with the invocation reference.
   - Verify the file is syntactically valid Markdown + frontmatter.

3. **`refactor: empty slot — agent-spec PR (story-maint-13)`**
   - Per § 6.4 + R15 (extends to agent-spec stories per maint-12 retro). Body documents the no-op.

4. **`chore(retro): story-maint-13 retrospective + dogfood findings (story-maint-13)`**
   - Includes the dogfood test results: agent invoked against story-maint-12's plan; comparison with the inline-Opus findings on record; any agent-spec refinements identified.
   - If dogfood surfaces meaningful finding-deltas, file as either an in-PR fix (refine the agent spec, re-run) or as a follow-up issue.

**Why 4 (+ plan = 5) commits, not 6–10.** § 6.7 R15 collapse extends: zero behavioural code, no test/feat/refactor TDD rhythm. The `feat(agent):` commit IS the work; the empty refactor slot keeps the rhythm legible; the retro closes.

## Risks & deferred items

- **The agent spec might not converge in one PR.** Dogfood may reveal the spec is missing checklist items or producing too noisy / too sparse output. Mitigation: if dogfood reveals a meaningful gap, refine the spec in this PR (one extra `feat(agent):` commit); only file as follow-up if the refinement requires a structural rethink.
- **CLAUDE.md compression risk re-emerging.** The agent spec is ~150 lines (similar to sonnet-implementer's). The cheat-sheet wiring update in CLAUDE.md should stay one-line; the heavy spec lives in the agent file. Verify post-edit that CLAUDE.md is still ≤ 145 lines.
- **Phase 4 retro-check sub-agent (`code-reviewer`) deferred.** Phase 4 has the same shape as Phase 2 (walk a checklist). A `code-reviewer` sub-agent would symmetrise the workflow. Out of scope for this story to keep the diff focused; revisit if the inline-Opus Phase 4 starts hitting context budget.
- **Auto-invocation drift.** Future stories may forget to invoke `plan-reviewer` in Phase 2 and revert to inline-Opus. Mitigation: drift-scan retro item now catches CLAUDE.md vs docs/ contradictions; doesn't directly catch "did Opus call the new agent." Could add a "did Phase 2 invoke plan-reviewer?" line to the retrospective template's drift scan section. Defer to a future story unless the dogfood reveals immediate need.
- **Out of scope** for this story:
  - `code-reviewer` Phase 4 sub-agent.
  - Auto-invocation enforcement.
  - Adding rule-tag references to the agent's findings (the agent reports findings; Opus consumes). The agent SHOULD reference rule tags when relevant (e.g., "R4: composition-root subprocess test required, plan covers this") but doesn't pre-tag findings.

## Verification plan

1. `npm run lint && npm run build && npm test` — green (no production change; 292 tests).
2. `wc -l CLAUDE.md` — still ≤ 145 lines (target was 140; allow 5 for the phase 2 wiring delta).
3. File `.claude/agents/plan-reviewer.md` exists; frontmatter valid; ~150-200 LOC.
4. Manual dogfood test: invoke the agent against `docs/plans/story-maint-12.md`; compare with inline-Opus findings on record (PR #68 suggestion log section 7); document deltas in the retro.
5. Re-read CLAUDE.md § 6.1 phase 2 to confirm the wording is clear and the invocation reference is correct.

## Suggestion log

Phase 2 (P1 / P2 / P3) by Opus on 2026-04-26.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Should the agent ALSO walk Phase 4 (retro-check), or strictly Phase 2? | adopted (clarified) | Phase 2 only. Phase 4 has the same shape but operates against committed code, not a draft plan; bundling muddies the agent's purpose. Future `code-reviewer` agent is out of scope. |
| P1 | Should the agent tag adopted/deferred/rejected, or leave it to Opus? | adopted (clarified) | Strictly leave it to Opus. The agent reports findings as observations; Opus tags. Mechanical vs judgment split (CLAUDE.md § 6.2). |
| P1 | The agent's return format must be strict (mirroring sonnet-implementer.md § 4) so Opus can mechanically integrate. | adopted | § 5 of the agent spec defines the format. Counters at the bottom for visibility. |
| P2 | Should the agent need access to GitHub issues (`gh issue list`)? | adopted (lightly) | Yes — for cross-referencing deferred-suggestion follow-ups against the plan. `Bash` tool included for this and only this. |
| P2 | Privacy: the agent reads CLAUDE.md, plans, and canon docs — none have PII. | rejected | Not a privacy concern. |
| P2 | Will the agent invoke other tools (e.g., the harness's MCP servers)? | rejected | Tools restricted to Read/Glob/Grep/Bash. No MCP, no Web, no Edit. |
| P3 | Tool-bundle import audit (R3) for the agent itself? The agent is a markdown file; no `package.json` deps. | adopted (N/A) | Not applicable. The agent runs in the existing harness; no new dependencies introduced. |
| P3 | Frontmatter `model: sonnet` vs `model: opus`. | adopted (clarified) | `sonnet`. The walk-the-checklist work is mechanical; Opus stays as the parent making judgment calls. Same tier separation as sonnet-implementer. |
| P3 | Should the agent enforce a maximum number of findings to keep the report scannable? | rejected | No cap. The agent reports what it finds; Opus filters. A noisy agent is a sign of a bad spec, not a need for a cap. |
| P3 | The dogfood test against story-maint-12 — what counts as success? | adopted (clarified) | Success: agent surfaces ≥ 6 of the 9 findings the inline-Opus pass produced (≥ 67% recall) AND the format is stable. Misses are documented in the retro; spec refinement happens in this PR if needed. |

**Tally:** 5 adopted / 2 rejected / 0 deferred + 3 adopted-clarified. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 10 findings (8 adopted/clarified, 2 rejected, 0 deferred). Dogfood note: this Phase 2 was inline-Opus — the new agent doesn't exist yet to review its own birth plan.
- [ ] Draft PR with template sections 1–6 filled. **Next action.**
