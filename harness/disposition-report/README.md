# harness/disposition-report

Evals-Lite (issue #165): aggregates the suggestion-log [disposition
records](../../docs/harness/glossary.md#disposition-record) the loop already
produces in `docs/plans/*.md` into adopted/deferred/rejected/acknowledged
rates — per tag, per phase, per R-rule (ranked by acknowledge-only rate),
per story. Same isolation pattern as `harness/drift-scan/` and
`harness/metrics/`: no imports to/from `src/` or `tests/`; covered by
`vitest.harness.config.ts`; coverage-exempt per CLAUDE.md § 5.

## Invocation

```sh
npm run metrics:dispositions

# Custom output directory (used by the integration test against a tmp dir
# so it never overwrites the committed real-tree artifacts mid-run)
npx tsx harness/disposition-report/disposition-report.ts --out /tmp/some-dir
```

Writes `docs/metrics/dispositions.md` (human report) and
`docs/metrics/dispositions.json` (machine input — #164's evidence base) to
the resolved output directory (`docs/metrics/` by default). Exits `1` when
zero suggestion logs are found anywhere under `docs/plans/` — the tool's own
self-check against a silently-empty result. Exits `0` otherwise, regardless
of how many individual rows land in the honesty buckets below.

## Pipeline

1. `parse-suggestion-log.ts` — pure: reads one plan file's markdown, returns
   `SuggestionLogRow[]`. Tolerant of the two live table dialects (`| # |
   Finding | Tag | Resolution |` and the older `| Phase | Suggestion |
   Resolution | Link / Reason |`) via column-*role* detection (a `Tag`
   header wins; otherwise `Resolution`, then `Disposition`) rather than a
   rigid two-shape match — real logs have more header-name variance than the
   two canonical dialects (`Finding (one-line)`, `Disposition`, extra `#`/
   `Phase` columns all appear in the wild; see Deviations in the PR).
2. `attribute.ts` — pure heuristics: phase (`p2`/`p4`/`unattributed`) from a
   row's own id (`P4-*` always wins) or its position relative to a
   `### Phase 4 ...` / `**Phase 4 ...**` / `**Phase-4 review ...` marker;
   R-rule mentions (`/\bR\d+\b/g`) in the finding text; a coarse leg mapping
   (`p2` → plan-reviewer/sibling-overlap, `p4` → code-reviewer/ddd-modeler).
3. `aggregate.ts` — `aggregate(rows)` builds the `DispositionReport`
   (per-tag totals, per-phase rates with legs, per-rule ranked
   acknowledge-only rates with `n`, per-story table), plus
   `formatMarkdownReport` / `formatJsonReport`. Deterministic: fixed key
   order, sorted arrays, no timestamps — reruns diff cleanly.
4. `disposition-report.ts` — CLI entry: walks `docs/plans/*.md`, parses each,
   aggregates, writes both artifacts.

## Honesty limits

- **Heuristic attribution, not ground truth.** Phase and R-rule attribution
  are regex/position heuristics over free-form markdown, not a parsed
  grammar. `unattributed` (phase) and `unparsed` (tag) are explicit, counted
  buckets — a row that can't be confidently classified is never silently
  dropped or guessed into a bucket it might not belong to.
- **`n` always travels with a rate.** Every per-rule acknowledge-only rate in
  the report carries its `total` (`n`) alongside it — a 100% rate on `n=1`
  reads very differently from `n=20`, and the report never hides that.
- **Coarse leg mapping.** `legsForPhase` names *which pair of agents run at
  that phase*, not which one raised a specific finding — Phase 2 findings
  aren't attributed between `plan-reviewer` and `sibling-overlap`
  individually.
- **Artifacts go stale.** `docs/metrics/dispositions.{md,json}` are commit-
  time snapshots, not live-generated. Each maintenance sub-loop (CLAUDE.md
  § 6.7) may rerun `metrics:dispositions` alongside `metrics:loop`; the
  per-story table's most recent row is the visible staleness signal.

## What this deliberately isn't

**Fixture-based golden evals (#98 § 4d) are not built here.** This tool
aggregates dispositions the loop *already recorded* — it does not re-judge
any finding, and it does not run agents against synthetic fixtures to check
for regressions. That's a materially bigger investment (harness scaffolding,
fixture curation, an oracle for "is this still the right disposition") that
issue #98 itself flags as a cathedral-early risk if built before there's a
demonstrated need.

**Trigger to reconsider:** if the same regression class (e.g., a reviewer
checklist bullet repeatedly producing acknowledge-only noise, or a
disposition heuristic repeatedly misclassifying the same dialect) shows up
again *after* this story's demotions land, that recurrence is the signal to
build the fixture harness — not a schedule, not a story-count threshold.
Until then, the disposition report plus `spec-version` headers
(`harness/lib/agent-spec.ts`, precondition for #172/#98 § 4a) are the
cheaper first step.
