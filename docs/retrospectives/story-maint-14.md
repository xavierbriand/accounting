# Story story-maint-14 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/70  **Closed:** 2026-04-26

## Keep

- **Symmetric agent design with plan-reviewer.** The `code-reviewer` spec mirrors `plan-reviewer`'s 7-section layout (operating rules / P1 / P2 / P3 / return format / stop conditions / never). Same tier (Sonnet), same tools (Read/Glob/Grep/Bash), same scan-vs-judge separation. Symmetry pays off: cognitive load to author the second agent was ~half the first; future maintenance edits to one inform the other.
- **Phase-4-specific evidence section.** The agent's return format adds a "Phase-4-specific evidence" subsection enumerating the per-scenario Gherkin walk, per-test `fails if` walk, and per-test mechanism walk. This is the primary value over inline-Opus — Opus tends to scan in batch; the agent walks atom-by-atom and produces auditable evidence.
- **Soft-suggestion category.** Findings tagged `(soft)` are non-blocking observations (e.g., "could collapse via flatMap"); separating them from rule-violations keeps Opus's classification simpler. Mirrored from plan-reviewer.
- **R15 collapse extends to *another* agent-spec story.** Same shape (4 commits) as maint-13. After three process-refresh stories (maint-12, maint-13, maint-14) all landing in 4–5 commits via the R15 analogy, codifying the extension as R16 starts to look reasonable. Two data points wasn't enough; three is borderline. Track for future.

## Change

- **Dogfood target was thin.** PR #69 is itself an agent-spec story (markdown-only diff plus one 1-LOC architecture.md fix). Most rule-tags came back N/A — correctly, but the dogfood didn't stress-test the agent's full P1/P2/P3 walk. The mechanics work; the depth needs verification at Story 3.2 Phase 4 (real production-code diff + real tests + real Gherkin scenarios).
- **The `R9` carve-out interpretation in the agent's report is ambiguous for docs-only refactors.** PR #69's slice 3 (`refactor(docs): reconcile architecture.md valid_to`) is a 1-LOC docs change — formally meets the R9 carve-out criteria (≤ 5 LOC, single file, fix coordinates pre-specified by the dogfood). But R9 was originally framed for *code* refactors. The agent flagged this ambiguity (P3 finding R9 with caveat). Decision: R9 as written applies to code; docs-only inline reconciliations are a different category that doesn't need R9 invocation. **Try:** if a third docs-only inline reconciliation case lands, codify the distinction in CLAUDE.md § 6.1 phase 4.
- **Plan-vs-diff drift on slice 3 (PR #69) wasn't noted with an addendum.** When slice 3 was repurposed mid-implementation from "empty slot" to "drift fix," the plan was left as-is. The agent caught this as a soft observation. Going forward: when a slice's *content* changes during implementation (count stays the same), add a one-line addendum to the plan section so the divergence is auditable. This will land naturally if `plan-reviewer` is invoked at the start of future stories — it'll catch the divergence early.

## Try

- **First-real-story dogfood at Story 3.2 Phase 4.** This is the next opportunity to stress-test `code-reviewer` against a non-trivial diff (real production code, real tests, real Gherkin scenarios). Track the agent's findings vs the inline-Opus baseline; if ≥ 50% noise, refine the spec.
- **R16 codification candidate** if a fourth process-refresh story uses the R15-extension shape. Three data points (maint-12, maint-13, maint-14) is borderline; four would justify an R16 row in CLAUDE.md § 8 ("R16: Process-refresh / agent-spec subcase: collapse to 4-5 commits depending on whether docs-edits naturally split"). Defer until that fourth story exists.
- **Plan-addendum convention** when a slice's *content* changes mid-implementation. Either codify in CLAUDE.md § 6.1 phase 1 ("plan addendum if a slice repurposes mid-execution") or leave to the next plan-reviewer dogfood to catch and recommend.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** The CLAUDE.md § 6.1 phase 4 wiring update is consistent with the new agent file.
- [x] If yes, reconciled in this PR? N/A.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `code-reviewer` agent introduced | `.claude/agents/code-reviewer.md` | done (slice 2, commit `64c3451`) |
| CLAUDE.md § 6.1 phase 4 invocation reference | `CLAUDE.md` | done (slice 2, commit `64c3451`) |
| Dogfood against PR #69 diff | manual via general-purpose with inline spec | done (this retro documents the result) |
| First-real-story dogfood (Story 3.2 Phase 4) | Story 3.2 plan + retro | open (deferred to next feature story) |
| R9 docs-only inline-reconciliation distinction | future CLAUDE.md edit | open (third data point needed) |
| R16 codification (R15-extension to agent-spec) | future CLAUDE.md edit | open (fourth process-refresh story needed) |
| Plan-addendum convention for slice repurposing | future CLAUDE.md edit OR plan-reviewer catch | open (will surface naturally) |
