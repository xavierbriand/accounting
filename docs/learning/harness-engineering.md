# Harness engineering — learning curriculum

> **Non-product initiative.** Skill development on agentic engineering and Claude Code harness craft, treated separately from the product roadmap.
>
> Tracking issue: see GitHub issue with label `scope: harness-engineering` and title "Harness engineering curriculum (umbrella)". Sub-issues: one per module.
>
> **See also:** [spdd-comparison.md](spdd-comparison.md) — comparison of this loop against Structured Prompt-Driven Development (Fowler/Zhang), with curriculum-delta proposals folded into module sub-issues.

## How to use this doc

Read Part A (audit) and Part B (mental model) once, in order. Then pick a module from Part C and ship it as its own PR closing its sub-issue. Don't try to do all six in a session — the curriculum is sequenced cheapest-first so each module gives early signal.

Scope guardrail: **Anthropic-native primitives only** — Claude Code (the harness) and the Claude Agent SDK (the kit for building harnesses). LangChain / LangGraph / agent-framework are explicitly out at this scale. The two distinctions to internalize:

- **Claude Code** = the *harness already in use* on this repo. Hooks, skills, slash commands, sub-agents, MCP, plan mode.
- **Claude Agent SDK** = the *programmable runtime* you reach for to build, e.g., the eval harness in Module 4 — running plan-reviewer headlessly against fixtures, capturing structured output, asserting findings. Same primitive set as Claude Code, exposed as a TypeScript / Python library.

The end-state evaluation isn't "I shipped six modules." It's **a colleague forks the starter template (Module 6) and ships their first story without me in the loop.**

---

## Part A — Audit verdict (this repo as of 2026-04-29)

### Doing well (these are not common; lead with them when teaching)

- **Agent specialization with restricted tools.** plan-reviewer / code-reviewer / sonnet-implementer each have a tight tool list and a precise spec. Most teams build one "do-everything" agent. ([.claude/agents/](../../.claude/agents/))
- **Rule-provenance table (R1–R19).** Every process rule traces to the retro that birthed it. Real workflow version control. ([CLAUDE.md § 8](../../CLAUDE.md))
- **Plan-as-contract.** Per-story plan files in [docs/plans/](../plans/) are the artefact reviewers audit against. The Phase-4 retro-check uses the plan as ground truth. Rare.
- **Canon-doc layering** (architecture / engineering-standards / quality-assurance / security-checklist) with explicit precedence. Reviewers route to the right doc instead of arguing.
- **Phase-4 retro-check has measurable ROI.** maint-01 and 2.5 retros document concrete bugs caught (timeout removal, TOCTOU race, missing Gherkin mapping). Not theatre.
- **Honest deviation reporting** in [.claude/agents/sonnet-implementer.md](../../.claude/agents/sonnet-implementer.md) §4. Most agent specs assume perfection; yours plans for what happens when implementation goes off-script.

### Doing OK but under-leveraging

- **Settings/permissions** — only an allowlist of bash/git/gh patterns. Functional but minimal.
- **Sequential agents only.** Phase 2 then Phase 4. Independent checks (security walkthrough, Gherkin-mapping audit, doc-drift scan) could parallelize.
- **No story dashboard.** Plans, retros, status fragments all exist; no single index that joins them.

### Doing wrong / risk areas

- **Process cost ≫ story value for tiny stories.** maint-01 = 21 type errors fixed via a 276-line plan + full 5-phase gate + 7 commits. R16 collapses commits but the *gates* still run. No formal ratio guard.
- **DoD item 10 is hand-policed.** [docs/retrospectives/README.md](../retrospectives/README.md) mentions a drift-scan that doesn't exist. Story-2.5 added a shim rule to sonnet-implementer.md and not to § 8 — exactly the drift the rule was meant to prevent.
- **"Deviations" boundary in sonnet-implementer is fuzzy.** "Judgment-call vs structural" lacks worked examples; a Sonnet executor will guess differently than a human would.
- **Rule R4 (composition-root subprocess test) has no template.** A one-line invocation of a concept that needs a worked example to be teachable.

### Missing (the eval/measurement gap)

- **No prompt versioning.** Agent .md files mutate without a changelog.
- **No quantitative retro signal.** Loop metrics live as raw text in 16+ retros and are never aggregated.
- **No agent-output evals.** Zero golden tests for plan-reviewer / code-reviewer.
- **No cost/token telemetry.** No statusline metric, no JSONL session log parsing, no per-story budget.
- **No CI gate on agent-spec changes.** Editing `code-reviewer.md` triggers nothing.
- **No sibling-overlap detection at plan time.** R19 says "check open PRs/issues" — manually.

