# Story ddd-2 — Dev Harness as a second bounded context

## Context

The user has decided to treat the dev harness as a **second parallel core domain**, applying the DDD discipline the product domain received in story-ddd-1 (R24/R25): a user-owned ubiquitous language, an explicit strategic view, and mechanical enforcement of the language where it matters. Vocabulary is seeded from recent harness-engineering literature — Böckeler's guide/sensor × computational/inferential control taxonomy (martinfowler.com, Apr 2026) and Anthropic's Doer–Verifier pattern (Jun 2026) — with **operational definitions owned by this repo**; literature is cited as provenance only (anticorruption stance). The same research consensus holds that prose conventions don't reliably constrain agents, so the vocabulary ships **with a drift-scan check in the same PR**, mirroring the R25 pattern. No FR coverage — this is a harness-domain story (dev-loop quality), not a product story.

**Maintenance sub-loop run (2026-07-04, re-verified after story-h10a merged mid-planning):**

- [x] Sibling work check — no open PRs; open issues scanned; four related issues reconciled via Issue actions below (#162 → now story-h10b, #154, #100, #166).
- [x] Story-id uniqueness (R23) — `ddd-2` absent from `docs/plans/`, `docs/retrospectives/`, `docs/status.d/` on origin/main and from open PR branch names (h-series ends at h10a; h10b/h11 are issues only).
- [x] Working tree clean — branched `story-ddd-2` from e931041 (post-h10a main).
- [x] `npm audit --audit-level=high` — 0 vulnerabilities.
- [x] Backlog refinement — deferred; tracker reset ran with story-h9, next `/refine-backlog` due at next planning session.
- [x] Proceed-to-planning — yes; h10a touched agent-spec *bodies* and CLAUDE.md § 6.2 only; frontmatter shape unchanged, `harness/` untouched, R27 confirmed free (R22 is a numbering hole per #162).
- [x] **Second mid-planning refresh (Phase 2):** story-h10b (PR #173) merged to main during Phase 0 — drift-scan gained **Check D** (`runClaudeCheck`: `claude-range`/`claude-stale-tag`), the PostToolUse matcher now already covers `.claude/(agents|commands)/.*\.md`, and R21 was widened with a `*(hole)*` opt-out. Branch rebased onto 2205b11; the hook slice was dropped and the new check renamed **Check F** (C reserved for #154, E proposed by #172). See suggestion log.

## Lane (R26)

**Reduced** (user decision, 2026-07-04): touches `.claude/agents` and behavior-changing `harness/` code. Phase 2 review: `sibling-overlap` only. Phase 4: `code-reviewer` + `ddd-modeler` Mode B (a model note exists) in parallel. **Phase 0 is run voluntarily** — this story introduces the harness bounded context itself, the prototypical novel-harness-concept case; a CLAUDE.md § 6 nuance records the option for future stories.

## Story

> As the harness owner, I want the dev harness treated as its own bounded context — named language, classified controls, and enforced agent roles — so that harness design decisions are as deliberate as product ones and new controls can't be silently forgotten or mis-scoped.

## Domain model

Model note: [docs/domain/model-notes/story-ddd-2.md](../domain/model-notes/story-ddd-2.md) *(Phase 0 sign-off pending — this plan is not DoR-complete until the note's sign-off line is filled)*.

- **Terms added** (harness glossary, new file — full-expansion decision at Phase 0): harness, control, guide, sensor, computational, inferential, gate, doer, judge, advisor, roles, lane, envelope, drift, tripwire, braided control, disposition record, meta-control, authorization boundary, playbook, control inventory.
- **Invariants** (each carried by a drift-scan Check F test): every agent spec declares `role: doer|judge|advisor`; only doers carry file-mutation tools (`Write`, `Edit`, `NotebookEdit`, `MultiEdit`); every `.claude/agents/*.md` and `.claude/commands/*.md` file has a control-inventory row. Playbooks (`.claude/commands/`) carry no role — completeness check only.
- **Process invariant** (not machine-checkable): harness glossary and context map are user-owned; agents propose deltas only.
- **Events:** none — drift findings are check output, not domain events.
- Roles are **orthogonal to § 6.2 model tiers**: scan/execute vs judge/decide splits *who runs on what model*; doer/judge/advisor splits *what an agent may author*. Judges and advisors return findings/proposals, never dispositions — consistent with § 6.2's "all produce findings; none decide."

## Selected solution

Declare the Dev Harness a second bounded context alongside Shared Finances (context-map delta; relationship: **observed through an anti-corruption layer** — harness parsers consume product artifacts as *data*, never as *language*; "Separate Ways" was rejected at Phase 0 as a term-of-art violation). Seed `docs/harness/glossary.md` (user-owned) with ~21 operational definitions carrying literature provenance. Audit every existing control into `docs/harness/control-inventory.md` (agent-maintained; the enforced registry for file-based `.claude/` controls). Enforce the role model mechanically: `role:` frontmatter on all six agent specs + drift-scan **Check F** (three finding kinds: `missing-role`, `role-tools-violation`, `unlisted-control`) built on a new zero-dep frontmatter parser in `harness/lib/agent-spec.ts` — the shared foundation open siblings #172 (Check E, `model:` ↔ § 6.2) and #165 (`spec-version` key) should reuse. Letter F because implementation-order letters collided with standing reservations: main has A/B/D (h10b), C is reserved for #154, E is proposed by #172. Implementation reuses h10b's `runClaudeCheck` patterns (`.claude/` file enumeration, suppression-marker style) rather than building a parallel path. Update canon (context map, CLAUDE.md § 2/§ 5/§ 6/§ 8 R27) and both READMEs (root: two-domain intents; harness: didactic what/why/how).

Alternatives set aside:

- **Move `.claude/agents|commands` into `harness/`** — `.claude/` paths are Claude Code's discovery contract; moving unregisters them. The boundary is logical, not physical (the "forgetting" problem is solved by the `unlisted-control` sensor instead).
- **Single shared glossary** — bounded-context collision: "rule", "gate", "window" already mean different things per context.
- **Two-role doer|judge** — misdescribes propose-only agents (backlog-refiner).
- **Literature's "verifier" name** — collides with test-verification vocabulary; "judge" matches the author≠judge separation the enforcement targets.
- **Docs without enforcement** — the exact failure mode the harness-engineering literature warns about; rejected on thesis.

## Production-code surface (R2)

- `harness/lib/agent-spec.ts` **(new)** — exported: `parseAgentSpecFrontmatter(content: string): AgentSpecFrontmatter` (tolerant of absent optional keys), `AgentSpecFrontmatter` type (`name?`, `description?`, `model?`, `tools: string[]`, `role?`).
- `harness/drift-scan/lib/drift-parser.ts` — `DriftFinding` union **extended** with `{ kind: 'missing-role', file, detail }`, `{ kind: 'role-tools-violation', file, tool }`, `{ kind: 'unlisted-control', file }`; new pure check functions exported; `formatJsonReport` emits the new kinds (generic serialization — verify, extend if it special-cases).
- `harness/drift-scan/drift-scan.ts` — new `runAgentSpecCheck(repoRoot)` glued into `main()` alongside `runRuleCheck`/`runPlanCheck`/`runClaudeCheck` (h10b); `formatHumanReport` gains a "Check F — agent-spec role conformance" block. Missing `.claude/agents/` dir → `[]` (mirrors `getPlanFiles`).
- `.claude/agents/*.md` (6 files) — **new frontmatter key** `role:`: sonnet-implementer → `doer`; code-reviewer, plan-reviewer, sibling-overlap, ddd-modeler → `judge`; backlog-refiner → `advisor`. Additive; registry ignores unknown keys (smoke-tested before slice lands).
- `.claude/settings.json` — **no change needed**: h10b already extended the PostToolUse drift-scan matcher to `.claude/(agents|commands)/.*\.md` (verified on 2205b11).
- `.claude/agents/*.md` frontmatter is a **recurring convergence point**: three stories add keys/checks over the same six files (ddd-2 `role:`, #172 `model:` conformance, #165 `spec-version`). `parseAgentSpecFrontmatter` is the intended single reader for all of them.
- `harness/metrics/tests/_helpers/temp-git-repo.ts` *(removed)* — hoisted to `harness/lib/temp-git-repo.ts` **(new)**; import paths updated in metrics tests (dod-check tests use their own local `initTempRepo()`, not this helper — out of scope for the hoist).
- Docs (no code surface): `docs/harness/glossary.md` (new), `docs/harness/control-inventory.md` (new), `docs/domain/context-map.md` (delta), `docs/domain/model-notes/story-ddd-2.md` (new), CLAUDE.md § 2/§ 5/§ 6/§ 8, `README.md`, `harness/README.md`.

## Gherkin acceptance scenarios

**Scenario outline: non-conforming `.claude/` control blocks drift-scan.**
Given a repo whose `.claude/` contains `<defect>`, when `drift-scan` runs, then it exits 1 and the report names the offending file and `<kind>`.

| defect | kind |
| --- | --- |
| agent spec without `role:` | `missing-role` |
| agent spec with `role: reviewer` (invalid value) | `missing-role` |
| `role: judge` spec listing `Edit` in tools | `role-tools-violation` |
| agent or command file with no control-inventory row | `unlisted-control` |

*Fails if:* `runAgentSpecCheck` is never wired into `main()`; the parser silently skips malformed frontmatter; the tools invariant misses `NotebookEdit`/`MultiEdit`; the completeness diff ignores `.claude/commands/`. **Subprocess** (temp git repo via hoisted helper — R7: exercises the real CLI exit path).

**Scenario: real registry conforms.**
Given the six real agent specs with their assigned roles and the committed control inventory, when the exported Check F functions (`checkAgentSpecRoles` + `checkControlCompleteness` — the composition `runAgentSpecCheck` performs inside `main()`) run against this repo, then they return zero findings.

*Fails if:* the check false-positives on real specs (absent optional frontmatter keys trip the parser) or the inventory misses a real control file. **In-process** (R7: exported check functions composed against the live tree in `drift-scan.integration.test.ts`; the CLI wiring is covered by the outline's subprocess tests and by CI running drift-scan on this branch — `runAgentSpecCheck` itself is unexported, matching its unexported siblings).

## Slice plan

R13 envelope — 8 body commits + uncounted prep. **Ordering constraint:** glossary and inventory (slices 1–2) land before enforcement (slice 4) so the completeness check finds the inventory populated — drift-scan stays green on the repo at every commit where it's wired. *(A ninth hook slice was dropped at Phase 2: h10b already ships the `.claude/` matcher.)*

0. *(prep, before phase 3)* `chore(docs): story-ddd-2 plan + model note + P2 review`
1. `chore(docs): story-ddd-2 harness glossary — seed terms`
2. `chore(docs): story-ddd-2 control inventory + classification audit`
3. `test(harness): story-ddd-2 agent-spec role + completeness checks — failing`
4. `feat(harness): story-ddd-2 drift-scan Check F — minimal green`
5. `chore(docs): story-ddd-2 context map second context + CLAUDE.md deltas (R27)`
6. `chore(docs): story-ddd-2 READMEs — dual-domain intents + didactic harness README`
7. `refactor(harness): story-ddd-2 hoist temp-git-repo helper to harness/lib` *(or R11 empty if folded into 3)*
8. `chore(retro): story-ddd-2 retrospective + status.d fragment`

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| ddd-modeler one-spec/two-modes role tension (judge in Mode B, advisor in Mode A) | **Resolved at Phase 0 (2026-07-04):** `role: judge`, Mode-A exception recorded in the description field (frontmatter-adjacent); rationale: mislabeling toward judge fails safe. Revisit split when h10b single-sources spec structure |
| `formatJsonReport` may special-case kinds | Checked at slice 3 against post-h10b code (it now serializes `claude-*` kinds); extend generically if needed |
| Live agent registry reaction to new frontmatter key | Smoke-test one spec edit before slice 4 lands; additive keys expected ignored |
| Vocabulary drifts from a still-moving field | Provenance per glossary entry + preamble records seed date; renames are ordinary glossary deltas |
| Sibling story-h10b (#162) also extends drift-scan over `.claude/` | **Resolved at Phase 2:** h10b shipped first (PR #173); ddd-2 rebased onto it, dropped the redundant hook slice, renamed its check F, and reuses `runClaudeCheck` patterns |
| Tracker is moving fast (two siblings merged mid-planning) | Re-run `git fetch` + premise check before Phase 3 handoff and before every push (R18 already mandates the latter) |

Deferred follow-ups are created at Phase-2 tagging (each gets an issue): judge-Bash sandboxing candidate; inventory-gap findings from the audit.

**Issue actions** (comments at merge):

- [#154](https://github.com/xavierbriand/accounting/issues/154): letter reservation respected — ddd-2's check took F, leaving Check C for glossary conformance. **Proposal** (user to decide on the issue, not asserted as settled): extend #154's scope to cover `docs/harness/glossary.md` alongside the product glossary.
- [#172](https://github.com/xavierbriand/accounting/issues/172) (Check E, `model:` ↔ § 6.2): ddd-2 lands `harness/lib/agent-spec.ts` — build Check E on that parser rather than hand-rolling a second frontmatter reader.
- [#165](https://github.com/xavierbriand/accounting/issues/165) (`spec-version` headers): same convergence note — `parseAgentSpecFrontmatter` is the single reader for new agent-spec keys.
- [#100](https://github.com/xavierbriand/accounting/issues/100): curriculum module-6 glossary is teaching material — link to the operational `docs/harness/glossary.md` rather than duplicating.
- [#166](https://github.com/xavierbriand/accounting/issues/166): story-ddd-2 is primary evidence for the DDD-adoption chapter.

## Verification plan

1. `npm run typecheck:harness && npm run test:harness` — new unit + integration tests green.
2. `npx tsx harness/drift-scan/drift-scan.ts --all` → exit 0 on the branch (real registry conforms).
3. Negative smoke in worktree: strip `role:` from one spec → drift-scan exits 1 naming it → restore.
4. Hook smoke: whitespace-edit `.claude/agents/sibling-overlap.md` → PostToolUse drift-scan fires (R7 honesty: hook wiring is manually verified, not test-covered).
5. `npm run lint && npm run build && npm test` — product suite untouched, green.
6. `npm run dod:check` — story-id, envelope (9 body commits), TODO/TBD gates pass.
7. CI green on the draft PR (drift-scan + dod-check + both test suites).

## Suggestion log

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | story-h10b (PR #173) shipped mid-planning: hook matcher already covers `.claude/(agents\|commands)`, making the planned hook slice redundant | ADOPT | Hook slice dropped; envelope 9 → 8 body commits |
| 2 | Letter collision: main has Checks A/B/D; "Check C" is reserved for #154 (h10b closing comment); Check E proposed by #172 | ADOPT | New check named **Check F** throughout plan, model note, glossary |
| 3 | Branch based on pre-h10b main; premises ("only A/B exist", "registry ignores unknown keys" context) stale | ADOPT | Rebased onto 2205b11; implementer instructed to reuse `runClaudeCheck` patterns + re-verify `formatJsonReport` post-h10b |
| 4 | Planned #154 comment unilaterally rewrote that issue's scope ("now includes harness glossary") | ADOPT | Comment reworded as a proposal for the user to decide on #154 |
| 5 | #172 (Check E, `model:` ↔ § 6.2) absent from boundary notes despite parsing the same frontmatter; h10b shipped without the shared parser, mooting that forward-compat claim | ADOPT | #172 + #165 added to Issue actions; parser positioned as the single reader for agent-spec keys |
| 6 | #165 (`spec-version`) is a third convergence on the same six spec files | ADOPT | Convergence note added to Production-code surface |
| 7 | #100 / #166 / #163 / #164 boundaries hold as planned (curriculum link-not-duplicate; evidence-only; disjoint files; post-Epic-4 gates) | ACKNOWLEDGE | No plan change |

## DoR checklist

- [x] Phase 0 (Model): model note signed off (Xavier Briand, 2026-07-04) — voluntary for this Reduced-lane story (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — sibling-overlap; plan-reviewer dropped per R26 Reduced lane): 7 findings triaged above, no un-tagged rows, no deferred items requiring issues.
- [x] Draft PR with template sections 1–6 filled ([#174](https://github.com/xavierbriand/accounting/pull/174)).
