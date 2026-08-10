# Story maint-34 — Move the CLAUDE.md conflict-resolution protocol into an on-demand command

## Context

Originated from a `/doctor` health-check run (harness maintenance, not a PRD-driven story). The
doctor skill's Check 4 (migrate always-loaded content to lazy loading) found that CLAUDE.md's
Conflict-resolution protocol (§ 6.4.1, ~9 lines / ~1.5k chars) is a detailed three-section
template only relevant during an actual rebase conflict, yet was loaded into every session's
context regardless. The user approved the migration at the doctor report's confirmation gate; this
story formalizes that already-applied change into the standard commit/PR/retro shape.

**No model impact** — pure harness/docs reorganization, no Core domain concept touched (R24
default for maint/process stories).

**Renumbered from story-maint-32 (Phase-4 finding).** This story originally planned and opened as
`story-maint-32` (PR #263). The Phase-4 `sibling-overlap` re-check found that PR #247 — itself
originally misnumbered `story-maint-30`, colliding with the already-merged #250 (a separate,
earlier-flagged issue) — had been renumbered by a concurrent session to `story-maint-32` and
merged to `main` while this story was mid-flight, landing `docs/retrospectives/story-maint-32.md`
+ `docs/status.d/2026-07-21-story-maint-32.md` for a wholly unrelated change (plan-template +
security-checklist doc hygiene). A fresh R23 scan at renumbering time also found `story-maint-33`
already claimed by another concurrent in-flight PR title (dev-dependencies bump). `story-maint-34`
confirmed free against `origin/main`'s `docs/plans/`/`docs/retrospectives/`/`docs/status.d/` trees
and every open PR title at renumbering time. See the retrospective for the full account.

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run, 2026-08-10.**

- **Sibling work:** one open draft PR touches harness-adjacent surface (#255, story-maint-31,
  `program.ts` wrapper extraction) — no file overlap with `CLAUDE.md`/`.claude/commands/`.
  Dependabot PRs #257/#259/#260 (dep bumps) — `package.json`/`package-lock.json` only, no overlap.
  #248 (story-5.0 epic intent refresh) — `docs/epics.md`/domain docs, no overlap. #247 (see
  renumbering note above) — different files, no overlap with this story's actual surface. Full
  sibling-overlap agent runs (Phase 2 and Phase 4) recorded in the Suggestion log below.
- **Story-id uniqueness (R23):** re-checked at renumbering time — see renumbering note above.
- **Open issues:** reviewed the full open list (50 issues). Nothing else stale enough to act on in
  this story beyond the drain item below.
