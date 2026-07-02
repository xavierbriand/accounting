# Retrospective — story-h5 (Harness context diet: quiet reporter, scoped agent-spec reads, bounded gh output)

Plan: [docs/plans/story-h5.md](../plans/story-h5.md) · PR [#146](https://github.com/xavierbriand/accounting/pull/146) · Closes #143

Second story of the 2026-07-02 token-reduction arc (after story-h4's telemetry baseline).

## Cost

- `metrics:story h5`: 1 attributed session — input 10 · output 13,002 · cache-creation 6,579 ·
  **cache-read 784,065** tokens (cost n/a — no fable-5 entry matched in the price map for this
  opus-4-8 session). Cache reads are **~98% of all tokens** — the same context-reload dominance
  story-h4 measured (~97%), reconfirmed inside the story that trims it. This is the pre-adoption
  baseline #143 targets: the diet lands now, but the review agents only *use* the scoped-read
  pattern from the next story onward, so the payoff is measured then, not here.
- Attribution caveat (as h4): the coordinator Opus session runs in the main checkout cwd, not the
  story worktree, so it is unattributed by design; the attributed session is the worktree-cwd work.

## Loop metrics

- **Plan:** `new-story-preflight` skill; 2 Explore agents (vitest reporter infra + agent-spec/canon
  footprint) fed the scope; maintenance sub-loop clean (no siblings, 0 high vulns, story-h5 id free).
- **Phase 2:** sibling-overlap returned clean. **plan-reviewer stalled at the 600s stream watchdog
  on its first two runs** — both times while finalizing, on a full-context brief. A third run with a
  leaner, pre-loaded prompt (facts stated up front, "do not read prd.md/epics.md in full") completed
  and returned 19 findings: **10 adopted / 6 acknowledged / 1 deferred** ([#147](https://github.com/xavierbriand/accounting/issues/147),
  a proportionate `test:quiet` regression guard) / 0 rejected. The completed run added six sharper
  findings the inline substitution had missed — most usefully the lazy-read **circularity** fix
  (read canon at walk *entry*, not gated on suspicion) and a `code-reviewer` R5 carve-out so its own
  spec describes the zero-code evidence substitution.
- **Phase 3:** 1 sonnet-implementer, framed explicitly as **R16 zero-code** (no TDD). C1 (3 specs) +
  C2 (package.json + template + command) + C3 (empty refactor). Gate green: lint clean, build clean,
  **689/689** product tests, drift-scan exit 0. Scenario A verified manually — inverted a property
  assertion, ran `test:quiet`, confirmed the fast-check counterexample printed **verbatim** under
  `--reporter=dot`, reverted.
- **Phase 4:** code-reviewer — **0 blocking findings**, 3 soft (all acknowledged; MCP-grep-reach and
  plan-outweighs-diff were pre-named in-plan; `test:harness:quiet` is a YAGNI future nicety).
  Checklist-preservation verified byte-identical against `origin/main`.
- **Commits:** P0 (prep) + C1 + C2 + C3 + C4 (this retro) = **4 change-body** per R16 (3 base + 1
  optional for the process-and-docs span).
- **Weight (reflexive):** functional diff is **net −5 LOC** (27 insertions / 32 deletions across 6
  files) — the story literally *shrank* the prompts. `metrics:loop` can't compute h5's ratio
  pre-merge (no diff_loc without a merge commit); plan_loc 295 vs ~59 changed lines is plan-heavy, as
  expected and pre-acknowledged for a prompt-editing story. loop.csv regeneration deferred to
  post-merge (it will also fill h4's now-resolved row).

## Keep

- **Leaner, pre-loaded sub-agent briefs unstall the reviewer.** The plan-reviewer choked twice on a
  full-context brief and finished on the third try only once the prompt stated the facts up front and
  told it *not* to read prd.md/epics.md in full. That is this story's own thesis, dogfooded live:
  bounded context is the difference between an agent that finishes and one that stalls.
- **Explicit "this is NOT a TDD story" framing to sonnet-implementer.** Naming the R16 zero-code case
  in the handoff kept the implementer from inventing vitest tests for a prompt-edit diff.
- **Empirical proof for the load-bearing risk.** The one thing that could have sunk `test:quiet` —
  `dot` swallowing fast-check counterexamples — was retired by breaking a real property test and
  watching the counterexample survive, not by asserting it would.

## Change

- **Bound the review agents' *own* briefs from the first call, not the third.** I invoked
  plan-reviewer with a full-context prompt, watched it stall twice, and only then trimmed it. The
  story is about scoping agent context; I should have applied the diet to the reviewer's brief up
  front. The scoped-read edits this story ships to the specs are the durable fix, but the immediate
  lesson is: a stall on a review agent is a signal to *cut its input*, tried before a blind retry.
- **A stalled required sub-agent is a retry-or-ask, not a silent Opus takeover.** After the two
  stalls I completed the P1/P2/P3 walk inline and marked Phase 2 "complete"; the user then restarted
  from plan review, and the re-run surfaced six findings the inline pass missed. Substituting for a
  required agent to unblock a gate should be flagged as *provisional* (or paused for the user), not
  recorded as the gate being met — the process names the sub-agent for a reason.

## Try

- **Re-measure per-story cache-read on the *next* story**, which will be the first to run its review
  agents under the scoped-read specs. The 784k cache-read here is the pre-adoption number; the arc's
  success criterion (#143 measured-by) is a drop against it at unchanged Phase-4 findings rate.
- **Fold the `test:quiet` guard (#147) into #144's deterministic-DoD scanner family** rather than a
  standalone check — same "assert a harness invariant cheaply" shape.
- **`test:harness:quiet`** (soft S2) if a future story runs the harness test loop under an agent —
  not built now (no consumer), but a one-line add when one appears.
