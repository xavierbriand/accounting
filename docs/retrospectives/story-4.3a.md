# Retrospective — story-4.3a

Settlement Variance, Core + Infra half (PR #204): `src/core/settlement/` (LineItemKey,
VarianceLine, FollowThrough, SettlementVariance, `explainSettlementVariance`), the
`ContributionQuery` port + `SqliteContributionQuery` adapter, and the `settlement:` config
section. The story itself was **reframed before planning**: a three-round user interview
overturned the epic's correction-narration reading of FR19 into a month-over-month
settlement variance report — corrections turned out "mostly irrelevant" to the settle-table
conversation. `ddd-modeler` Mode B at Phase 4: all 10 model-note invariants verified enforced.

## Keep

- **Interview the why before designing.** A fully-reviewed, feasibility-verified plan
  (correction-counterfactual narration) was discarded in an afternoon because the discovery
  interview revealed the real need. The cost of the discarded design was three background
  agents; the cost of shipping the wrong feature would have been the whole story. The
  interview pattern (moment → audience → reference point → answer shape, then two deeper
  rounds) is now the Phase-1 opener for feature stories; the discarded design was preserved
  as evidence in #202 rather than deleted.
- **Phase-2 review caught a silent-zero trap before code existed.** `plan-reviewer` traced
  that passing the same `asOf` to both `calculateForWindow` runs yields zero buffer-topup
  lines for the past window (fill-slot enumeration starts at `asOf`); the plan gained a
  binding composition note and scenario 3 a `fails if` clause. Sonnet hit no as-of ambiguity
  at Phase 3.
- **One user decision resolved four findings at once.** Dropping the totals-only fallback
  (unreachable from documented config) simultaneously closed the R6 honesty finding, the R2
  surface gap, the Core/Infra synonym drift, and shrank the adapter — evidence that resolving
  the *cause* (an unrepresentable input modeled as reachable) beats patching each symptom.
- **Model-session with candidate shapes converged fast.** Three genuinely different shapes +
  six policy forks let the user redirect twice (baseline = actual credits; attribution at the
  ledger edge) before anything was signed; the note's 10 invariants then mapped 1:1 onto tests.

## Change

- **Sign-off asks must carry the artifact link.** The user had to ask for the file link
  before signing the model note ("give me a link… and add this to the retrospective").
  Adopted mid-story and saved as a durable preference: any decision that gates on a file gets
  its clickable link in the same message.
- **Docs-commit subjects must use the countSlices-exempt canonical forms.** The prep commit's
  subject drifted (`plan + Phase-0 model note + P1/P2/P3 review`) and a separate `DoR
  complete` chore was invented — dod-check counted both as slices (12 > R13's 10), which
  would have hard-blocked mark-ready. Repaired with a user-approved one-time branch rebuild.
  Codified as **R30** (CLAUDE.md § 8, this PR): only the canonical prep subject and
  `chore(retro)…` are envelope-exempt; DoR/PR-link edits fold into the prep commit,
  Phase-4/5 docs into the retro commit.
- **A modeled fallback needs a reachability check at plan time.** The totals-only branch
  survived Phase 0 and Phase 2 although the same plan's config schema made it
  unrepresentable; the mismatch surfaced only when Sonnet had to invent a test-only input.
  Plan reviews of stories with config-gated behaviour should ask: *is every modeled branch
  reachable from a documented input?*

## Try

- **Reachability column in model notes.** For each invariant/branch, name the documented
  input that exercises it — a cheap table that would have caught the totals-only gap at
  Phase 0.
- **Interview memory as a standing Phase-1 step** (saved to auto-memory this session):
  epic story texts are hypotheses; run the discovery interview before presenting design forks.

## Loop metrics

plan 203 LOC · diff (src+tests) 1651 LOC · weight ratio 0.12 · 10 slices (R28) at the R13
ceiling · 836 tests green · 2 review agents Phase 2, 2 Phase 4, 1 model session, 1 implementer.

## Action items

| Item | Where | Status |
|---|---|---|
| 4.3b: CLI `explain` command (window helper, determinism widening, netting extraction, R8) | [#208](https://github.com/xavierbriand/accounting/issues/208) | Open — next story |
| Per-transaction correction-story view (pre-reframe FR19 reading, design preserved) | [#202](https://github.com/xavierbriand/accounting/issues/202) | Open |
| Config-change-labelled variance causes | [#203](https://github.com/xavierbriand/accounting/issues/203) | Open — blocked by 4.5 |
| Branch-coverage tooling (100% gate currently manual) | [#209](https://github.com/xavierbriand/accounting/issues/209) | Open — maintenance |
| R30 rule row | CLAUDE.md § 8 (this PR) | Done |
| #156 (Epic-4 Phase-0 umbrella) near-closeable | next maintenance sub-loop | Queued |