- **`npm audit --audit-level=high`:** 4 high-severity transitive findings (brace-expansion,
  js-yaml, nanoid, postcss) — already tracked in [#262](https://github.com/xavierbriand/accounting/issues/262)
  (bug, umbrella) and [#261](https://github.com/xavierbriand/accounting/issues/261)
  (deferred-suggestion, postcss-specific, fix available via `npm audit fix`). Pre-existing,
  unrelated to this story's surface (`CLAUDE.md` + `.claude/commands/` only) — not fixed here;
  re-confirmed both issues are still open and accurately describe current `npm audit` output.
- **Drain:** re-justifying [#239](https://github.com/xavierbriand/accounting/issues/239)
  (dod-check's R16 envelope `min4/max4` cannot fit the canonical R16 commit shape, since the tool
  excludes `chore(retro)` from the count while CLAUDE.md § 8's R16 text includes it). This story's
  own commit sequence below reproduces exactly the gap the issue describes — fresh corroboration
  that it's still live. Not fixed here (a tool-logic fix belongs in its own harness story, per the
  issue's own "pick one in a harness story" framing); the envelope token is left **undeclared** in
  the Slice plan below, matching the maint-27/h14 precedent the issue documents. The Phase-4
  `code-reviewer` run additionally surfaced a second, previously-unfiled tooling-conformance gap in
  the same family (R30's prep-commit-subject regex vs. established precedent's phrasing) — see
  Suggestion log.
- **Backlog refinement:** skipped — not required every sub-loop (checklist item is optional); no
  signal this session that the tracker needs a deeper pass beyond the open-issues skim above.
- **Proceed-to-planning.**

## Selected solution

**Option A — new `.claude/commands/rebase-conflict-protocol.md`; CLAUDE.md keeps only the short
"do not auto-resolve" pointer.** Chosen. Matches this repo's existing convention for lightweight
commands (`.claude/commands/*.md`, no YAML frontmatter, opening `WHEN_TO_USE:` line — confirmed
against `model-session.md`/`story-status.md`) rather than the generic `.claude/skills/<name>/SKILL.md`
layout a generic checklist would default to. The one safety-critical prohibition ("do not
auto-resolve") stays resident in CLAUDE.md § 6.4.1; only the multi-section template — needed in
maybe one session in twenty — loads on demand. The command is also registered in
`docs/harness/control-inventory.md`'s Commands table (R27 — mechanically enforced by drift-scan
Check F; caught by the Phase-4 `code-reviewer` run, folded into this story rather than filed
separately since it's a direct consequence of this story's own new file).

**Option B — leave CLAUDE.md as-is.** Rejected. The protocol was resident in every session's
context regardless of whether a conflict ever occurs in that session — est. ~375 tokens/session
paid for content that's rarely relevant.

**Option C — shrink the protocol's prose in place instead of relocating it.** Rejected. The
three-section structure (diagnosis / suggested resolutions / recommendation+question) plus the
`docs/status.d/` special case is the valuable part; cutting words would degrade the protocol
itself rather than just its loading cost.

## Production-code surface (R2)

None. No `src/` types, signatures, or output formats touched — pure harness-doc reorganization.

## Verification (pseudo-Gherkin, not automatable)

No `.feature` files — this is a docs/harness-config change with no CLI-observable behavior
change, same shape as story-maint-27/h14. Fenced as ` ```text ` rather than ` ```gherkin `
deliberately, per [issue #198](https://github.com/xavierbriand/accounting/issues/198)
(drift-scan's Gherkin↔step hard gate treats any ` ```gherkin ` block as scenarios needing real
`.feature`/step-definition backing).

```text
Feature: Conflict-resolution protocol loads on demand instead of always

  Scenario: CLAUDE.md keeps only the short pointer
    Given CLAUDE.md § 6.4.1 previously inlined the full 3-section conflict-resolution template
    When the migration lands
    Then CLAUDE.md line ~126 references the `rebase-conflict-protocol` command
    And the "#### Conflict-resolution protocol" heading no longer appears in CLAUDE.md

  Scenario: the relocated command carries the protocol verbatim
    Given the original template covered diagnosis / suggested-resolutions /
      recommendation+question, plus the docs/status.d/ special case
    When .claude/commands/rebase-conflict-protocol.md is created
    Then its body matches the removed CLAUDE.md section's substance exactly
    And it opens with a WHEN_TO_USE line, matching this repo's other command files
      (no YAML frontmatter)

  Scenario: the new command registers with the harness AND the control inventory
    Given a new file exists at .claude/commands/rebase-conflict-protocol.md
    When a Claude Code session starts in this repo
    Then `rebase-conflict-protocol` appears in the available-skills listing
    And docs/harness/control-inventory.md's Commands table lists it (R27, drift-scan Check F)
```

| Scenario | Verification mechanism (not a new test file) |
| --- | --- |
| 1 — CLAUDE.md trimmed | `git diff CLAUDE.md` |
| 2 — command carries protocol verbatim | `git diff` on the new file vs. the block quoted in the originating doctor report; independently re-verified byte-identical (whitespace-normalized) by the Phase-4 `code-reviewer` run |
| 3 — command registers (harness + inventory) | Skill listing: observed live in-session immediately after the file was written. Control inventory: `npx tsx harness/drift-scan/drift-scan.ts` Check F, and CI's "Run Harness Tests" step (`drift-scan.integration.test.ts`) |

## Slice plan — R16 zero-behaviour-change collapse

Per CLAUDE.md § 8 R16, a zero-behaviour-change harness/docs story collapses to 4 change-body
commits. Per issue #239 (open, re-justified above), the envelope token is left **undeclared**:
dod-check's counter excludes `chore(retro)` from the R16 count, so declaring `R16` here would
produce a spurious "under target" advisory finding for a story that's actually shaped correctly.

1. `chore(docs): story-maint-34 plan + P1/P2/P3 review (story-maint-34)` — this plan doc. *(prep commit, uncounted per R30; canonical subject form per CLAUDE.md § 6.4 — see Suggestion log for why this differs from the original `story-maint-32` commit's phrasing)*
2. `feat(harness): add rebase-conflict-protocol command (story-maint-34)` — new `.claude/commands/rebase-conflict-protocol.md`, plus its `docs/harness/control-inventory.md` registration (R27).
3. `docs: point CLAUDE.md push protocol at rebase-conflict-protocol command (story-maint-34)` — CLAUDE.md § 6.4.1 edit.
4. `refactor: empty slot — nothing further to extract (story-maint-34)` — no-op; the relocation is already minimal (one file moved + registered, one pointer line changed).
5. `chore(retro): story-maint-34 retrospective (story-maint-34)`.

**Phase 3 (Implement) already happened** during the originating `/doctor` run, user-approved at
its confirmation gate — same "probe/change collapses into Phase 1" precedent as
story-maint-05/06/21/22/27. No Sonnet invocation.

Squash on merge optional.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| A future session hits a rebase conflict and doesn't know to load the new command | The CLAUDE.md pointer at § 6.4.1 names the command explicitly ("run the `rebase-conflict-protocol` command and follow it exactly"), same reliability as any other command reference already in CLAUDE.md (e.g. `model-session`) |
| R23's story-id uniqueness check has a real gap under high concurrency (this story hit it twice-removed, via #247's collision then its own renumbering racing #260/#263) | Not fixed here — a process-level fix (e.g., a claim-reservation mechanism) belongs in its own harness story. Flagged in the retrospective's Try section. |

No new deferred-suggestion issues opened by this story.

## Verification plan

`git diff` review of both files against the doctor report's quoted blocks; confirm the new command
appears in the skill listing and the control inventory; `npx tsx harness/drift-scan/drift-scan.ts`
clean; no test suite run required beyond CI's standard `npm test` (R2: no production-code surface
changed).

## Suggestion log

Phase 2 review is **Reduced lane** (`.claude/commands/` touched — CLAUDE.md § 6 lane table, R26):
`sibling-overlap` only, `plan-reviewer` dropped. Phase 4 adds `code-reviewer` + a second
`sibling-overlap` pass per the lane table.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 (P2, sibling-overlap) | Checked all 5 open PRs (#260, #259, #257, #255, #251) and all 46 open issues — none touch `CLAUDE.md` or `.claude/commands/`; none propose this extraction or overlap with the push-protocol/conflict-resolution surface. | acknowledge | No action needed — confirms the plan's own sibling-work check above. |
| 2 (P1, code-reviewer) | New `.claude/commands/rebase-conflict-protocol.md` was not registered in `docs/harness/control-inventory.md`'s Commands table — R27 / drift-scan Check F violation, CI-verified failing (`drift-scan.integration.test.ts`, `real registry conforms` and 5 collateral tests). | fix-now | Registration folded into slice 2 (see Slice plan) rather than filed as a separate issue — direct, same-PR consequence of this story's own new file. |
| 3 (P3, code-reviewer) | Original `story-maint-32` prep commit subject used "plan + P2 review" phrasing, which doesn't match `harness/dod-check/lib/commit-subject.ts`'s `PREP_COMMIT_SUBJECT` regex (expects literal "plan + P1/P2/P3 review", per CLAUDE.md § 6.4's own canonical text). Three prior Reduced-lane precedents (maint-22/24/25) carry the same non-matching phrasing — a pre-existing, unfiled tooling-conformance gap, distinct from #239. | fix-now (this story) / defer-issue (the broader precedent pattern) | This story's prep commit reworded to the literal canonical phrase during the renumbering rewrite. The broader pattern (3 prior stories, plus whether `commit-subject.ts`'s regex or CLAUDE.md's prose should flex) is out of scope for a 2-file doc-relocation story — filed as a follow-up issue (see retrospective Action items). |
| 4 (P4, sibling-overlap) | **Blocking**: `story-maint-32` (this story's original id) collided with PR #247, renumbered to `story-maint-32` by a concurrent session and merged mid-flight. | fix-now | Story renumbered to `story-maint-34` (see Context renumbering note); this PR's branch history rewritten accordingly. |
| 5 (soft, code-reviewer) | Gherkin scenario 3's "harness registration" verification leans on a transient in-session observation not independently re-derivable from the diff alone. | acknowledge | Low severity; the file's presence at the conventional path is independently re-verifiable, and Check F (added this renumbering) now gives scenario 3 a second, durable, CI-checked verification mechanism. |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — sibling-overlap, Reduced lane): findings triaged above.
- [x] Draft PR with template sections 1–6 filled.
