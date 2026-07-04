# Retrospective — story-h10a (single-source the rule system: specs half)

Plan: [docs/plans/story-h10a.md](../plans/story-h10a.md) · PR [#171](https://github.com/xavierbriand/accounting/pull/171) · Issue #162 (F5 + F9)

The rule system violated single-source-of-truth (health-check F5/F9): 15 of 24 § 8 rules were restated inside agent specs, both reviewers' rule-coverage walks were frozen at a hard-coded `R1..R15` enumeration (so every rule added after that — the lane rules, the DDD rules, the status/preflight rules — was invisible to the agents chartered to enforce them), § 6.2 assigned reviews to Opus while every reviewer runs `model: sonnet`, § 6.3 listed six return sections where the spec mandates seven, code-reviewer quoted a sentence as CLAUDE.md canon that exists nowhere, and R9's criteria differed across its three statements. This story (the **specs half** of #162, split from the drift-scan guard **h10b** at planning per the issue's own note) converts both reviewer walks to a **row-driven** walk over the live § 8 table, de-duplicates, and reconciles the spec/canon divergences. Zero code; grep-verified (R5 zero-code carve-out).

## Loop metrics

- **Lane:** **Reduced**, self-selected — the second story to self-select (after h9) and the first to do so with the R26 classification already settled (h9 codified `.claude` specs → Reduced in the same PR it discovered the mistake). No lane override needed; the rule met reality correctly this time.
- **Commits:** prep + **6 body slices** (incl. the R11 empty-refactor slot) + **1 Phase-4 fix-now** + retro. Unlike h9 (which hugged R13's 6-commit floor and padded), h10a's breadth — six files, five distinct concerns — filled the R13 envelope honestly. **R16's 4-commit collapse was declined in the plan** and the decision held: R16 affords only two substantive change commits, and this story had five concerns that each deserved their own reviewable slice.
- **Weight:** dod-check advisory `weight-ratio 1.54` (plan 195 LOC vs shipped 127 LOC). Expected and benign: a thorough plan for prose surgery across canon outweighs the terse diff. Same spec-only-Reduced signal h9 logged — two data points now.
- **Tier:** **Opus-authored, no Sonnet round.** Canon-consistency prose surgery is judgment work with no red→green rhythm to hand off; flagged in the plan up front rather than discovered at review. code-reviewer correctly declined to wave this through silently (P3) — the honest treatment is to name it, which the plan did.
- **Phase 2:** `sibling-overlap` only (Reduced drops plan-reviewer). 3 findings, **all ACKNOWLEDGE** — #162 parent (re-scope to h10b on merge), #166 shares the ride-along file (gated post-Epic-4), #154 correctly excluded. No DEFER, no follow-up issue.
- **Phase 4:** `code-reviewer` + `sibling-overlap` in parallel. code-reviewer: **2 P1 / 0 P2 / 5 P3 (2 soft)** → **1 fix-now**, rest acknowledged. sibling-overlap: no change since Phase 2. Its own rule-tag walk ran **16 / 25** — live proof the row-driven mechanism works end to end.

## Keep

- **The review agent caught a defect in the exact mechanism the story shipped — dogfooding paid off immediately.** The whole point of h10a was denominator accuracy, yet the row-walk grep I wrote (`grep -n "| R" CLAUDE.md`) was unanchored and returned 29 lines, not the 25 real § 8 rows — it also matched `| Real SQLite/FS` in the Testing table and the inline `| R13/R14/R16` cells in the lanes table. code-reviewer executed the new grep *literally* against the live file and surfaced the over-count. A reviewer that only read the prose ("now it's row-driven, looks right") would have missed it. Executing the instruction, not just reading it, is what caught it. Fixed to `^\| R[0-9]+ \|` (anchored → exactly 25) in `2753287`.
- **The h9→h10 retro loop transferred correctly.** h9's Try flagged the dod-check Gherkin trap (a plan-declared `gherkin` `Scenario:` block with no backing `.feature` file hard-fails CI) and prescribed prose Given/When/Then instead. h10a wrote its acceptance as prose from the start and ran dod-check locally with `DOD_PR_BODY_FILE` before pushing — green on the first try. The lesson didn't have to be re-learned at CI. This is the retrospective mechanism doing its job.
- **Un-trapping over deleting.** The four case-law blocks were trapped inside sonnet-implementer's § 4 return-format code fence (their `**bold**` markdown couldn't even render). The fix moved them to a sibling § 4a prose section rather than cutting them — the case law is load-bearing (each traces to a retro finding), it was only mis-placed. De-dup means "cite once, in the right place," not "delete."

## Change

- **Absence-only acceptance checks miss correctness of the replacement.** Scenarios 1 and 2 asserted the *old* pattern was gone (`R1..R15` ranges, `/ 15` denominators) — and passed — but nothing asserted the *new* grep returns the right count. That gap is exactly where the P1 defect hid: old pattern absent ✓, new pattern wrong ✗. For a normalization/replacement story, an acceptance check must pin the new invariant's correct value (here: "the row-walk grep yields exactly 25"), not merely the old form's disappearance. **Lesson:** when you replace a mechanism, test the mechanism's output, not just the removal of its predecessor.
- **A verification command quoted in the plan can be self-tripping.** Scenario 3's grep (`… CLAUDE.md docs/`) also matches the plan file's own historical quote of the phantom sentence — so the literal command reports a false hit against `docs/plans/`. The intent held (the shipped spec is clean), but a verification step should scope out the plan/retro that narrates the very string it hunts. **Lesson:** when an acceptance grep targets a string the plan itself must mention, exclude `docs/plans/` and `docs/retrospectives/` in the command.

## Try

- **Feed h10b a §6.2-vs-frontmatter drift check.** §6.2's reconciled agent-tier list now restates each agent's `model:` field — a second copy that can re-drift the same way the `R1..R15` freeze did. h10b already scans `.claude/agents/*.md`; it could additionally assert that §6.2's tier list matches each agent's frontmatter `model:`. Single-sourcing the walk was half the job; single-sourcing the *tier map* is the natural next assertion. (Captured as an h10b handoff.)
- **Consider promoting the prose-acceptance escape into the plan template.** h9 and h10a both hit the spec-story-has-no-`.feature`-file situation and both hand-wrote prose acceptance to dodge the dod-check Gherkin gate. Two stories is a pattern. A one-line note in `docs/templates/plan-template.md` ("spec/process stories with no feature file: write acceptance as prose Given/When/Then + `fails if`, never a `gherkin` `Scenario:` fence") would stop the third story from rediscovering it. Candidate ride-along for h11.
- **h10b should assert numbering integrity, not just tag existence.** The § 8 table jumps R21 → R23 with no row between (the reason a range walk was unsafe and this story went row-driven). h9 already flagged this for the `.claude/` drift-scan; h10a confirms the need by making every walk row-driven. A scan that either asserts contiguous § 8 numbering or records the intended gap explicitly would make the hole visible rather than a silent trap.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Re-scope / annotate #162 to the remaining h10b half (drift-scan over `.claude/`) | at merge, user-gated | open |
| §6.2-tier-list-vs-frontmatter drift check + numbering-integrity assertion | [story-h10b] (drift-scan half of #162) | open |
| Absence-vs-correctness acceptance lesson; plan-grep scope-out of `docs/plans` | future spec stories (passive) | open |
| Prose-acceptance note in `docs/templates/plan-template.md` | future harness story (candidate: h11) | open |
