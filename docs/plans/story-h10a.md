# Story h10a — single-source the rule system (specs): grep-driven walks, de-duplicated specs

Split from #162 (story-h10). This is the **specs half**; the drift-scan extension that
guards these specs is **h10b** (its own story, sequenced after this lands — fix the debt,
then add the ratchet). Split sanctioned by #162's own "Split risk" note.

## Context

Implements finding **F5** (+ **F9** spec fixes) of
[docs/learning/harness-health-check-2026-07-03.md](../learning/harness-health-check-2026-07-03.md).
15 of 24 § 8 rules are restated inside agent specs; both reviewers' rule walks are frozen at
"R1..R15" so R16/R20/R23/R24/R25/R26 are invisible to the agents chartered to enforce them.
§ 6.2 assigns reviews to Opus while both reviewers run `model: sonnet`; § 6.3 lists 6 return
sections where the spec mandates 7; code-reviewer.md:30 attributes a sentence to CLAUDE.md that
exists nowhere in canon; R9's criteria differ across its three statements; sibling-overlap has no
pinned model (inherits the expensive session model on a DoR-gating task).

**No FR coverage** — harness/process story (dev-loop tooling), not product code.

**Lane: Reduced** (R26). Trigger: touches `.claude/agents/*` and `.claude/commands/*` specs —
R26 classifies these as harness → Reduced, never Light. Phase 0 skipped; Phase 2 = `sibling-overlap`
only (plan-reviewer dropped); Phase 4 = `code-reviewer` + `sibling-overlap`.

### Maintenance sub-loop (§ 6.7) run 2026-07-04 pre-planning

- **Sibling work check.** `gh pr list --state open` → `[]` (no open PRs). Open issues scanned:
  #162 is this story's parent; **#154** (drift-scan Check C — glossary conformance) shares the
  *mechanism* (scanning added corpora) with h10b, not h10a — no overlap with the specs half.
  No other issue targets these spec files. sibling-overlap agent re-confirms at Phase 2.
