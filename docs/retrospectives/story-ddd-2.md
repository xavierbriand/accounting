# Retrospective — story-ddd-2

Dev Harness declared a second bounded context (PR #174): user-owned harness glossary (21 terms, literature-seeded with operational definitions), control inventory as an enforced registry, `role: doer|judge|advisor` on all six agent specs, drift-scan Check F (`missing-role` / `role-tools-violation` / `unlisted-control`) on the new shared `harness/lib/agent-spec.ts` parser, context-map delta (ACL-observed relationship), CLAUDE.md § 2/§ 5/§ 6 deltas, and the R27 rule row this file originates.

## Keep

- **Phase 0 with Mode A candidates, run voluntarily on a Reduced-lane story.** The ddd-modeler killed "Separate Ways" as a term-of-art violation before it shipped — the harness's own vocabulary discipline catching the main session's draft is exactly the loop working. The role-taxonomy forks (ddd-modeler's two modes, taxonomy misfits) were converged with the user in one dialogue instead of surfacing as Phase-4 rework.
- **Sibling-overlap at Phase 2 caught a sibling that shipped mid-planning.** story-h10b merged between Phase 0 and Phase 2; the scan surfaced it as blocking (redundant hook slice, Check-C letter collision) and the plan was corrected *before* implementation — one dropped slice and a rename instead of thrown-away code.
- **User-signed wording committed verbatim, deviations reported not silently fixed.** The implementer treated the glossary and context-map as sign-off artifacts, flagged every judgment call (historical-plan annotation, inventory comparison key), and surfaced the R27 transient honestly instead of inventing a suppression mechanism mid-slice.
- **The enforced registry works.** "We keep forgetting agents/skills/commands are part of the harness" is now structurally impossible: an unregistered `.claude/` control fails drift-scan in the same edit that adds it (`unlisted-control`), at write time via the hook h10b shipped and in CI.

## Change

- **Mechanical sweeps over user-owned prose need a grep verification step.** The Phase-2 letter change (Check C → F) was propagated by manual spot edits and missed 1 of 5 glossary mentions — caught only by Phase-4 review (both judges independently). A sweep isn't done until `grep` says it's done; that's a guide-without-sensor moment inside the very story about pairing them.
- **The maintenance sub-loop is a point-in-time snapshot, and this tracker moves fast.** Two siblings (h10a, h10b) merged during this story's planning phases; each invalidated plan premises. Re-fetch and re-verify premises at every phase *transition* (0→2, 2→3), not only before pushes — R18 covers pushes; the planning-phase gap is real.

## Try

- **Give the judge/advisor split teeth** — sandbox non-doer Bash or sense mutating git subcommands from judge sessions (#177).
- **A direction for the mid-story table-only transient** — an R-row landing before its retro inside one branch reds drift-scan runs until Phase 5; pick a marker, a documented expectation, or a branch-aware Check A (#178).
- **When #172 builds Check E, collapse the near-duplicate spec-file enumerators** (`getAgentSpecFiles` / `getClaudeSpecFiles`) and read frontmatter through `parseAgentSpecFrontmatter` — recorded on #172.

## Phase-4 disposition record

Findings from `code-reviewer` + `ddd-modeler` Mode B (parallel): 2 P1, 0 P2, 5 P3 (4 soft), 1 model-conformance. Fixed now: stale Check-C mentions (glossary Authorization-boundary entry, plan invariants line); Gherkin real-registry scenario reworded to the exported composed functions + literal in-process test added; inventory path extraction row-scoped with traversal-segment rejection; test pins for unclosed-fence fail-safe, duplicate-key last-wins, and Check-F kinds in the clean-repo assertion. Deferred with issue: non-doer Bash residual (#177), enumerator dedup (#172 comment). Acknowledged: `formatHumanReport` growth (pattern-consistent per-check block), R27 in-branch transient (#178 records the direction question).

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Sandbox/sense non-doer Bash (judge/advisor teeth) | #177 | Open |
| Mid-story `table-only` transient direction | #178 | Open |
| Check E reuses `parseAgentSpecFrontmatter`; collapse spec-file enumerators | #172 (comment) | Open |
| #154 scope decision: does Check C's glossary conformance cover `docs/harness/glossary.md`? | #154 (proposal comment, user decides) | Open |

New rule minted: **R27** (CLAUDE.md § 8) — dev harness is a second bounded context; agent specs declare roles; only doers carry file-mutation tools; enforced by drift-scan Check F.