---

## Part B — Mental model

### Principles (memorize; the rest follows)

1. **Harness ≠ model.** The model is the engine. The harness decides *what context the engine sees, when, and what it can do with the output*. The leverage is in the harness.

2. **The agent's epistemic position is the primary design constraint.** *The agent only sees what you put in context. It cannot peek at the rest of the system. It cannot ask later.* Every harness decision — plan files, sub-agents, CLAUDE.md indirection, structured tool output — is a response to this single fact. Internalize it and the other principles fall out.

3. **Explicit state vs hidden state.** Explicit = greppable, versionable, diffable: CLAUDE.md, plan files, retros, agent specs, hook scripts. Hidden = ephemeral, unrecoverable: conversation context, tool-result memory, hook side effects. Most failures come from confusing the two — treating a hidden context as if it were a file. Rule of thumb: if it isn't in git, the next session won't see it.

4. **Context is a budget, not a window.** Every token displaces another. Sub-agents, file references, and `docs/` indirection are budget tools. CLAUDE.md being 165 lines (not 1500) is a *design decision*.

5. **Reversibility dictates autonomy.** Reading: free. Editing: cheap (git). Pushing: medium. `gh pr merge`: irreversible. Permission gates and approval points should mirror the blast-radius gradient.

6. **Specs are code; agents are functions.** A `sonnet-implementer.md` change is a deploy. It deserves a changelog, a test, and CI. Today this repo has none of those — this is the core gap.

7. **Rules crystallize the *current model's* failure modes.** R8 (mock diversity) fixes a class of mistakes Sonnet 4.5 made. Sonnet 4.6 may not. Without periodic *rule-expiry review*, the workflow accretes cargo-cult overhead. **Action: every 6 months, walk R1–R19 and ask "is this still load-bearing?"** Retire what isn't. This is harder than adding rules and twice as important.

8. **Evals are not optional once the harness gates production.** If `code-reviewer` decides whether refactors land, a silent prompt regression silently regresses the codebase. The eval suite for agents *is* the test suite for the test suite.

9. **Retros are training data.** Each Keep/Change/Try is a labelled (input → outcome → judgment) tuple. The dataset is already being produced; aggregating it is a one-day script.

### A concrete weight-ratio heuristic

> **If the plan doc is longer than the diff, the gate is too heavy.**

Compare LOC for the next 5 stories. If the plan exceeds the diff three times in five, the workflow is buying insurance it doesn't need.

### Cache TTL (a tactic, not a principle)

Anthropic prompt cache is 5 min. Sleeps of 270s stay warm; 300s misses. Sub-agent calls break parent cache. File this under "things to know," not "things to internalize."

### Failure signatures to learn to spot

These are the silent-degradation patterns to teach a colleague to recognize. Each has a fingerprint in the existing retros — mine them.

| Signature | What it looks like | Where to look in retros |
| --- | --- | --- |
| **Lying summary** | Agent reports "all tests green," but didn't run them; or reports "fixed X" while X is unchanged | sonnet-implementer §4 deviations rules exist precisely to expose this |
| **Helpful-but-wrong fix** | Agent fixes the symptom, not the cause; tests pass via altered assertion, not corrected behaviour | story-2.4 retro (R8 origin) — hardcoded-default assertion masking the bug |
| **Coincidence-pass** | Test passes because of unrelated state (fixture reuse, environment leakage, mock too permissive) | R7 (test-mechanism honesty) was born here |
| **Safeguard removal** | Agent removes a guard to make a test green, doesn't flag it | sonnet-implementer §4 "safeguard-removal" sub-case |
| **Shim creep** | Optional parameter or fallback added "to make tests pass," now permanent production behaviour | R-pending shim rule (story-2.5 retro action B) |
| **Over-eager generalization** | One concrete need triggers a configurable framework | hits in maint-* retros — easier to spot in diffs than in summaries |
| **Plan-execution drift** | Agent solves a different (often simpler) problem than the plan named, then writes a plausible report | R5 Gherkin-to-test mapping audit catches this class |
| **Cargo-cult guard** | A rule survives long after its model-version trigger is gone | Principle 7 above; no current detector |

A talk on agentic engineering that names these by signature is a much better talk than one that lists tools.

---

## Part C — Curriculum (6 modules, ordered cheapest-first)

Each module: **goal · concepts · exercise in this repo · teach-back checkpoint.** Each ships as its own PR closing its sub-issue.

> **Priority ranking.** Modules 4 (evals) and 5 (cost/telemetry) directly close the stated weak spot. Modules 1–3 are quick wins that close DoD drift, build primitive fluency, and right-size the gate. Module 6 is the teach-out. Don't skip 1–3 (they're cheap and give momentum), but if time runs out, ship Module 4.

