# Story h10b — drift-scan over `.claude/`: guard the single-sourced rule system

The **scanner half** of #162 (F5, scope item 3). h10a (specs half, PR #171, merged `e931041`)
single-sourced the reviewer rule-walks and removed the frozen `R1..R15` enumeration; h10b adds the
ratchet that keeps them from re-drifting — a drift-scan check over `.claude/agents` + `.claude/commands`.

## Context

h10a converted both reviewers' rule-coverage walks to a row-driven walk over the live § 8 table.
Nothing prevents a future edit from re-freezing them (a new `R1..R27` range) or citing a tag that
doesn't exist. drift-scan already guards § 8 ↔ retro (Check A) and plan ↔ source (Check B) but
**deliberately skips `.claude/`** (F5) — the largest drift surface. h10b extends it.

**No FR coverage** — harness/process story (dev-loop tooling).

**Lane: Reduced** (R26). Trigger: behaviour-changing `harness/` code (`harness/drift-scan/`). Phase 0
skipped; Phase 2 = `sibling-overlap` only; Phase 3 = `sonnet-implementer` (real red→green TDD —
restores the two-model loop h10a's Opus-only run muddied); Phase 4 = `code-reviewer` + `sibling-overlap`.

### Maintenance sub-loop (§ 6.7) run 2026-07-04 pre-planning

- **Sibling work check.** `gh pr list --state open` → `[]`. Open issues: **#154** (drift-scan Check C —
  glossary conformance) shares the *scanning mechanism* — coordinate, don't merge (see Selected solution).
  **#164** (post-Epic-4: R22 resolution / tombstone rows) owns the § 8 numbering-hole fix — h10b does
  **not** resolve the hole, it works around it with a suppression marker. No open PR touches drift-scan.
- **Story-id uniqueness.** `git ls-tree -r origin/main … | grep story-h10b` → none. `story-h10b` free.
- **Working tree clean.** Fresh worktree `../accounting-h10b` on branch `story-h10b`, cut from `origin/main` @ `e931041`.
- **Open issues.** 30 open; no drift-scan-code overlap besides #154 (coordinated).
- **Backlog refinement.** Not required this sub-loop (h9 reset is a separate user-gated follow-up).
- **Open PRs.** None.
- **`npm audit --audit-level=high`** → `found 0 vulnerabilities`.
- **Proceed-to-planning:** clear.

## Story

> As the dev-loop maintainer, I want drift-scan to fail when a `.claude/` agent or command spec
> hard-codes an enumerated rule-range or cites a tag that isn't in § 8, so that the row-driven rule
> walks h10a shipped can't silently re-freeze or drift from canon.

## Domain model

**No model impact** — harness tooling; touches no Core domain concept (R24 by declaration).

## Selected solution

Add **Check D — `.claude/` rule-tag drift** to drift-scan (a *sibling* check, not a widening of
Check A — the semantics differ: Check A is bidirectional retro↔§8; Check D is a one-directional scan
of spec files). It always scans the full (small) `.claude/agents/*.md` + `.claude/commands/*.md`
corpus (like Check A, not diff-scoped). Two finding kinds:

- **`claude-range`** — an enumerated rule-range pattern (`R<n>..R<m>`, `R<n>–R<m>`, and dash/ellipsis
  variants). This is the exact frozen-`R1..R15` antipattern F5 named; there is no legitimate use, so
  it is always flagged.