- **Story-id uniqueness.** `git ls-tree -r origin/main … | grep -i story-h10` → no files. `story-h10a`
  is free on `origin/main` and in open PR branches. (Chose `h10a`/`h10b` per #162's split guidance.)
- **Working tree clean.** Fresh worktree `../accounting-h10a` on branch `story-h10a`, cut from
  `origin/main` @ `f5851a7`.
- **Open issues.** 30 open; `deferred-suggestion` items unrelated to this story's files.
- **Backlog refinement.** h9's `/refine-backlog` reset is a separate user-gated follow-up
  (tracked in memory `harness-roadmap-reset-2026-07`); not required for this sub-loop.
- **Open PRs.** None (no Dependabot/draft in flight).
- **`npm audit --audit-level=high`** → `found 0 vulnerabilities`.
- **Proceed-to-planning:** clear. No blockers.

## Story

> As the dev-loop maintainer, I want the rule system single-sourced — reviewer rule-walks
> driven by the live § 8 table instead of a frozen enumeration, and spec restatements replaced
> by tag citations — so that new rules (R16+) are actually enforced and the specs can't drift
> silently from canon.

## Domain model

**No model impact** — process/spec story; touches no Core domain concept (R24 satisfied by
declaration; maint/process stories qualify by default).

## Selected solution

Convert the two reviewers' rule-coverage walks from a hard-coded `R1..R15` enumeration to a
**row-driven walk** that reads the live § 8 table (`grep -n "| R" CLAUDE.md`), so the denominator
tracks canon automatically and the **R22 numbering hole** (no tombstone row — § 8 has 25 rows:
R1–R26 minus R22) is handled naturally by iterating rows, never a range. Remove verbatim rule
**restatements** in favor of tag citations into § 8 (keeping each agent's operational *how-to-check*
guidance), delete the **phantom quote**, **unify R9** to CLAUDE.md's canonical three criteria,
reconcile **§ 6.2 / § 6.3** to reality, fix sonnet-implementer's stale **§ 7 pointer** and
**un-trap** its four case-law blocks from the return-format code fence, and harden **sibling-overlap**
(pin `model:`, `--limit`, positive-case schema). Ride-along (≤20 LOC): refresh
`harness-engineering.md`'s four `R1–R19` references + a couple "closed by story-hX" Part-A one-liners.

Alternatives set aside:
- *Add the phantom sentence to § 8 as a real rule* — rejected: it's a review-agent operating
  instruction, not a retro-born process rule; de-attributing it is the honest fix.
- *Do the drift-scan guard (h10b) in the same PR* — rejected at planning per § 6.6 (see split note).
- *R16 4-commit collapse* — rejected: breadth (6 files, 5 distinct concerns) exceeds R16's
  2-substantive-commit affordance; R13 (Reduced-lane default envelope) gives honest one-concern slices.

## Production-code surface (R2)

**None.** No `src/`, `tests/`, or `harness/` code changes — this story edits only markdown specs
and process docs. Files touched:

- `.claude/agents/plan-reviewer.md`
- `.claude/agents/code-reviewer.md`
- `.claude/agents/sonnet-implementer.md`
- `.claude/agents/sibling-overlap.md`
- `.claude/commands/new-story-preflight.md`
- `CLAUDE.md` (§ 6.2, § 6.3)
- `docs/learning/harness-engineering.md` (ride-along)

## Gherkin acceptance scenarios

This is a zero-code story: acceptance is verified by **grep checks**, not test files (R5 zero-code
carve-out — the verification-step greps below are the evidence code-reviewer confirms at Phase 4).
Every scenario is a static check → R7 in-process/subprocess classification is **N/A** (no runtime).

**Scenario 1 — no enumerated rule-range survives in `.claude/`**
- Given the reviewer specs previously hard-coded `R1..R15`
- When I grep `grep -rnE 'R[0-9]+\.\.R[0-9]+' .claude/`
- Then it returns nothing
- `fails if` a spec still hard-codes an enumerated range in place of a row-driven § 8 walk
  (guards plan-reviewer.md:37/100/140, code-reviewer.md:121).

**Scenario 2 — rule-walk counter is denominator-driven, not `/ 15`**
- Given the counters said `Rule-tag applies: M / 15`
- When I grep `grep -rn '/ 15' .claude/agents/`
- Then it returns nothing, and both specs say `M / <§ 8 row count>`
- `fails if` a spec's counter hard-codes 15 (guards plan-reviewer.md:112, code-reviewer.md:133).

**Scenario 3 — phantom quote removed, not re-attributed to canon**
- Given code-reviewer.md:30 attributed "Missing scenarios are P1 blockers…" to CLAUDE.md
- When I grep `grep -rn 'Per CLAUDE.md' .claude/agents/code-reviewer.md` and
  `grep -rn 'Missing scenarios are P1 blockers' CLAUDE.md docs/`
- Then neither finds a false attribution (the sentence, if kept, reads as the agent's own instruction)
- `fails if` code-reviewer.md quotes a sentence as CLAUDE.md canon that isn't in canon.

**Scenario 4 — R9 criteria identical across all three statements**
- Given § 8 R9 says "≤5 LOC, single file, pre-specified"
- When I read the R9 mentions in plan-reviewer.md, code-reviewer.md, and CLAUDE.md § 8
- Then all three cite the same three criteria (specs cite the tag; no divergent 4th criterion)
- `fails if` a spec restates R9 with criteria that differ from § 8 (guards plan-reviewer.md:69,
  code-reviewer.md:59).

**Scenario 5 — § 6.3 lists all 7 return sections with the spec's actual titles**
- Given § 6.3 listed 6 sections with paraphrased titles
- When I read CLAUDE.md § 6.3 against sonnet-implementer.md § 4
- Then § 6.3 lists all 7: `What was built`, `Red → green sequence`, `Deviations from plan`,
  `Gherkin coverage checklist`, `Unknowns encountered`, `Proposed follow-ups`, `Files touched`
- `fails if` § 6.3's section list omits `Gherkin coverage checklist` or uses stale titles.

**Scenario 6 — sibling-overlap pins a model**
- Given sibling-overlap.md had no `model:` field (inherited the session model)
- When I read its frontmatter
- Then `model: sonnet` is present, its two `gh` calls carry `--limit`, and a positive-case
  output schema is defined
- `fails if` a DoR-gating listing agent inherits the most expensive session model (F9).

## Slice plan

**Envelope: R13** (Reduced-lane default — § 6 lanes table; 6–10 commits, one concern per slice).
R16's 4-commit collapse is declined (justified in "Selected solution"). No `test:` commits — a
zero-code spec story has no red→green rhythm; each slice is a `feat(agent):`/`chore(docs):` edit
verified by the Scenario greps. **Phase-3 authorship: Opus-authored** (canon-consistency prose
surgery is judgment work, not mechanical delegation — flagged as a tier decision for the retro).

| # | Commit | Files | Concern |
|---|--------|-------|---------|
| — | `chore(docs): story-h10a plan + Phase-2 review (story-h10a)` | this plan | prep (not counted) |
| 1 | `feat(agent): grep-driven rule walks — kill frozen R1..R15, handle R22 hole (story-h10a)` | plan-reviewer.md, code-reviewer.md | row-driven walk + `M / <row count>` counters |
| 2 | `feat(agent): de-dup rule restatements + unify R9 + drop phantom quote (story-h10a)` | plan-reviewer.md, code-reviewer.md | restatements → tag citations; R9 three-criteria; L30 fix |
| 3 | `feat(agent): un-trap case-law from sonnet-implementer return template + fix §7 pointer (story-h10a)` | sonnet-implementer.md | close § 4 fence around the clean template; §7→§5/§6/§7 |
| 4 | `feat(agent): harden sibling-overlap (model/--limit/positive schema) + reconcile preflight worktree (story-h10a)` | sibling-overlap.md, new-story-preflight.md | F9 sibling-overlap fixes; worktree convention |
| 5 | `chore(docs): reconcile CLAUDE.md §6.2 tiers + §6.3 return sections (story-h10a)` | CLAUDE.md | scan-tier vs judge-tier; 7 sections, actual titles |
| 6 | `chore(docs): ride-along — harness-engineering.md R1–R26 refs + Part-A closed-by notes (story-h10a)` | harness-engineering.md | four `R1–R19` refs; ≤20 LOC |
| 7 | `refactor(workflow): empty slice — zero-behaviour spec story, no code refactor (story-h10a)` | — | R11/R20 empty slot |
| 8 | `chore(retro): story-h10a Keep/Change/Try + status fragment (story-h10a)` | retro + status.d | Phase-5 |

## Risks & deferred items

| Risk | Mitigation |
|------|-----------|
| De-dup over-trims a spec's operational check, weakening the agent | Scope de-dup narrowly: replace only verbatim *rule-definition* restatements with tag citations; **keep** each sub-question's how-to-check guidance. Scenario greps confirm tags remain. |
| Un-trapping the sonnet-implementer fence accidentally changes the return-template text | Preserve the template verbatim; only relocate the four bold case-law blocks out of the fence. Diff-review the fenced block char-for-char. |
| h10b (scanner) later flags a spec line this story missed | h10a's Scenario 1–2 greps are the same patterns h10b will encode; passing them now means h10b lands green. Any miss surfaces as an h10b red test, not silent drift. |
| §6.2 rewrite mislabels an agent's tier | Enumerate every `.claude/agents/*.md` frontmatter `model:` field as the source of truth; list all six agents. |

No deferred-to-issue items anticipated; Phase-2 sibling-overlap findings tagged in the log below.

## Verification plan

DoD demonstrated by the Scenario greps (run from the worktree root) plus `npm run lint && npm run
build && npm test` (must stay green — no code changed, so this is a regression guard that the spec
edits didn't touch anything executable). Concretely:

1. `grep -rnE 'R[0-9]+\.\.R[0-9]+' .claude/` → empty (Scenario 1).
2. `grep -rn '/ 15' .claude/agents/` → empty (Scenario 2).
3. `grep -rn 'Per CLAUDE.md' .claude/agents/code-reviewer.md` → empty; phantom sentence absent from
   canon (Scenario 3).
4. R9 three-criteria identical in both specs + § 8 (Scenario 4, manual read).
5. § 6.3 lists 7 sections with actual titles (Scenario 5, manual read).
6. `grep -A5 '^---' .claude/agents/sibling-overlap.md | grep 'model:'` → `model: sonnet` (Scenario 6).
7. `npm run lint && npm run build && npm test` → green (nothing executable changed).

## Suggestion log

Filled at Phase 2 (Reduced lane → `sibling-overlap` only). Every row tagged
ADOPT / DEFER (issue) / REJECT (reason) / ACKNOWLEDGE.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | sibling-overlap: **#162 is the parent** — h10a implements #162 scope items 1/2/4; #162 must be re-scoped/closed to the remaining h10b half (drift-scan, item 3) when h10a lands. | ACKNOWLEDGE | Coordination, not a code change. On merge: comment on #162 noting h10a shipped the specs half; leave #162 open re-scoped to h10b. Captured in retro. |
| 2 | sibling-overlap: **#166** (post-Epic-4 thesis refresh) also rewrites `docs/learning/harness-engineering.md` (incl. its `R1–R19` refs). h10a does a ≤20 LOC ride-along on the same file. | ACKNOWLEDGE | No live conflict — #166 is gated post-Epic-4, no PR/branch. Future-rebase awareness only; whoever lands #166 expects h10a's ride-along already applied. No action now. |
| 3 | sibling-overlap: **#154** (drift-scan Check C) shares a *mechanism* with h10b, not h10a — correctly excluded (plan § Context). | ACKNOWLEDGE | No overlap with the specs half. Confirms the h10a/h10b split boundary. |
| 4 | **Phase 4 code-reviewer (P1):** the row-walk grep `grep -n "\| R" CLAUDE.md` is unanchored — matches 29 lines, not the 25 § 8 rows (hits `\| Real SQLite/FS` + inline `\| R13/R14/R16` lane cells), over-counting the denominator this story exists to fix. | **FIX-NOW** | Fixed in `2753287` — anchored to `^\| R[0-9]+ \|` (yields exactly 25) in both specs. |
| 5 | Phase 4 code-reviewer (P1): Scenario 3's verification grep `… CLAUDE.md docs/` also matches the plan file's own historical quote of the phantom sentence. | ACKNOWLEDGE | Plan-doc imprecision only; the shipped `code-reviewer.md` is clean (verified). Real check scopes out `docs/plans/`. Noted for retro; not worth churning the committed plan. |
| 6 | Phase 4 code-reviewer (P3): the story is Opus-authored with no Sonnet round — Phase 4 should not silently wave this through as normal. | ACKNOWLEDGE | Deliberate tier decision (plan § Slice plan); canon-consistency prose surgery has no red→green to delegate. Retro discusses whether spec stories need a lighter/explicit tier path. |
| 7 | Phase 4 code-reviewer (P3 soft): §6.2's new agent-tier list duplicates each agent's frontmatter `model:` field — could re-drift like the R1..R15 freeze did. | ACKNOWLEDGE → **feed h10b** | h10b's `.claude/` drift-scan could assert §6.2's tier list against each `.claude/agents/*.md` frontmatter. Captured in retro Try + h10b handoff. |
| 8 | Phase 4 code-reviewer (P3 soft): sibling-overlap's new severity-tagged table schema has no worked example row. | ACKNOWLEDGE | Column schema + the exact-string negative case are clear enough; a worked row adds length for marginal gain. No change. |
| 9 | Phase 4 dod-check (advisory): weight-ratio 1.54 (plan 195 LOC vs shipped 127 LOC). | ACKNOWLEDGE | Advisory, not a gate. Expected: a thorough plan for spec surgery outweighs the terse diff — same spec-only-Reduced signal h9 logged. Retro data point. |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — Reduced lane: `sibling-overlap` only): findings triaged above (3 rows, all ACKNOWLEDGE; no blocking overlap, no deferred-to-issue items).
- [ ] Draft PR with template sections 1–6 filled.