### Module 1 — Drift-scan automation *(cheapest, highest-ROI, builds early momentum)*

- **Concept:** the difference between a *rule* and an *enforcement*. Static analysis on docs.
- **Exercise:** build `scripts/drift-scan.ts` (run via `tsx`) that:
  1. Greps `docs/retrospectives/*.md` for `\bR[0-9]+\b`.
  2. Greps `CLAUDE.md` § 8 for the same.
  3. Reports rules referenced in retros but not in the table (and vice versa).
  - Wired three ways: (a) a `vitest` unit test for the parser to keep it honest; (b) a CI step in `.github/workflows/`; (c) a Claude Code `PostToolUse` hook on `Edit` of `docs/**/*.md` so a stale reference is caught at write time.
- **Teach-back:** "the drift you can grep for is drift you should never write down twice." Paired with the diff that catches the story-2.5 missing § 8 row retroactively.

### Module 2 — Claude Code primitives, by niche

- **Concept:** every primitive has a niche — when does each *and only it* solve the problem?

| Primitive | Niche (when it's the right answer) |
| --- | --- |
| **Slash command** | A reusable invocation a *human* types. Self-contained. No silent triggering. |
| **Skill** | Domain knowledge the *model* loads when relevant. Triggered by topic, not command. |
| **Hook** | An *automated* response to a tool event the user shouldn't have to type. Side-effects on the harness, not the model. |
| **Sub-agent** | A *context-budget* tool. Spin up when the work would pollute the parent's context with intermediate results. |
| **MCP server** | An *external system* you want exposed as tools. Not for in-repo logic — that's a hook. |
| **Statusline** | Persistent state the user wants visible *between* turns (cost, branch, last test result). |
| **Output style** | Format-of-response control — when default markdown is wrong for the audience. |
| **Permission mode** | Blast-radius gradient (Principle 5) made operational. |

- **Exercise:** add **one of each** to this repo, choosing the example that fits its niche:
  - **Slash command** `/story-status` — summarises in-flight stories from `docs/status.d/`.
  - **Skill** packaging the "open a new story" preflight (branch + worktree + plan template).
  - **Hook** `Stop` running `npm run lint` on changed files; result to statusline.
  - **Statusline** showing `branch · last-test-status · current-story-id`.
  - **Sub-agent parallelism** — run the Phase 2 plan-reviewer and a sibling-overlap audit (Module 3) concurrently; first time the workflow has parallel agents.
  - **MCP server** for read-only GitHub (PR/issue lookup) so the maintenance sub-loop stops shelling out.
- **Teach-back:** for each primitive, a one-sentence "use this when, not that" — the niche table above, populated from the additions made.

### Module 3 — Right-sizing the gate

- **Concept:** load-bearing weight ratio (Principle § Heuristic). Ceremony tax.
- **Exercise:** propose a CLAUDE.md amendment introducing a **trivial-story lane** (≤20 LOC, single file, no Core/DB/Infra touch): plan-doc-in-PR-template, skip plan-reviewer, code-reviewer only, target 3 commits. Add as the next R-tag with a **retroactive maint-01 comparison** showing the savings. Pair with a sibling-overlap detector that runs at plan time (greps in-flight stories from `docs/status.d/`).
- **Teach-back:** "every gate has a cost — and rules expire" (Principle 7). Walk R1–R19 and tag each as *load-bearing now / candidate for retirement / unverified*.

### Module 4 — Eval-driven agent engineering + prompt engineering *(centerpiece)*

This is the largest module and the one most worth studying carefully. It also has the most ways to do badly.

#### 4a. Prompt engineering as an explicit discipline (precondition for evals)

You can't eval prompts you can't read. Before fixtures, refactor agent specs for:

- **XML structure.** `<role>`, `<inputs>`, `<process>`, `<output_format>`, `<examples>` — Anthropic-native, model-friendly, diff-friendly.
- **Examples beat instructions** for output shape. A two-row table demonstrating a finding format is worth a paragraph describing it.
- **Elicit reasoning sparingly and explicitly.** Plan/code reviewers benefit from a thinking pass before the structured output; the sonnet-implementer often doesn't.
- **Tag versioning at the top of each agent spec** (`spec-version: 2026.04.1`), bumped any time the eval set's expected output would change. This is the one rule that makes 4b possible.

Refactor target: rewrite [.claude/agents/plan-reviewer.md](../../.claude/agents/plan-reviewer.md) once, applying these. Use the diff as the teaching artefact.

#### 4b. Evals: the choices that matter

Don't reach for tooling first. Decide the design questions explicitly. Each has a sharp tradeoff.

| Decision | Options | Tradeoff |
| --- | --- | --- |
| **Assertion style** | (a) exact-match strings, (b) structured-output schema validation, (c) rubric grading, (d) LLM-as-judge | Brittleness vs flake vs cost. For *findings* output: (b) + (c). For *prose* output: (d) with a strong judge prompt and pinned model. |
| **Determinism budget** | temperature 0 + n=1; or temperature 1 + n=5 averaged | t=0 is reproducible but masks fragility; t=1×n is realistic but expensive. Pick t=0 for CI gates, t=1×n=3 for monthly stress tests. |
| **Acceptance threshold** | Pass/fail per fixture; or score ≥X across the set | Pass/fail catches regressions; aggregate score lets you accept "improvement on average." Use both: per-fixture in CI, aggregate in monthly review. |
| **Fixture provenance** | Hand-crafted; mined from real retros; both | Real-retro fixtures are higher signal but couple evals to history. Hand-crafted fixtures stress-test edge cases nothing has hit yet. **Both.** |
| **Golden migration** | When a spec change legitimately moves an expected finding, how does the golden update? | Goldens get a `spec-version` field; eval assertions are scoped to a version range; a spec bump requires a paired golden update commit. Gate this in CI. |
| **Cost ceiling** | Eval runs cost real money | Pin a per-CI-run dollar cap; print it; alert if breached. Cache prompt prefix aggressively. |

#### 4c. Contrarian beat (read first)

For a single dev with 16 stories, **the marginal value of an eval suite for plan-reviewer may be lower than a quarterly walk of the rule table** (Principle 7) catching stale rules. Evals are unconditional good *only* when (a) collaborators will edit specs, or (b) a real silent regression has been experienced. If neither, ship a smaller version: **3 fixtures, vitest test, no CI gate yet**, and revisit after drift is observed. Don't build the cathedral before it's needed.

#### 4d. Exercise

Build `evals/plan-reviewer.test.ts` using the **Claude Agent SDK** (TypeScript) with **3 fixtures to start**:

1. A plan missing R2 production-code-surface section *(known-good agent should flag)*.
2. A plan with a Gherkin scenario lacking a test mapping *(known-good agent should flag)*.
3. A plan that's clean *(known-good agent should pass)*.

Choose **assertion style (b) structured-output schema validation** + **(c) rubric grading on the explanation field**. Run at temperature 0, n=1, in a vitest suite. Skip CI gating until a real prompt-edit creates a regression you wished you'd caught — *then* gate.

#### 4e. Teach-back

Live-demo: edit `plan-reviewer.md` to introduce a deliberate regression (drop the R2 check). Re-run evals. Show fixture 1 going red. Revert. Show green. **This 90-second loop is the punchline of any agentic-engineering talk.** Build it; rehearse it.

### Module 5 — Cost & telemetry as a *retro aid*, not a *trend chart*

- **Concept honesty.** With n=16 stories and rules that change what gets checked, you cannot get a clean trend. Confounders dominate: rule scope shifts, story difficulty varies, the underlying model upgrades. Telemetry's value here is **case studies and counterexamples**, not statistics. Specifically: making future retros easier to write, and *finding outlier stories* (a story that took 3× the median cost is a retro prompt, not a regression).
- **Exercise A — cost per story.** Parse session JSONL (or the project's session dir) and join Claude Code session timestamps to git commit timestamps. Output `docs/metrics/<story-id>.md` with cost, token usage, sub-agent calls. Drop into the retro template as a starting field — "this story cost $X, surprises?"
- **Exercise B — loop metrics extraction.** Scrape every retro's "Loop metrics" section into `docs/metrics/loop.csv` (story-id, plan-LOC, diff-LOC, commits-planned, commits-actual, phase-4-findings-by-severity, tests-added, deviations). Don't draw a chart. Instead: **sort by ratio of plan-LOC to diff-LOC and find the three worst weight-ratio offenders.** Each is a free retro topic.
- **Teach-back:** "the chart isn't the talk. The outlier list is." Show the three stories where the workflow was over-engineered for the task. Show what changed afterward.

### Module 6 — Teach-back, evaluated by colleague-ships-without-you

- **The real evaluation:** *a colleague forks the starter template and ships their first story without me intervening.* That is the end-state test. A talk and a glossary serve it.
- **Starter-repo template (the load-bearing artefact).** Strip this repo to a teachable seed. **What's removed is more interesting than what stays:**
  - Removed: domain code (couples-expense), 16 retros, 28 plans, R1–R19, the canon docs.
  - Kept: `.claude/agents/` (3 specs, generic-ified), CLAUDE.md skeleton with placeholder sections, `scripts/drift-scan.ts`, `evals/` with one fixture, a `PR_TEMPLATE` with the 10 DoD items, a `docs/templates/` for plan + retro + status fragment.
  - Added: a `STARTER.md` with the *first three steps* a colleague takes after forking. Not "read these 12 docs."
- **Talk outline (45 min).** Six sections, each grounded in *one* repo file as evidence:
  1. Harness ≠ model · agent epistemic position. *(Evidence: CLAUDE.md size discipline.)*
  2. Specialization with restricted tools. *(Evidence: `.claude/agents/` specs.)*
  3. Rules from retros, with expiry. *(Evidence: § 8 table + Principle 7.)*
  4. Failure signatures (the table from Part B). *(Evidence: 2–3 retros where one was caught.)*
  5. Evals as the test suite for the test suite. *(Evidence: live demo from Module 4e.)*
  6. The starter template hand-off. *(Evidence: forked repo on screen.)*
- **Glossary (one page).** harness · agent · skill · hook · MCP · sub-agent · permission mode · plan mode · prompt cache TTL · explicit/hidden state · blast radius · reversibility · DoR/DoD · eval · golden · spec-version · drift-scan · weight ratio · failure signature.

---

## Part D — Critical files / artefacts

- [.claude/agents/plan-reviewer.md](../../.claude/agents/plan-reviewer.md) — Module 4a refactor target, 4b first eval target.
- [.claude/agents/code-reviewer.md](../../.claude/agents/code-reviewer.md) — Module 4 second eval target.
- [.claude/agents/sonnet-implementer.md](../../.claude/agents/sonnet-implementer.md) — Module 3 deviations worked-example anchor; Part B failure-signatures source.
- [CLAUDE.md](../../CLAUDE.md) — Modules 1 & 3 amendment targets (drift-scan rule, trivial-story lane).
- [docs/retrospectives/](../retrospectives/) — Module 5 raw signal source; failure-signature mining ground.
- [docs/plans/](../plans/) — Module 4d fixture quarry (real plans → known-good eval inputs).
- [.claude/settings.json](../../.claude/settings.json) — Module 2 hook + permission edits.

### Reading list (one canonical pick per topic, opinionated)

- **Harness primitives:** Anthropic docs → Claude Code section. Read it end-to-end once. Skip third-party tutorials until the source is read.
- **Building harnesses programmatically:** Anthropic docs → Claude Agent SDK. The TypeScript quickstart fits this repo's stack.
- **Agent design first principles:** Anthropic engineering blog → "Building effective agents." This is the one essay to read. Cite it in the talk.
- **Context engineering:** Anthropic engineering blog → "Effective context engineering." Read second.
- **Eval design:** Inspect Evals docs (Anthropic-affiliated). Skim only — borrow vocabulary, don't adopt the framework yet at this scale.
- **Lightweight eval tooling for solo scale:** promptfoo README, just enough to know what isn't being used.
- **Prompt engineering for Anthropic models:** Anthropic docs → Prompt engineering guide. The XML-tag and example-shaped-output sections are the load-bearing parts.

Skip until later: agent-framework / LangChain / LangGraph / CrewAI. Out of scope by design, and the abstractions hurt before they help at this scale.

---

## Part E — Verification (how to know you've levelled up)

The first five are intermediate; **the sixth is the actual evaluation.**

- ✅ Module 1: `scripts/drift-scan.ts` green; vitest unit on the parser; CI step enforced; PostToolUse hook in `.claude/settings.json`; one intentional broken rule reference catches in CI.
- ✅ Module 2: each primitive added with a one-sentence niche justification in its commit message; the niche table from Part C populated from your own work.
- ✅ Module 3: merged PR adding the trivial-story lane to CLAUDE.md, with retroactive maint-01 savings comparison; sibling-overlap detector running at plan time.
- ✅ Module 4: `evals/plan-reviewer.test.ts` green on 3 fixtures; one deliberate prompt regression detected by the suite; the 90-second live demo (4e) rehearsed.
- ✅ Module 5: `docs/metrics/loop.csv` populated retroactively; three weight-ratio outlier stories named; one retro rewritten using the data.
- ✅ Module 6 — **the real test**: a colleague forks the starter template and ships their first story without you intervening. If that doesn't happen, the curriculum hasn't landed.

End-state self-test: in one breath, without naming a vendor product, "**what is harness engineering, what's the smallest unit, and how do you know your harness is working?**"
