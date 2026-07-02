# Story h5: Harness context diet — quiet test reporter, scoped agent-spec reads, bounded gh output

## Context

Closes [#143](https://github.com/xavierbriand/accounting/issues/143). Second story of the
2026-07-02 token-reduction arc (arc origin: [story-h4](story-h4.md) Context; baseline metrics
tooling shipped in story-h4, closing #99). Like story-h1/h2/h3/h4, this is a harness story outside
the `docs/epics.md` FR/NFR numbering — **no FR coverage is claimed**; the deliverable is process
tooling and prompt edits, not product behaviour.

Arc position:

1. **story-h4** (shipped) — telemetry baseline: measure per-story cost before optimizing.
2. **story-h5 (this plan)** — context diet: quiet vitest reporter for agent runs, scoped canon-doc
   reads in the three agent specs, bounded `gh` output.
3. **Deterministic DoD checks** ([#144](https://github.com/xavierbriand/accounting/issues/144)) —
   drift-scan siblings for commit-subject story-ids, TODO/TBD scans, Gherkin↔step mapping.

Motivation (measured by story-h4's tooling): phases 2–4 reload canon docs per sub-agent —
`plan-reviewer` alone reads ~92 KB, dominated by `docs/prd.md` (24.5 KB) + `docs/epics.md`
(33.8 KB), consulted only to confirm one cited FR/NFR and one cited epic. The sonnet-implementer
TDD loop re-ingests full verbose vitest output on every red/green iteration. story-h4's retro
measured ~97% cache-read tokens — context dominates cost. This story trims that context on three
fronts.

## Maintenance sub-loop (§ 6.7) — run 2026-07-02 pre-planning

- **Sibling work check:** no open PRs. #144 (deterministic DoD checks) is arc-adjacent but an
  explicit non-goal of #143 — no overlap. #143 is this story. Confirmed by the parallel
  `sibling-overlap` audit at Phase 2.
- **Story-id uniqueness:** `git ls-tree origin/main -- docs/plans docs/retrospectives docs/status.d`
  shows story-h1..h4 taken; no `story-h5` on `origin/main`; no open PR branch carries it.
  → **story-h5** chosen.
- **Working tree:** clean; `story-h5` worktree cut from `origin/main` @ f0924df.
- **Open issues review:** 30 open; no re-prioritisation; `deferred-suggestion` items untouched by
  this scope.
- **Open PRs:** none (no Dependabot pending).
- **npm audit --audit-level=high:** 0 vulnerabilities.
- **Proceed:** yes.

## Story

As the developer running this repo's agentic workflow, I want the three review/implementation
sub-agents to load only the canon context each phase actually uses, run their test loops through a
quiet reporter, and bound every `gh` list call — so that per-story context cost drops measurably
without changing what the agents check or the quality of their findings.

## Alternatives considered

- **Custom vitest reporter under `harness/`** — rejected. npm/web search found no quiet-local-dev
  reporter package (ecosystem reporters — sonar, teamcity, ctrf, github-actions — are all CI
  formatters); vitest's built-in `dot` reporter already prints dots for passes + full failure
  detail (incl. fast-check counterexamples, which live in the thrown error object) + summary. A
  custom reporter adds a maintained module, tests, and reporter-API coupling for no benefit.
- **New per-phase digest / checklist docs** — rejected. Duplicates canon content into files that
  drift-scan does not guard, creating a new maintenance surface. Canon stays single-source;
  section-anchored / lazy reads capture the dominant win (prd.md + epics.md targeting) at zero
  drift risk.
- **Change CI to `test:quiet`** — rejected. CI output is human-facing and not loaded into agent
  context (code-reviewer is told *not* to run tests; it reads results). CI stays verbose.
- **RTK / token-optimizing proxy** — out of scope per #143 non-goals; revisit against residual
  after this lands.

## Selected solution

Three independent, low-risk edits to harness prompts + config. **No `src/` change, no migrations,
no product behaviour change.**

### 1. `npm run test:quiet` — minimal reporter

`package.json` scripts gain `"test:quiet": "vitest run --reporter=dot"`. `dot` suppresses
per-passing-test noise (one dot each) and prints the full error block — diffs, stacks, and
fast-check shrunk counterexamples verbatim — only for failures, plus the run summary. Property-test
counterexamples are load-bearing and preserved because they live in the thrown error object, which
the reporter renders unchanged. CI (`.github/workflows/ci.yml`) stays on `npm test`.

### 2. Section-anchored canon reads in the three agent specs

- **`.claude/agents/plan-reviewer.md`** (read-block, current lines 15–22) — the biggest win:
  - Stop reading `docs/prd.md` and `docs/epics.md` wholesale. The plan cites a target FR/NFR and an
    epic — `Grep` those specific ids (e.g. `grep -n "FR4" docs/prd.md`) and read only the matched
    block. If the plan claims "no FR coverage", skip `prd.md`.
  - `CLAUDE.md`: read the § 8 R-tag table via `Grep`; cite §§ 6.1/6.4/6.6/7 inline as needed
    instead of a mandatory upfront full read.
  - `quality-assurance.md` / `engineering-standards.md` / `architecture.md` /
    `security-checklist.md` (4–8 KB, checklist-shaped): read the section(s) a phase covers
    **unconditionally at the start of that phase's walk** (lazy per-*phase*, not upfront-bulk and
    not per-*finding*), targeting the relevant section headings (all have stable headings). This
    avoids the circularity of a suspicion-gated read while still skipping docs for phases a story
    doesn't reach (Phase-2 adopted).
  - **Guard-rail:** the "read the plan first, end-to-end" instruction for the *plan itself* stays —
    plan-reviewer authors findings against the whole plan. Scoping applies to canon docs only.
- **`.claude/agents/code-reviewer.md`** (current lines 16–22): read **primarily the plan sections it
  audits** — "Acceptance scenarios"/Gherkin (R5), "Production-code surface" (R2), and the suggestion
  log — rather than the whole plan end-to-end, consulting other sections as a specific check
  requires (R9/R11/R12 draw commit facts from git, not the plan). Canon read at walk entry,
  section-anchored (as above). **Preserve the P2/P3 walk checklists in each spec verbatim** — only
  the upfront "read the whole doc" backing instruction changes (Phase-2 adopted). Additionally, add
  a **carve-out to the R5 bullet** (spec line 33): for a zero-code / process story with no test
  files, R5 evidence may be the verification-step grep/manual checks named in the plan's
  Acceptance-scenarios preamble — so the code-reviewer's own spec describes the substitution this
  plan's Phase-4 R5 note relies on (Phase-2 adopted).
- **`.claude/agents/sonnet-implementer.md`** (current lines 13–17): scope canon reads to the
  sections used (eng-standards / security / QA), read lazily. Point the red/green inner loop
  (§ 2 steps 2–3) and the local pre-push test invocation at `npm run test:quiet`. The DoD gate stays
  `npm run lint && npm run build && npm test` in spirit; the local *test* command uses the quiet form
  (CI still runs full `npm test`). Failures remain fully verbatim, so red-step diagnosis is unaffected.

### 3. Bound every `gh` list call

Add `--json <fields> --limit N` to list-style calls. `gh pr diff` is the one documented exception —
the whole diff is the input, so it has no sensible field/limit bound.

## Production-code surface (R2)

No `src/` files touched. No migrations. No schema changes. No product behaviour change. No type,
function-signature, or output-format changes. Harness prompts + one npm-script alias + docs only.

**Modified files:**

| File | Change |
| --- | --- |
| `package.json` | add `test:quiet` script |
| `.claude/agents/plan-reviewer.md` | section-anchored/lazy canon reads; bound `gh issue list` |
| `.claude/agents/code-reviewer.md` | plan-section-scoped read; walk-entry canon reads; bound `gh issue list`; R5-bullet carve-out for zero-code stories |
| `.claude/agents/sonnet-implementer.md` | lazy canon reads; red/green loop → `test:quiet` |
| `docs/templates/maintenance-sub-loop.md` | bound the four `gh` bash-fallback calls; add a parenthetical to the MCP-alternative note (line 10) to bound MCP list calls too (`per_page`) |
| `.claude/commands/story-status.md` | add `--limit` to `gh pr list` |

**gh-bounding table:**

| File:line (pre-edit) | Current | Bounded |
| --- | --- | --- |
| `plan-reviewer.md:23` | `gh issue list --state open` | `gh issue list --state open --json number,title,labels --limit 50` |
| `code-reviewer.md:24` | `gh issue list --state open` | `gh issue list --state open --json number,title,labels --limit 50` |
| `code-reviewer.md:23` | `gh pr diff <N>` | **unchanged** — diff is the input (documented exception) |
| `maintenance-sub-loop.md:9` | `gh pr list --state open --draft --base main` / `gh issue list --state open` | add `--json number,title,headRefName --limit 50` / `--json number,title,labels --limit 50` |
| `maintenance-sub-loop.md:13` | `gh pr list --state open --json headRefName` | add `--limit 50` |
| `maintenance-sub-loop.md:15` | `gh issue list --state open --limit 50` | add `--json number,title,labels` |
| `maintenance-sub-loop.md:16` | `gh pr list --state open` | add `--json number,title,isDraft --limit 50` |
| `story-status.md:2` | `gh pr list --state open --json number,title,headRefName,isDraft` | add `--limit 30` |

## Acceptance scenarios

Harness prompt/config edits, not domain logic. There is no new executable code path to unit-test;
the observable behaviour is the `test:quiet` reporter output and the spec/template text. Scenarios
map to the verification steps below (manual reporter check + `grep` assertions on the edited text),
not to new vitest tests.

**Phase-4 R5 note (Phase-2 adopted):** the code-reviewer's R5 Gherkin-to-test mapping audit expects
a test file per scenario. For this zero-code story there are none — R5/R6 evidence is the
verification-step grep/manual checks, not vitest cases. Phase 4 maps each scenario to its
verification-plan step below rather than flagging missing tests.

**Scenario A — quiet reporter preserves failure detail**
```gherkin
Given the test suite with a deliberately failing property test
When npm run test:quiet executes
Then passing tests emit dots (no per-test verbose lines)
And the failing test's full error block — including the fast-check shrunk counterexample — prints verbatim
And the run summary prints
fails if: --reporter=dot suppressed the counterexample or failure diff (would blind the
red-step diagnosis the TDD loop depends on). Verified manually: invert one assertion in
tests/unit/infra/crypto/node-hash-fn.test.ts, run test:quiet, confirm counterexample verbatim, revert.
```

**Scenario B — no wholesale canon read survives in the specs**
```gherkin
Given the three edited agent specs
When grep scans them for whole-file canon-read instructions
Then no spec instructs reading docs/prd.md or docs/epics.md in full
And plan-reviewer targets the cited FR/NFR and epic via Grep
fails if: a spec still bulk-loads prd.md/epics.md (the dominant token sink this story removes).
Verified: grep -n "prd.md\|epics.md" .claude/agents/*.md and read-through.
```

**Scenario C — every gh list call is bounded**
```gherkin
Given the edited specs, templates, and commands
When grep scans for gh pr list / gh issue list invocations
Then every list call carries --json <fields> and --limit N
And only gh pr diff remains unbounded (diff is the input)
fails if: an unbounded gh list call ships (unbounded output re-enters agent context).
Verified: grep -rn "gh \(pr\|issue\) list" .claude/ docs/templates/.
```

## Sizing & commits — R16 collapse

Zero product-behaviour change (harness prompts + one script alias to a built-in reporter → no new
logic, no test surface, consistent with the repo's other untested npm-script aliases). Per **R16**,
the base collapse is **3 change-body slices** — the `feat(agent)` change + the empty `refactor:` slot
+ `chore(retro)` — plus an **optional 4th body slice when the change spans process *and* docs**.
This story spans both (agent-spec prompt behaviour *and* config/template/command docs), so the 4th
slice applies: **4 change-body commits total**. The preparatory `chore(docs)` commit is authored
before Phase 3 and **not** counted.

Preparatory (not counted per R16):
- **P0:** `chore(docs): story-h5 plan + P1/P2/P3 review [story-h5]`

Change-body commits (3 base + 1 optional):
1. **C1** (base — process): `feat(agent): story-h5 — section-anchored canon reads + test:quiet red/green loop [story-h5]` (3 specs)
2. **C2** (optional 4th — docs/config): `chore(build): story-h5 — add test:quiet + bound gh output in templates/commands [story-h5]` (package.json, maintenance-sub-loop.md, story-status.md)
3. **C3** (base — empty refactor): `refactor: story-h5 — empty slice, no behaviour change [story-h5]`. **R11 body text:** "No structural cleanup surfaced: this story ships only prompt/config text edits, each already minimal at authoring time; there is no just-written production code to refactor. Empty slot recorded to preserve the TDD-rhythm sequence (R11)."
4. **C4** (base — retro): `chore(retro): story-h5 retrospective + status fragment [story-h5]`

**`test:quiet` smoke-test call (Opus, Phase 2):** not worth an automated test *within* this story —
running vitest-in-vitest is heavy/brittle and a `package.json` string-equality assertion is a
tests-the-literal anti-pattern. R16 collapse stands; a proportionate harness-tier guard is deferred
to [#147](https://github.com/xavierbriand/accounting/issues/147).

## R16 vs R13 — why R16 applies

R13's 6–10 envelope covers stories delivering new observable behaviour as TDD slices (story-h4's
two CLI tools). story-h5 ships no new logic — `test:quiet` is a one-line alias to a built-in
reporter, the rest is prompt/doc text. That is the zero-behaviour-change case R16 exists for.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| `dot` reporter truncates or reformats the fast-check counterexample | Scenario A verifies verbatim preservation with a real broken property test before merge |
| Scoped reads cause a sub-agent to miss a canon rule it should have checked | Findings-rate proxy tracked in retro (Phase-4 findings unchanged = quality preserved); lazy reads keep the *same* section content, only defer/target the load |
| A bounded `--json` field set omits a field an agent needs | Field sets chosen to match what each call's consuming step reads (number/title/labels for issues; +headRefName/isDraft for PRs) |
| `docs/templates/plan-template.md` referenced by preflight is missing | Pre-existing gap, out of scope; this plan modeled on story-h4.md. Noted for a future maintenance story |
| Plan outweighs diff (Module 5 heuristic) | Expected — this is a small-diff process story; `metrics:loop` will flag the weight ratio and the retro will contextualize it as inherent to prompt-editing stories |

## Verification plan

1. **Reporter:** `npm run test:quiet` → dots + summary, no per-passing-test verbose. Then invert one
   assertion in `tests/unit/infra/crypto/node-hash-fn.test.ts`, rerun, confirm the fast-check
   counterexample prints verbatim in the failure block; revert.
2. **Scoped reads:** `grep -n "prd.md\|epics.md" .claude/agents/*.md` → no wholesale-read
   instruction remains; read-through confirms phase-lazy targeting is coherent.
3. **gh bounding:** `grep -rn "gh \(pr\|issue\) list" .claude/ docs/templates/` → every list call
   carries `--json` + `--limit`; only `gh pr diff` unbounded.
4. **Gate:** `npm run lint && npm run build && npm test` green locally; CI green on the PR.
5. **drift-scan:** `npx tsx harness/drift-scan/drift-scan.ts` → exit 0 on this plan (no
   Production-code-surface source paths to probe; § 8 unchanged unless the retro adds an R-tag).
6. **Measurement (retro):** `npm run metrics:story -- h5` + `npm run metrics:loop`; compare per-story
   context tokens against a recent baseline story; success = measurable drop at unchanged Phase-4
   findings rate. Recorded in the retro.

## DoR checklist

- [x] Phase 1 (plan) complete
- [x] Phase 2 (plan-reviewer + sibling-overlap, launched in parallel in a single message) — complete 2026-07-02; all findings tagged below
- [x] Phase 3 (Sonnet implementation) — complete 2026-07-02; C1/C2/C3 landed, gate green (689/689, drift-scan exit 0)
- [x] Phase 4 (code review + refactor) — complete 2026-07-02; code-reviewer returned 0 blocking findings, 3 soft suggestions (all acknowledged)
- [ ] Phase 5 (retrospective) — merge gate (§ 7 DoD item 11) remains with the user

## Suggestion log

Phase 2 run 2026-07-02: `sibling-overlap` + `plan-reviewer` launched in parallel in a single
message. `sibling-overlap` returned clean (see below). `plan-reviewer` **stalled at the 600s stream
watchdog on its first two attempts** (each while finalizing — a context-bloat stall that itself
validates this story's motivation); a third run with a leaner, pre-loaded prompt completed and
returned 19 findings (9/15 rule-tags apply). Its findings are reconciled below — corroborating the
inline-drafted rows and adding six sharper ones. The stall is logged as a retro Change item
(candidate: point the review agents at this story's own scoped-read pattern once it lands).
Pass-confirmations are not repeated; substantive findings are tagged.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | R5/R6 Gherkin-to-test mapping does not apply cleanly — this zero-code story has no vitest tests; the 3 scenarios map to manual reporter check + `grep` assertions. Phase-4 code-reviewer's R5 audit will find no test files. | adopted | Acceptance-scenarios preamble states R5/R6 evidence = verification-step grep/manual checks, not vitest cases; Phase-4 note added below |
| P1 | R16 collapse sizing (4 change-body commits) correct? | acknowledged | Confirmed: `test:quiet` is a one-line alias to a built-in vitest reporter — no logic, no test surface, consistent with the repo's other untested npm-script aliases. R16 applies; R13 does not. |
| P1 | R3 tool-bundle import audit — does `test:quiet` add a dependency? | acknowledged | Confirmed R3-clean: `--reporter=dot` is a built-in vitest reporter; `grep reporter package.json` empty, no new dep |
| P2 | Scoped/lazy canon reads risk a sub-agent skipping a rule it must check | adopted | Implementer must preserve each spec's inline P1/P2/P3 walk **checklists verbatim** — only the upfront "read the whole doc" *backing* instruction becomes section-anchored/lazy. The checklists already enumerate every sub-question; the canon read is confirming detail. |
| P2 | code-reviewer plan-section scoping might starve a check that needs another section | adopted | Scope worded as "**primarily** Acceptance scenarios (R5), Production-code surface (R2), suggestion log — consult other sections as a specific check requires"; commit-subject/refactor checks (R9/R11/R12) draw from git, not the plan |
| P3 | Bounded `--json` field sets adequate for consuming steps? | acknowledged | Verified: `labels` present (deferred-suggestion detection), `headRefName` (id-uniqueness), `title` (overlap judgement), `isDraft` (PR state). No consuming step is starved. |
| P3 | CI `npm run test:harness` / drift-scan interaction with touched scripts | acknowledged | No interaction: `test:quiet` is new and uncalled by CI; no `harness/` script touched; drift-scan probes Production-code-surface paths, all of which exist. § 8 unchanged. |
| P3 | Preparatory commit must carry the P1/P2/P3 review (R16 shape) | adopted | The pushed `chore(docs): story-h5 plan` commit is amended before Phase 3 to append this suggestion log and retitle to `… plan + P1/P2/P3 review` |
| Sibling | Any open PR/issue contends for `test:quiet`, the agent read-blocks, or gh-bounding surface? | acknowledged | `sibling-overlap`: none. Only open PR is this story's #146. #144 (next arc story) uses disjoint TS scanners; #111 unscheduled, different files; no Dependabot pending. |

_Additional findings from the third (completed) `plan-reviewer` run:_

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | `code-reviewer.md`'s own R5 bullet (spec line 33) says "locate a test file/case in the diff" with no carve-out for grep/manual evidence — so the plan's Phase-4 R5 note relies on behaviour the code-reviewer's *own spec* doesn't describe. | adopted | Since this story already edits `code-reviewer.md`, add a carve-out to its R5 bullet: for zero-code/process stories, R5 evidence may be the verification-step grep/manual checks named in the plan's Acceptance-scenarios preamble. In-scope and self-dogfooding. Added to §2 scope + Production-code surface. |
| P2 | Lazy-read design is **circular** — if the canon section is read only "when a candidate finding surfaces," the read that would surface the finding never triggers. | adopted | Reworded: each spec reads the section(s) its phase covers **unconditionally at walk entry**, not gated on suspicion — lazy per-*phase*, not per-*finding*. Removes the circularity while still avoiding the upfront bulk load. |
| P3 | `test:quiet` has **no automated regression guard** — CI runs `npm test` (default reporter), not `test:quiet`; a silent breakage would degrade every future story's red-step diagnosis. This is the plan's own "behaviour worth a smoke test?" escalation input. | deferred | Opus judgment: not worth a vitest-in-vitest smoke test (heavy/brittle) or a string-equality assertion (tests-the-literal) *within* this R16-collapse story. Filed [#147](https://github.com/xavierbriand/accounting/issues/147) for a proportionate harness-tier guard (possibly folded into #144). R16 collapse stands. |
| P3 | R11 empty-refactor slot (C3) names the tag but the plan doesn't draft the commit-body **justification text**. | adopted | Justification drafted in the Sizing section (C3 body). |
| P3 | R16 "4 change-body commits" asserted without walking the **base-3 + optional-4th** arithmetic R16's text specifies. | adopted | Sizing section restates: 3 base slices (feat(agent) + empty refactor + retro) + 1 optional 4th (build/config) triggered by the process-and-docs span. |
| P3 | `maintenance-sub-loop.md` line 10 offers **MCP list tools** as a `gh` alternative; those have their own default page sizes, and Scenario C's `grep "gh …"` won't catch an unbounded MCP call. | adopted | Add a parenthetical to the MCP-alternative note: bound MCP list calls too (`per_page`) — same context-diet intent. Cheap, on-goal. |
| P1 | `.claude/commands/new-story-preflight.md` is a **fourth agent-facing spec** not in the plan's file list. | acknowledged | It issues no canon-doc read and no `gh` list of its own (it points to `maintenance-sub-loop.md` and copies the template) — nothing to scope or bound. Out of scope; noted here for completeness. |

**Phase 4 — code-reviewer findings (2026-07-02).** 0 blocking P1/P2/P3 findings; 3 soft suggestions.
Checklist-preservation verified byte-identical against `origin/main` (only read-blocks + the planned
R5 carve-out changed); Scenarios B/C re-verified by the reviewer's own greps; R11 body verbatim;
R12 + commit-grouping correct. Rule-tags: R2/R5/R6/R11/R12/R16 apply and pass.

| # | Finding | Class | Resolution |
| --- | --- | --- | --- |
| S1 | MCP-alternative parenthetical is prose-only; Scenario C's `grep "gh …"` can't verify MCP-path compliance | acknowledge | Pre-acknowledged Phase-2 caveat; the grep-reach gap is inherent to bounding a non-shell call. No new action. |
| S2 | No `test:harness:quiet` composing the quiet reporter with `vitest.harness.config.ts` | acknowledge | YAGNI — the sonnet red/green loop uses product tests (`npm test`), not harness tests; no current consumer. Retro Try candidate if a future story wants it. |
| S3 | Plan outweighs diff (Module 5 heuristic): ~284-line plan vs ~32-line functional diff | acknowledge | Pre-named in the Risks table; inherent to prompt-editing stories. Contextualized in the retro. |