- **`claude-stale-tag`** — a bare `R<n>` reference whose tag is **not** a live § 8 row, **unless**
  immediately followed by a `*(hole)*` / `_(hole)_` marker (case-insensitive — same mechanism as
  Check A's `*(pending)*`). The marker exempts a deliberate reference to a non-§8 tag; its only
  current use is the two "§ 8 skips R22 (no tombstone row)" mentions h10a authored to explain the
  numbering hole (inventory: `plan-reviewer.md`, `code-reviewer.md`).

**Coordination with #154 (widen-vs-sibling decision, Phase-1):** #154 reserves "Check C" for glossary
conformance (a different corpus — model-notes/plans — against `docs/domain/glossary.md`). h10b takes
the next label, **Check D**, as a sibling check. Both share the "scan-files-for-X, cross-ref-against-canon"
shape but neither depends on the other. A coordinating note lands on #154 at merge.

**Explicitly out of scope (deferred):**
- *§ 8 numbering-integrity / R22 resolution* → owned by **#164** (tombstone rows). h10b's `*(hole)*`
  marker is a work-around, not a resolution; when #164 adds an R22 tombstone row, the markers become
  redundant (forward-compatible — a tombstoned R22 is then a live § 8 tag and no longer stale).
- *§6.2-tier-list-vs-frontmatter drift* (h10a retro Try) → a distinct mechanism (parsing §6.2 prose
  tier claims vs frontmatter `model:`), higher false-positive risk; filed as a follow-up issue at Phase 2.

R21 is **widened, not replaced**: its § 8 row wording gains `.claude/` spec ↔ § 8 rule-tag
consistency (keeping the rule system single-sourced — the h10 theme). No new R-tag is minted.

Alternatives set aside:
- *Widen Check A to also scan `.claude/`* — rejected: Check A's bidirectional retro↔§8 semantics don't
  fit a one-directional spec scan; a sibling check is cleaner and independently testable.
- *Flag every non-§8 tag with no exemption* — rejected: false-positives on the legitimate R22-hole
  mentions h10a authored. The `*(hole)*` marker (Check-A-consistent) is the fix.
- *Also assert numbering integrity here* — rejected: it would force R22 resolution, which is #164's job.

## Production-code surface (R2)

Additive only — no existing signature changes.

- `harness/drift-scan/lib/drift-parser.ts`:
  - New exported types `ClaudeStaleTagFinding` (`kind: 'claude-stale-tag'; tag: string; file: string`)
    and `ClaudeRangeFinding` (`kind: 'claude-range'; range: string; file: string`); both added to the
    `DriftFinding` discriminated union.
  - New `extractEnumeratedRuleRanges(content: string): string[]` — returns range strings found.
  - New `extractClaudeTagRefs(content: string): Set<string>` — bare `R<n>` refs, minus `*(hole)*`-marked ones.
  - New `composeClaudeDrift(tagRefs: Set<string>, sectionEightTags: Set<string>): Set<string>` — refs not in § 8.
- `harness/drift-scan/drift-scan.ts`:
  - New `runClaudeCheck(repoRoot: string): DriftFinding[]` — globs the two `.claude/` dirs, extracts
    ranges + tag refs, composes stale tags vs § 8, returns findings.
  - `formatHumanReport` gains a "Check D — `.claude/` rule-tag drift:" section.
  - `main()` includes `runClaudeCheck` output in the findings array + exit gate.
  - `formatJsonReport` unchanged (already generic over `DriftFinding`).
- **Non-code:** `.claude/agents/{plan-reviewer,code-reviewer}.md` (add `*(hole)*` to the two R22 mentions);
  `.claude/settings.json` (extend PostToolUse hook regex to fire on `.claude/(agents|commands)/*.md`);
  `harness/drift-scan/README.md` (Check D section + scope rules + marker); `CLAUDE.md` § 8 R21 wording.

## Gherkin acceptance scenarios

Real tests (harness has runtime). Acceptance = subprocess-level (spawn the scanner, R7 subprocess
tier — only a subprocess run exercises `runClaudeCheck` wired through `main()`'s exit gate); parser
internals covered by in-process unit + property tests.

**Scenario 1 — enumerated range in a spec fails the scan**
- Given a temp `.claude/agents/*.md` fixture containing `R1..R15`
- When the scanner runs
- Then it exits 1 and stderr names the range under Check D
- `fails if` `runClaudeCheck`/`extractEnumeratedRuleRanges` doesn't detect the range antipattern. *(subprocess)*

**Scenario 2 — a tag not in § 8 fails the scan**
- Given a temp spec fixture citing `R95` (no § 8 row)
- When the scanner runs
- Then it exits 1 and stderr names `R95` as a stale tag under Check D
- `fails if` `extractClaudeTagRefs`/`composeClaudeDrift` doesn't surface a non-§8 reference. *(subprocess)*

**Scenario 3 — `*(hole)*` marker suppresses a deliberate non-§8 reference**
- Given a temp spec fixture citing `R95 *(hole)*`
- When the scanner runs
- Then that reference produces no Check D finding
- `fails if` the suppression regex in `extractClaudeTagRefs` is missing/too narrow (the R22-hole mentions would then break a clean scan). *(subprocess)*

**Scenario 4 — clean repo passes, and `--json` carries the new kinds validly**
- Given the real repo after the two R22 mentions are marked `*(hole)*`
- When the scanner runs (and separately with `--json` against an injected range fixture)
- Then Check D contributes no finding on the clean repo (exit 0), and every `--json` finding of kind
  `claude-range`/`claude-stale-tag` matches its documented shape
- `fails if` a legit spec tag or a marked R22 is flagged, or the JSON discriminated-union shape drops
  `range`/`tag`/`file`. *(subprocess)*

## Slice plan

**Envelope: R13** (Reduced-lane default; harness code, not adapter → 6–10 commits, one behaviour/slice).
Standard outside-in TDD via `sonnet-implementer`.

| # | Commit | Concern |
|---|--------|---------|
| — | `chore(docs): story-h10b plan + Phase-2 review (story-h10b)` | prep (not counted) |
| 1 | `test(drift-scan): enumerated-range detection over .claude/ — failing (story-h10b)` | acceptance S1 + unit red |
| 2 | `feat(drift-scan): extractEnumeratedRuleRanges — minimal green (story-h10b)` | range parser |
| 3 | `test(drift-scan): non-§8 tag + *(hole)* suppression — failing (story-h10b)` | S2/S3 + unit red |
| 4 | `feat(drift-scan): extractClaudeTagRefs + composeClaudeDrift — minimal green (story-h10b)` | stale-tag parser + suppression |
| 5 | `feat(drift-scan): wire Check D into runClaudeCheck + human/JSON report + exit gate (story-h10b)` | scanner integration (S4) |
| 6 | `chore(drift-scan): mark R22-hole mentions, extend PostToolUse hook, README + R21 wording (story-h10b)` | clean-repo green + wiring + canon |
| 7 | `refactor(drift-scan): <cleanup or empty slot w/ justification> (story-h10b)` | R11 |
| 8 | `chore(retro): story-h10b Keep/Change/Try + status fragment (story-h10b)` | Phase 5 |

## Risks & deferred items

| Risk | Mitigation |
|------|-----------|
| Stale-tag check false-positives on regex/example tokens in specs (`R[0-9]+`, `\| R13` example) | `extractClaudeTagRefs` matches `\bR\d+\b` word-boundary tokens only — `R[0-9]` (R+`[`) doesn't match; `R13` in an example IS a real §8 tag → not stale. Verified against current `.claude/` inventory: only R22 (×2) is non-§8, handled by the marker. |
| The two R22 mentions break the clean-repo scan before they're marked | Slice 6 marks them `*(hole)*` in the same commit that lands the clean-green integration test; Scenario 4 guards it. |
| Range regex over-broad (matches prose like "R2 and R2") | Anchor to adjacent `R<n><sep>R<m>` with `sep ∈ {.., –, —, -, …}` only; unit-test the boundary (no false match on "R2, R3"). |
| Label collision with #154's "Check C" | h10b uses **Check D**; coordinating note on #154 at merge (action item). |

Deferred → GitHub issue at Phase 2: §6.2-tier-list-vs-frontmatter drift check (h10a retro Try).

## Verification plan

`npm run lint && npm run build && npm test` green (new unit + integration tests pass). Manual:
`npx tsx harness/drift-scan/drift-scan.ts` exits 0 on clean main (after slice 6); a temp fixture with
`R1..R15` or `R95` (unmarked) exits 1 naming it under Check D; `--json` shows the new kinds. drift-scan
Check A/B still green (R21 wording keeps its story-h1 reference; h10b retro adds another).

## Suggestion log

Filled at Phase 2 (Reduced lane → `sibling-overlap` only).

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | sibling-overlap: **#162** is the parent umbrella h10b closes (scanner half, F5). | ACKNOWLEDGE | Reference/close #162 from the PR at merge. |
| 2 | sibling-overlap: **#154** (Check C glossary) shares the scan-and-cross-ref mechanism + adjacent label. | ACKNOWLEDGE | Plan chose sibling **Check D**, no widen/merge — different corpora + functions. Coordinating note on #154 at merge (action item). |
| 3 | sibling-overlap: **#164** owns R22 numbering-integrity / tombstone rows. | ACKNOWLEDGE | h10b works around the hole with `*(hole)*` (forward-compatible); numbering-integrity stays #164's. No block (also gated post-Epic-4). |
| 4 | sibling-overlap: **#119** (drift-scan diff-scope subprocess tests) touches the same file, disjoint concern (Check B `getPlanFiles`, not Check D). | ACKNOWLEDGE | No scope/code overlap — different functions, no in-flight branch. No action. |
| 5 | Plan (deferred): §6.2-tier-list-vs-frontmatter drift check (h10a retro Try) — distinct mechanism, out of h10b scope. | DEFER | Filed as [#172](https://github.com/xavierbriand/accounting/issues/172) (drift-scan Check E). |
| 6 | **Phase 4 code-reviewer (P2 R8):** the `--json` shape test injects only a `claude-range` fixture; after slice 6 marks R22 `*(hole)*`, the clean repo has zero live `claude-stale-tag` findings, so that JSON shape branch is never exercised against a truthy member (defaults-only gap). | **FIX-NOW** | Fixed in `0f4e9a3` (Sonnet, delegated — exceeds R9 ≤5 LOC inline carve-out): added an unmarked `R94` stale-tag fixture alongside the range fixture, asserting `tag='R94'`, `file` string, `range`/`path` undefined. |
| 7 | Phase 4 code-reviewer (P3 soft): `formatHumanReport` branches over 5 kinds / 3 checks in one fn — a per-check formatter map might read cleaner if a Check E lands. | ACKNOWLEDGE → note on #172 | Still <50 LOC and readable; revisit when #172's Check E adds a 4th section. |
| 8 | Phase 4 code-reviewer (P3 soft): the clean-repo Check-D test slightly overlaps the general clean-repo + marker tests. | ACKNOWLEDGE | Harmless targeted guard; keep. |
| 9 | Phase 4 sibling-overlap: no new overlap since planning; #154/#164 coordination holds. | ACKNOWLEDGE | Confirms Phase-2 log. |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — Reduced lane: `sibling-overlap` only): 5 rows triaged (4 ACKNOWLEDGE, 1 DEFER → #172). No blocking overlap.
- [ ] Draft PR with template sections 1–6 filled.
