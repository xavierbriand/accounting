# Retrospective — story-maint-30 (PRD verb-set reconciliation)

Plan: folded into the PR body (Light lane, R26) · PR [#250](https://github.com/xavierbriand/accounting/pull/250) · Closes [#245](https://github.com/xavierbriand/accounting/issues/245)

Finding #3 of the [2026-07-20 critical project review](../reviews/2026-07-20-critical-project-review.md), executed: the PRD's five-verb MVP promise (`ingest`, `status`, `settle`, `config`, `correct`) reconciled against the eight commands `src/cli/program.ts` actually registers. `settle` annotated as absorbed into `status` (FR8 safe transfer) + `explain` (FR19 variance/follow-through); `config` marked Epic 5 (FR24–27); `migrate`/`explain`/`export`/`dissolve`/`categorize` added with origins; the never-implemented `update --check` network sanction struck.

## Cost

- `metrics:story maint-30` reported 4 sessions / **$31.39** — **discard the number**. The attribution
  is contaminated: `attributeToStory` (`harness/metrics/lib/usage-reader.ts:185`) matches on the
  commit-time window *alone*, with no cwd filter, despite the report footer claiming "sessions
  matched by cwd + commit-window timestamp overlap". Four sibling worktrees were live in this repo
  during the window, so unrelated concurrent sessions were absorbed; the coordinator session appears
  in the *unattributed* list at the same time, so the report isn't even self-consistent about what
  it counted. Filed as [#254](https://github.com/xavierbriand/accounting/issues/254) (Try). Honest
  shape for this story: one coordinator session, no implementer leg, ~50 lines of authored markdown.
- Per-story `docs/metrics/story-*.md` files are local artifacts (never committed — confirmed against
  `git log --all`); the generated file was removed after reading.

## Loop metrics

- **Lane:** Light (docs-only — `docs/prd.md`; precedents: story-4.0, story-maint-20, story-h14).
  Plan in the PR body, Phase 0 skipped (no model impact — annotates canon against shipped code, no
  Core domain concept changes), Phase 2 skipped, Phase 4 `code-reviewer` only, R16 collapse.
- **Phase 1:** the issue reserved two decisions for the user (alias-vs-annotate for `settle`;
  keep-vs-strike for `update --check`). Both were put as a single `AskUserQuestion` pair with the
  shipped-code evidence already gathered, before any editing — annotate + strike came back, and the
  edits followed in one pass with no rework.
- **Phase 3:** no sonnet-implementer — coordinator-authored.
- **Phase 4:** `code-reviewer` — **6 findings (2 P1 / 1 P2 / 3 P3, 2 of them soft) → 4 fix-now,
  2 acknowledged**, dispositions in PR § 7. The P1s were real: the reconciliation had been written
  as three annotated verb-list sites plus *one covering sentence* carrying seven other `settle`
  mentions, and one of those (Risk Mitigations snapshots, line 124) sits **before** the covering
  sentence in document order. Fixed by annotating every site in place.
- **Commits:** 5 counted body commits + `chore(retro)` (exempt) — over R16's literal 4, honestly
  declared rather than trimmed. The token stays **undeclared** regardless: dod-check parses it only
  from plan files and a Light-lane story has none ([#239](https://github.com/xavierbriand/accounting/issues/239)),
  so the envelope takes the advisory path, same as maint-27 and h14.
- **Sub-loop drain:** [#57](https://github.com/xavierbriand/accounting/issues/57) closed via
  [PR #249](https://github.com/xavierbriand/accounting/pull/249) (quickpickle ≥1.11.2 made
  `pixelmatch` an optional lazy peer; workaround devDep dropped, suite green without it) + the
  h11-pending `loop.csv` regen cleared.

## Keep

- **Put the user's forks first, with the evidence already in hand.** #245 flagged two decisions as
  user calls. Grounding both in the repo *before* asking — which command carries the settlement
  math, whether any network code exists at all — turned them into one two-question prompt with real
  options instead of an open-ended consultation, and the answers were directly executable. The
  Phase-1 interview discipline works at Light-lane scale too, just compressed.
- **Annotate in place, never rewrite.** Same idiom h14 used on the thesis corpus: the original
  promise text survives, its fate is appended, and the strike is *recorded as a strike* rather than
  a silent deletion. A canon doc's history is evidence — the diff has to stay readable as "what we
  promised vs what we shipped", which is exactly what made this drift findable in the first place.
- **The empty-refactor slot earned its keep as a decision record.** The one restructuring candidate
  (hoisting the scattered notes into a central reconciliation table) was considered and rejected for
  a substantive reason — annotations must sit *at* the stale claim, because the failure mode being
  fixed is a reader trusting a claim without knowing a reconciliation exists elsewhere. R11's
  justification field is where that reasoning survives; an omitted slot would have lost it.

## Change

- **One covering sentence is not an annotation — it is a dependency on reading order.** The first
  draft redirected seven `settle` mentions with a single paragraph in the Core Verbs section. Cheap
  to write, and wrong: prose documents are read by grep and by section, not front-to-back, and one
  redirected site physically preceded the redirect. The rule to carry forward: **if a claim is stale
  where it sits, the correction goes where it sits.** A summary paragraph can enumerate the sites;
  it cannot substitute for marking them.
- **Enumerating categories in a covering claim silently bounds it.** The covering sentence named
  four categories (snapshots, idempotency, dry-run, write latency) and thereby excluded FR22's
  determinism clause — which mentions "re-running a settlement" and needed the *opposite*
  treatment, since determinism now governs a read-side calculation rather than a write verb. A
  scoping list reads as complete whether or not it is; if the list isn't exhaustive, don't write it
  as though it were. (Sibling of h14's "name the denominator in the same sentence".)
- **A generated metric is not evidence until its generator's own claim is checked.** The Cost number
  looked wrong for a docs story, and reading `attributeToStory` showed the footer's stated
  mitigation — cwd filtering — does not exist in the code. Harness output carries authority it has
  to earn, and a hedge sentence naming a control is a claim like any other. This is the defect class
  h11's honesty gates target, sitting inside the harness's own telemetry.

## Try

- **[#254](https://github.com/xavierbriand/accounting/issues/254)** *(filed)* — implement the cwd
  filter `usage-reader` already claims, or reword the footer to the truth. Blocks
  [#176](https://github.com/xavierbriand/accounting/issues/176): a *required* Cost section on a
  contaminated source would fossilize wrong numbers into committed artifacts.
- **[#239](https://github.com/xavierbriand/accounting/issues/239)** *(commented)* — now carries
  three more no-plan-file / envelope symptoms from this story: story-id resolution fails on a
  session-assigned branch (worked around by renaming to `story-maint-30` before first push, without
  which the *entire* DoD gate would have degraded to advisory); `loop-metrics.ts` keys rows on
  `docs/plans/story-<id>.md`, making every Light-lane story structurally invisible to `loop.csv`;
  and a maintenance sub-loop ride-along commit consumes an envelope slot with no exemption
  available, since R30 exempts only the prep and retro subjects.
- **No new rule minted.** The two prose-annotation lessons under Change are docs-authoring craft,
  not loop mechanics — they belong in the retro record and in the reviewer's P1 instincts, not as a
  § 8 row. h13's subtraction thesis applies: the loop must subtract process debt at the rate it adds
  it, and a rule that would fire on one docs story every few months is debt.
