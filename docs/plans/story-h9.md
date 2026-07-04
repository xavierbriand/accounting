# Story h9 — backlog-refiner agent + /refine-backlog command (propose-only)

## Context

**Why:** Implements finding **F8** of [docs/learning/harness-health-check-2026-07-03.md](../learning/harness-health-check-2026-07-03.md) (issue [#161](https://github.com/xavierbriand/accounting/issues/161)). The GitHub tracker has stopped being the coordination layer: #94's umbrella checkboxes are stale (Modules 1/2/5 closed via #95/#96/#99 but unchecked), #97's acceptance was partially delivered by other stories with no write-back, #98/#111 tripwires are mis-armed (circular / pre-empted), #154–156 launched unlabeled, and the `deferred-suggestion` queue has had zero closures in 65+ days. There is no repeatable instrument to detect this decay. This story adds a **propose-only** refinement agent and a `/refine-backlog` command; the agent never mutates the tracker — it emits a report the user tags, and the main session executes only approved actions.

**Naming note:** issue #161 and the health-check doc use the older term "backlog-groomer" / "grooming report" / `/groom`. Per the user's 2026-07-04 decision we ship **`backlog-refiner`** / "Backlog refinement report" / **`/refine-backlog`** (the `-backlog` suffix disambiguates from story refinement). Historical docs are left as-is; only the new artifacts use the refinement vocabulary.

**Intended outcome:** a reusable `backlog-refiner` sub-agent + `/refine-backlog` command, plus a maintenance-sub-loop checklist line pointing at it. Acceptance: the **first Backlog refinement report independently surfaces at least the 9-item reset inventory** in the health-check appendix; the user tags the proposed actions and the main session executes the approved subset (the one-time tracker reset).

**Maintenance sub-loop (§ 6.7) run 2026-07-04 pre-planning:**
- **Sibling work check** — 0 open PRs. Open issues #160–166 are the sequential harness roadmap (h8 shipped; h10/h11/Epic-4 downstream); none refine the tracker. The issues the refiner *reads* (#94/#80/#97/#98/#111/#119/#131/#132/#147/#150/#154–156, deferred queue) are its subject matter, not competing work. No overlap.
- **Story-id uniqueness** — no `story-h9` file in `docs/plans/`, `docs/retrospectives/`, `docs/status.d/` on `origin/main`; no open PR branch for it. Free.
- **Working tree clean** — clean; branch `story-h9` based on `origin/main` @ `52e47a6` (story-maint-20, which removed the unauthenticated github MCP server — reinforcing this story's `gh`-CLI-only choice).
- **Open issues** — 33 open; the `deferred-suggestion` queue is exactly what the first run re-prioritises.
- **Open PRs** — none.
- **`npm audit --audit-level=high`** — 0 vulnerabilities.
- **Proceed-to-planning:** yes.

## Story

> As the harness maintainer, I want a propose-only backlog-refiner I can invoke via `/refine-backlog`, so that tracker decay (stale checkboxes, mis-armed tripwires, unlabeled items, a frozen deferral queue) is surfaced as a tagged action list I approve, instead of silently accumulating.

## Lane (R26)

**Reduced** (user decision, 2026-07-04): agents, commands, and skills are part of the harness → their stories use the Reduced lane, not Light. `.claude/agents/**`, `.claude/commands/**`, and skill specs are behaviour-changing harness artifacts. Reduced ⇒ Phase 0 skipped, Phase 2 = `sibling-overlap` (plan-reviewer dropped), Phase 4 = `code-reviewer` + `sibling-overlap`, envelope **R13** (6–10 commits), plan file here in `docs/plans/`.

This story **codifies that rule in CLAUDE.md** (DoD #10): the R26 lane table's Light row narrows to `docs/process/harness doc-only`, and the Reduced row's trigger names `.claude/agents,commands + skill specs`. Treated as a *clarification of existing R26 wording* → **no new R-tag** (honouring the issue's "rule-minting deferred with F1"). The § 8 R26 row one-liner is refreshed to match.

## Domain model

**No model impact** — no Core domain concept; harness/process tooling only (R24 skip).

## Selected solution

Three new/edited harness artifacts + the CLAUDE.md clarification. No TypeScript.

### 1. `.claude/agents/backlog-refiner.md` (new)
House style = `plan-reviewer` / `code-reviewer` (NOT `sibling-overlap`, whose F5/F9 failure modes — no output schema, MCP tools outside its declared grant, hardcoded repo coords — we deliberately avoid).
- **Frontmatter:** `name: backlog-refiner` · `description:` (propose-only; never mutates the tracker; returns a structured Backlog refinement report) · `model: sonnet` · `tools: Read, Glob, Grep, Bash`.
- **Tooling:** `gh` CLI read-only only (`gh issue list/view`, `gh pr list`), **bounded output** (`--json <fields> --limit N`) per h5 context-diet conventions; `gh` infers `owner/repo` from cwd (no hardcoded coordinates). No GitHub MCP (removed in maint-20; avoids the credential fragility + undeclared-grant smell).
- **Body sections** (mirroring the reviewer specs): Operating rules → six analysis passes → **Return format** (mandatory schema, per-section counters) → Stop conditions → Never.
- **Six report sections** (issue scope §2), each with counters + per-item evidence:
  1. aging/stale items (deferred-suggestion queue ages, zero-closure spans)
  2. label integrity (missing `deferred-suggestion`; fully unlabeled issues)
  3. umbrella/checkbox drift (parent-tracking issues whose checkboxes diverge from closed children)
  4. duplicate/superseded candidates (ideas half-absorbed elsewhere, with residue)
  5. tripwire re-validation (armed condition circular or already pre-empted)
  6. **proposed-actions table** — `action (close/label/comment/retitle/merge) · issue · rationale · evidence`, formatted for adopt/defer/reject tagging.
- **Never list:** never run `gh issue close/edit/comment/label/reopen` or any mutating `gh`/git; never `Write`/`Edit`; never cap findings; never echo PII.

### 2. `.claude/commands/refine-backlog.md` (new)
Format = existing commands (`WHEN_TO_USE:` opener, no frontmatter, numbered procedure):
1. Invoke `backlog-refiner` (until it registers post-restart, invoke `general-purpose` with the spec contents inline — the § 6.3 workaround).
2. Present the six-section report; focus on the **proposed-actions table**.
3. User tags each proposed action adopt / defer / reject.
4. **Main session** (not the agent) executes only the *adopted* mutations via `gh`; *deferred* → new issue; *rejected* → dropped. Echo what was executed.
5. State plainly: the agent is propose-only; every tracker write happens here, post-approval.

### 3. `docs/templates/maintenance-sub-loop.md` (+1 line)
Add a checklist line: run `/refine-backlog` (or review the latest Backlog refinement report) as part of the sub-loop — no new R-tag (issue scope §4).

**Alternatives set aside:** (a) reuse/extend `sibling-overlap` — rejected: different job (overlap-vs-a-plan vs whole-tracker health) and it carries the exact anti-patterns we avoid. (b) let the agent mutate the tracker — rejected: the issue mandates propose-only; the user owns tracker state, mirroring the "agents propose, user decides" discipline used for glossary/model files.

## Production-code surface (R2)

**None** (no `src/` change, no type/signature/format change). Files: `.claude/agents/backlog-refiner.md` (new), `.claude/commands/refine-backlog.md` (new), `docs/templates/maintenance-sub-loop.md` (+1 line), `CLAUDE.md` (R26 lane-table clarification + § 8 R26 row), `docs/plans/story-h9.md` (new, R1), `docs/retrospectives/story-h9.md` (Phase 5), `docs/status.d/` fragment. New agent file needs a session restart to register with the Agent tool (§ 6.3).

## Gherkin acceptance scenarios

Spec/prompt artifacts have no automated tests; the acceptance scenario is the first run, validated by inspection (in-process, via `general-purpose` + inline spec — R7 in-process classification).

```gherkin
Scenario: First backlog refinement run surfaces the reset inventory
  Given the backlog-refiner spec exists and the tracker is in its 2026-07-04 state
  When the refiner is invoked read-only against the live tracker
  Then the Backlog refinement report independently surfaces at least the 9-item
       reset inventory from the health-check appendix
  And the report proposes no mutation itself — only a tagged proposed-actions table
  # fails if: the agent spec omits a report section that would surface an inventory
  #           item, OR instructs a mutating gh call (guards the propose-only contract
  #           in .claude/agents/backlog-refiner.md and the six-section Return format).
```

## Slice plan (R13 — Reduced, target 6–10 commits)

Prep `chore(docs): plan + P2 review — story-h9` (this plan + suggestion log) is authored before Phase 3 and is **not** counted in the body slices.
1. `feat(agent): backlog-refiner spec — story-h9`
2. `feat(agent): /refine-backlog command — story-h9`
3. `chore(docs): maintenance-sub-loop /refine-backlog line — story-h9`
4. `docs(process): R26 lane table — .claude specs + skills → Reduced — story-h9`
5. `refactor: empty slot — TDD rhythm note (spec-only story, no code path) — story-h9` (R11/R20)
6. `chore(retro): story-h9 retrospective`

6 body slices meet R13's floor. A spec-only Reduced story is genuinely light on behaviours — note as a loop-metrics data point in the retro.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Refiner misses a reset-inventory item → acceptance fail | Verification checks all 9 explicitly against the appendix; iterate the spec if any is missed. |
| Agent tempted to mutate the tracker | Explicit Never list + propose-only framing; all `gh` writes live in `/refine-backlog` main-session step 4, user-gated. |
| GitHub MCP gone (maint-20) / creds stale | Spec uses `gh` CLI only, not MCP — sidesteps both. |
| New agent unregistered until restart | Verify via `general-purpose` + inline spec (§ 6.3); note restart in PR body. |

## Verification plan

1. `npm run lint && npm run build && npm test` green (no `src/` change, so unaffected — confirms nothing broke).
2. `npx tsx harness/drift-scan/drift-scan.ts` green (CLAUDE.md § 8 ↔ retro; plan ↔ source).
3. First backlog refinement run (via `general-purpose` + inline spec) surfaces ≥ the 9-item reset inventory; inspect against health-check appendix lines 118–126.
4. User tags the proposed-actions table; main session executes the approved subset (user-gated).

## Suggestion log

Filled at Phase 2 (`sibling-overlap` + CLAUDE.md cross-ref audit, 2026-07-04). Every row tagged ADOPT / DEFER (issue link) / REJECT (reason) / ACKNOWLEDGE.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | **#162 (h10) drift-scan glob** — h10 will add a Check globbing `.claude/agents/*.md` + `.claude/commands/*.md` for stale/enumerated rule-tag refs; h9's two new files fall inside it. | **ADOPT** | Design constraint: keep `backlog-refiner.md` and `refine-backlog.md` free of enumerated rule ranges (`R1..R15`) and stale R-tags so they're born clean under h10's scanner. The refiner grooms the tracker, not the rulebook — no R-tag walk needed. |
| 2 | **#161 vocabulary rename** — issue title/body use old `backlog-groomer`/`/groom`; shipped names differ. | **ADOPT** | Annotate/close #161 at merge with the shipped names; the plan's Naming note records the mapping. |
| 3 | **CLAUDE.md contention with h10** — both edit CLAUDE.md but different regions (h9: R26 table + § 8 R26 row; h10: § 6.2/6.3 prose). h10 is sequenced after h9. | **ACKNOWLEDGE** | Mechanical at worst; h10 (later) rebases onto h9 per § 6.4.1. No action. |
| 4 | **#154 (drift-scan Check C)** — glossary corpus, does not touch `.claude/` or CLAUDE.md § 8. | **ACKNOWLEDGE** | No overlap. |
| 5 | **`sibling-overlap.md` broken post-maint-20** — its spec calls the GitHub MCP tools removed in maint-20; ran here via a `gh`-CLI `general-purpose` substitute. | **ACKNOWLEDGE** | Out of scope; F9 already assigns the sibling-overlap fix (gh grant + model pin) to h10 (#162). New `backlog-refiner` deliberately uses `gh` CLI, sidestepping the same trap. |
| 6 | **Cross-ref audit (self, before R26 edit)** — walked every `§ 6.x` / R26 / lane citation. | **ACKNOWLEDGE** | Clean: only live R26 citation is CLAUDE.md itself; edit touches table cells + § 8 row, no renumbering. Drift-scan Check A safe (R26 retro citation via story-h8 unchanged). |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — `sibling-overlap` + CLAUDE.md cross-ref audit): findings triaged above (6 rows, 0 deferred → no follow-up issue).
- [ ] Draft PR with template sections 1–6 filled.
