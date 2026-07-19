# CLAUDE.md

Instructions for Claude Code working on this repo. Read before changing code.

This file is an AI-facing cheat sheet. The authoritative canon lives under `docs/`:

- [docs/architecture.md](docs/architecture.md) — architectural decisions + target structure
- [docs/quality-assurance.md](docs/quality-assurance.md) — product-QA invariants (P2 review reference)
- [docs/engineering-standards.md](docs/engineering-standards.md) — how we build (P3 review reference)
- [docs/security-checklist.md](docs/security-checklist.md) — walkable attack-surface checklist (part of P3)
- [docs/prd.md](docs/prd.md) · [docs/epics.md](docs/epics.md) · [docs/product-brief.md](docs/product-brief.md)
- [docs/retrospectives/](docs/retrospectives/) — one Keep/Change/Try file per completed story

On conflict between this file and a `docs/` file, `docs/` wins. The retrospective phase reconciles drift.

## 1. Project

**Couples Expense Sharing App** — a local-first, CLI-based "predictive asset-based financial engine" for couples managing joint finances. Replaces reactive joint-account top-ups with a deterministic engine that predicts fair transfers, buffers volatility, and keeps an immutable ledger.

Current position: see [docs/status.md](docs/status.md). Refreshed by the retro of any story that ships an epic milestone or changes the "Next" line; routine merges drop a fragment under [`docs/status.d/`](docs/status.d/).

**Stack:** Node.js 24 LTS (floor: `>=22.12.0`, declared in `package.json` `engines`), TypeScript (strict), SQLite via `better-sqlite3` (WAL), `dinero.js`, `commander`, `zod`, `vitest` + `fast-check`.

## 2. Architecture

Full decisions in [docs/architecture.md](docs/architecture.md). Quick reference:

- Three layers, strict dependency rule. `src/core/` depends on nothing (no Node APIs, no `better-sqlite3`, no `commander`, no `process.exit`); `src/infra/` talks to the outside world via ports in `src/core/ports/`; `src/cli/` wires them together.
- **Constructor DI only.** No `new SomeRepo()` inside Core.
- **`Result<T, E>` in Core** — domain methods return `Result` values, never throw. CLI is the only place that inspects `result.isFailure`.
- **Append-only ledger.** No `UPDATE`/`DELETE` on ledger rows — corrections are new balancing entries.
- Port interfaces are PascalCase without an `I` prefix (`TransactionRepository`). Repositories map snake_case DB columns to camelCase domain fields at the boundary.
- **Domain model is explicit and user-owned.** Ubiquitous language in [docs/domain/glossary.md](docs/domain/glossary.md), strategic view in [docs/domain/context-map.md](docs/domain/context-map.md). Code identifiers use glossary terms; new domain vocabulary updates the glossary in the same PR (R25). Agents propose glossary/context-map deltas, never rewrite those files.
- **The dev harness is a second bounded context.** Its ubiquitous language lives in [docs/harness/glossary.md](docs/harness/glossary.md) (user-owned; agents propose, never rewrite — same rule as the product glossary), its control classification in [docs/harness/control-inventory.md](docs/harness/control-inventory.md). Strategic view: [docs/domain/context-map.md](docs/domain/context-map.md).

## 3. Money & precision (most-forgotten rules)

Full checklist in [docs/security-checklist.md](docs/security-checklist.md); product invariants in [docs/quality-assurance.md](docs/quality-assurance.md).

- **Never** use `+ - * /` on monetary values. Go through `Money` / Dinero methods. Banker's rounding everywhere.
- **Two-column storage:** integer cents (`INTEGER NOT NULL`) + ISO 4217 code (`TEXT NOT NULL`). Never a decimal.
- **Currency mismatch is a failure, not a warning** — `Money` ops across currencies return `Result.fail`.
- **Allocations** use Largest Remainder so `sum(parts) == total` to the cent. Property-test with `fast-check`.
- **Dates:** system events UTC; **transactions ISO 8601 with offset** (`2026-04-21T14:30:00+02:00`) to preserve "receipt truth".
- **Versioned rules** (splits, buffer targets) use the Validity Window pattern (`validFrom`; `validTo` is implicit — defined by the next window's `validFrom`, last window is open-ended).
- **PII** (IBANs, names, bank identifiers): redact in logs by default; never in test fixtures.

## 4. Style (cheat sheet → [engineering-standards.md](docs/engineering-standards.md))

- kebab-case files · PascalCase types (no `I` prefix) · camelCase vars · snake_case DB columns.
- **No `any`.** `strict: true`. Explicit return types on exports.
- **No comments** except non-obvious *why*. Names are the documentation.
- Functions under ~50 LOC, pure where possible. `@core/*` alias for cross-layer imports.
- Zod at every external boundary; never inside Core.

## 5. Testing (cheat sheet → [engineering-standards.md](docs/engineering-standards.md))

| Tier | Location | Purpose |
| --- | --- | --- |
| Acceptance | `tests/features/*.feature` + `steps/*.ts` | Outside-in BDD via `quickpickle` |
| Unit | `tests/unit/<mirror-of-src>/**/*.test.ts` | AAA, mock all Ports for Core |
| Property | colocated with unit | `fast-check` for financial invariants |
| Integration | `tests/integration/` | Real SQLite/FS |

- **100% branch coverage** on `src/core/`. Infra/CLI lower. Coverage targets apply to `src/`; `harness/` is exempt — the Dev Harness is its own bounded context (§ 2). Harness code is exercised by focused unit tests + one integration test per tool.
- **TDD rhythm (outside-in):** failing acceptance → failing unit → minimal green → acceptance green → refactor. See § 6.4 for commits.
- **Batch ingestion — two stages.** *Parse:* malformed rows skipped, reported individually; valid siblings proceed. *Commit:* valid rows in one SQL transaction — all-or-nothing. Authoritative policy in [docs/prd.md](docs/prd.md) and [docs/quality-assurance.md](docs/quality-assurance.md).

## 6. Development workflow

Two formal gates: **DoR** (phases 0–2 complete) · **DoD** (phases 3–5 complete, merge checklist — see § 7).

### Risk-based lanes

Every story is routed into one of three lanes at Phase 1, selected by risk surface, not by size. The lane is recorded in the plan (or, for Light stories, in the PR body — see the Light row below) and fixes that story's Phase-0 requirement, review-agent set, commit envelope, and plan-file location. Phases § 6.1, the commit convention § 6.4, story sizing § 6.6, and the DoR/DoD phase numbering are unchanged by lane selection — a lane only selects *which* existing envelope tag (R13/R14/R16) and *which* review agents a story invokes; no new envelope tag is minted.

| Lane | Trigger | Phase 0 | Phase 2 review | Phase 4 review | Envelope | Plan location |
| --- | --- | --- | --- | --- | --- | --- |
| **Full** | Touches `src/core/`, DB schema, or migrations | Required (if Core domain concept changes) | `plan-reviewer` + `sibling-overlap` | `code-reviewer` + `ddd-modeler` (Mode B, if model note) | R13 (or R14 adapter) | `docs/plans/story-<id>.md` |
| **Reduced** | Infra-only (`src/infra`/`src/cli`), behavior-changing `harness/` code, or any `.claude/agents`, `.claude/commands`, or skill spec | Skipped | `sibling-overlap` (plan-reviewer dropped) | `code-reviewer` + `sibling-overlap` | R13 (or R14 adapter) | `docs/plans/story-<id>.md` |
| **Light** | Docs/process/harness doc-only | Skipped | Skipped | `code-reviewer` only | R16 | Plan folded into the PR body |

A Reduced-lane story introducing a novel harness-domain concept may voluntarily run Phase 0 (precedent: story-ddd-2).

See § 8: **R26** lane provenance.

### 6.1 Phases

0. **Model** (user + Opus, `ddd-modeler` in support): for any story that adds or changes a Core domain concept, run the `model-session` skill — frame the domain question → `ddd-modeler` (Mode A) proposes 2–3 candidate shapes → converge with the user in dialogue → model note at `docs/domain/model-notes/story-<id>.md` (template: [docs/templates/model-note.md](docs/templates/model-note.md)) → user signs off glossary/context-map deltas (user authors those files; agents propose only). *Exit:* model note committed with the plan; glossary/context-map deltas staged on the same branch; the plan's `## Domain model` section derives from the note (R24). Stories with no model impact skip Phase 0 by declaring `No model impact — <reason>` in the plan (maint/process/docs stories qualify by default).
1. **Plan** (Opus): collect intent → converge → Gherkin → draft PR → hand off to Sonnet. Plan file at `docs/plans/story-<id>.md`. *Exit:* draft PR, sections 1–6 filled. Sub-rules (see § 8): **R2** production-code surface section · **R3** tool-bundle import audit · **R4** composition-root subprocess test when `program.ts` touched. (The plan file rides the R30 prep commit — formerly R1.)
2. **Critical review** (Opus, P1/P2/P3): invoke `plan-reviewer` sub-agent AND `sibling-overlap` sub-agent **in parallel** (single message, two Agent tool calls); consume both structured findings; tag each finding adopted/deferred/rejected in the suggestion log. Deferred → GitHub issue. *Exit (DoR):* both agents complete, no un-tagged suggestions, every deferred has an issue link.
3. **Implement** (Sonnet): failing acceptance → failing unit → green → structured report. *Exit:* tests green, branch pushed, PR in draft.
4. **Code review + refactor** (Opus): invoke `code-reviewer` sub-agent (`subagent_type: "code-reviewer"`) with the PR number and plan path — and, when the story has a model note, `ddd-modeler` (Mode B, model conformance) **in parallel** (single message, two Agent tool calls, same pattern as phase 2); consume the structured findings; classify each fix-now / defer-issue / acknowledge. Sub-rules (see § 8): **R5** Gherkin-to-test mapping · **R6** `fails if` honesty · **R7** test-mechanism honesty · **R8** mock diversity · **R9** trivial inline fix carve-out. *Exit:* refactor merged, CI green.
5. **Retrospective.** Keep/Change/Try at `docs/retrospectives/story-<id>.md`. New rules add a row to § 8. Try items are valid only as a same-PR edit (cite the file) or a filed issue (cite `#N`) — dod-check's advisory `try-unfunneled` finding checks this (story-h13); "next process-touching PR" is not a valid deferral. *Exit:* file committed. Merge user-gated.

#### Plan-mode verification (R32)

If an `ExitPlanMode` call errors at the transport layer, don't assume plan mode cleared — verify the harness's actual exit-confirmation arrived before dispatching subagents that need write tools. A stuck plan-mode flag does not necessarily block the main loop's own subsequent tool calls the same way it blocks a spawned subagent; it can surface only when that subagent (correctly) refuses to write code, citing plan mode as still active. Treat that refusal as authoritative — re-run `ExitPlanMode` for real and confirm the harness's own clearance message before resuming, rather than telling the subagent it's approved via a text message, which is not a valid channel for lifting plan mode.

### 6.2 Model tier

The split is **scan/execute (Sonnet) vs judge/decide (Opus)** — *not* "reviews are Opus." The review agents are pinned `model: sonnet` and produce *findings*; Opus consumes them and owns every *disposition* (adopt/defer/reject at Phase 2; fix-now/defer-issue/acknowledge at Phase 4). Each agent's tier is fixed in its `.claude/agents/*.md` frontmatter — that frontmatter is the source of truth.

- **Opus (main loop):** planning, disposition of review findings, refactor planning, retrospective synthesis, and the Phase-0 domain-modeling dialogue.
- **Opus agent — `ddd-modeler`** (`model: opus`): Phase-0 candidate model shapes (Mode A), Phase-4 model-conformance findings (Mode B).
- **Sonnet agents (scan/execute legs, all `model: sonnet`):** `plan-reviewer` (Phase-2 scan), `sibling-overlap` (Phase-2 + Phase-4 scan), `code-reviewer` (Phase-4 scan), `backlog-refiner` (backlog-hygiene scan), `sonnet-implementer` (implementation: failing tests, minimal green, refactor execution). All produce findings/code; none decide.
- **Haiku:** not used yet.

### 6.3 Sonnet return format

Full agent spec: [.claude/agents/sonnet-implementer.md](.claude/agents/sonnet-implementer.md) § 4. Seven sections, in order: `What was built` · `Red → green sequence` · `Deviations from plan` · `Gherkin coverage checklist` · `Unknowns encountered` · `Proposed follow-ups` · `Files touched`. Invoke with `subagent_type: "sonnet-implementer"`; frontmatter supplies the model. **New custom agents** added to `.claude/agents/*.md` require a session restart to register with the harness Agent tool. For same-session verification, invoke `general-purpose` with the spec file's contents inline as the prompt.

### 6.4 Commit convention

- `test(<scope>): <scenario> — failing` · `feat(<scope>): <scenario> — minimal green` · `refactor(<scope>): <what>`
- Story id in every subject. See § 8: **R11** empty refactor · **R12** summary verb · **R13** 6–10 commits/story · **R28** slice counting (green-on-landing `test:` commits, formerly R10, count as their own slices). Squash on merge optional.
- Docs commits: only the canonical prep subject and `chore(retro)…` are envelope-exempt (**R30**) — anything else carrying the story id counts as a slice.

### 6.4.1 Push protocol (parallel-safe)

- **One agent per branch.** Don't open a second session against a branch with an active session.
- **All work on a branch — never on `main`.** Story worktrees never push `main`. Main advances only via `gh pr merge`, gated by the user.
- **Before every push:**
  1. `git fetch origin`
  2. `git rebase origin/main` (or `git pull --rebase` if upstream is the story branch)
  3. If rebase reports **conflicts** → enter the Conflict-resolution protocol below. Do not auto-resolve.
  4. If rebase fails for **non-conflict reasons** (lockfile, detached HEAD, corruption, network failure mid-fetch, etc.) → stop, report the error verbatim to the user, ask before any recovery action (`git rebase --abort`, removing `.git/index.lock`, etc.). Never silently retry.
- **Push only the current branch:** `git push origin HEAD`. Don't use bare `git push` if local `push.default` is unset/`matching` — it can advance `main` unintentionally.

#### Conflict-resolution protocol

When a rebase conflict appears, the agent's reply must include three sections:

1. **Diagnosis** — for each conflicted file: which hunks conflict, who introduced the competing change (`git log --oneline origin/main -- <file>` and the local commit), classification *mechanical* (independent edits to a shared structure) vs *semantic* (same lines edited for different reasons).
2. **Suggested resolutions** — at least two named options each with the concrete edit. For mechanical conflicts on append-style sections (e.g. CLAUDE.md § 8 rule table): "(a) keep both, stack chronologically (or by tag id)" / "(b) drop ours and re-author after rebase if upstream supersedes." For semantic conflicts: name the trade-off. `--ours`/`--theirs` only when one side is unambiguously stale.
3. **Recommendation + question** — one-sentence pick with reason; explicit ask before applying.

If the conflict is on `docs/status.d/<file>` (rare — only if two retros pick the same `<date>-story-<id>` filename), the diagnosis must name that specifically and the Suggested-resolutions section must offer at least: **(a) rename the local fragment by appending `-b` to the story id** (e.g. `2026-04-28-story-B.md` → `2026-04-28-story-B-b.md`) so both fragments coexist verbatim; or **(b) merge the two fragment bodies into a single file** (rarely correct — only when the retros documented the same outcome).

### 6.5 Refactor-during-green policy

Local cleanups (rename, extract small helper, collapse literal) allowed while green if behaviour is preserved. Structural changes defer to refactor phase. Sonnet calls this out in the return report.

### 6.6 Story sizing

One PR per story. >~3 Gherkin scenarios or >1 Sonnet Task round → split. See § 8: **R14** adapter stories coarser slices.

Lane (Full/Reduced/Light — see § 6 "Risk-based lanes") is chosen at Phase 1 and recorded in the plan (or the PR body for Light stories); it does not change this sizing rule.

### 6.7 Maintenance sub-loop

Runs **at the start of each new planning session**, treating the check as a read-only snapshot — no blocking on sibling stories in flight. Run the [maintenance-sub-loop checklist](docs/templates/maintenance-sub-loop.md). **Zero-behaviour-change stories** (major bumps, process refreshes) collapse to 4 change-body commits — see § 8: **R16** (which absorbed the retired R15 subcase).

## 7. Definition of Done

Items 4, 5, 6, 7, and 11 are enforced deterministically by [`harness/dod-check`](harness/dod-check/README.md) (see its README for the hard / draft-aware / advisory tiers).

1. `npm run lint && npm run build && npm test` — green on CI.
2. Migrations idempotent.
3. Every new invariant in Core has a property test.
4. No `any`, no TODO comments, no dead code.
5. Commits follow § 6.4 rhythm (or R15 collapse). Each subject references the story id.
6. All 10 PR template sections filled — no `TBD`.
7. Suggestion log: no un-tagged items; every `deferred` links an issue.
8. P1/P2/P3 retro-checks pass.
9. Retrospective file at `docs/retrospectives/story-<id>.md`.
10. New rules/constraints land in the same PR as a CLAUDE.md / `docs/` edit.
11. User has ticked the merge checklist.

## 8. Rule provenance

New retro rules MUST add a row here in the same PR; prose references the tag. Drift scan (`npx tsx harness/drift-scan/drift-scan.ts` — see [harness/drift-scan/README.md](harness/drift-scan/README.md)) catches misses automatically at write time and in CI.

| Tag | Rule (one-line) | Originating retro |
| --- | --- | --- |
| R1 | ~~Plan file committed alongside the code it plans~~ *Retired 2026-07-18 ([walk](docs/learning/rule-walk-2026-07.md)): structurally guaranteed by R30's prep-commit convention + drift-scan Check B* | [story-2.2](docs/retrospectives/story-2.2.md) |
| R2 | Production-code surface section enumerates type/signature/format changes | [story-maint-10](docs/retrospectives/story-maint-10.md) |
| R3 | Tool-bundle import audit when a new framework/library enters the deps | [story-3.1](docs/retrospectives/story-3.1.md) |
| R4 | Composition-root subprocess test required when `program.ts` is touched | [story-maint-09](docs/retrospectives/story-maint-09.md) |
| R5 | Gherkin-to-test mapping audit at Phase 4 | [story-2.5](docs/retrospectives/story-2.5.md) |
| R6 | `fails if` note identifies the production path it guards | [story-1.3](docs/retrospectives/story-1.3.md) / [story-2.2](docs/retrospectives/story-2.2.md) |
| R7 | Test-mechanism honesty: in-process vs subprocess `fails if` scope | [story-maint-10](docs/retrospectives/story-maint-10.md) |
| R8 | Mock diversity check on structured output (JSON, tables) | [story-2.4](docs/retrospectives/story-2.4.md) |
| R9 | Trivial inline fix carve-out (≤5 LOC, single file, pre-specified) | [story-maint-01](docs/retrospectives/story-maint-01.md) |
| R10 | ~~Green-on-landing `test:` commits acceptable when sibling condition~~ *Retired 2026-07-18 ([walk](docs/learning/rule-walk-2026-07.md)): fully absorbed into R28's `countSlices` semantics* | (general) |
| R11 | Empty `refactor:` commit with justification is acceptable | (general) |
| R12 | Commit subject: summary verb over scenario enumeration | [story-1.4](docs/retrospectives/story-1.4.md) |
| R13 | Plan in slices, target 6–10 commits; one slice = one behaviour | [story-1.4](docs/retrospectives/story-1.4.md) |
| R14 | Adapter stories: coarser slices, target 5–7 commits | [story-2.1](docs/retrospectives/story-2.1.md) |
| R15 | ~~Major-bump-zero-code subcase: collapse to 4 chore/refactor commits~~ *Retired 2026-07-18 ([walk](docs/learning/rule-walk-2026-07.md)): superseded by R16's generalization; was never a live dod-check envelope token — resolves #200* | [story-maint-05](docs/retrospectives/story-maint-05.md) / [story-maint-06](docs/retrospectives/story-maint-06.md) |
| R16 | R15 collapse extends to any zero-behaviour-change story (process refresh, agent spec, doc refresh, parallel-safety): **4 change-body commits** — `chore(docs)`/`feat(agent)` change + `refactor:` empty slot + `chore(retro)` + (optional 4th body slice when the change spans process **and** docs); the preparatory `chore(docs): plan + P1/P2/P3 review` commit is authored before phase 3 and is **not** counted in the 4 | [story-maint-15](docs/retrospectives/story-maint-15.md) |
| R17 | ~~Status log fragmented into `docs/status.d/` per-story files~~ *Retired 2026-07-18 ([walk](docs/learning/rule-walk-2026-07.md)): the convention is self-sustaining — format + conflict protocol live in `docs/status.d/README.md`* | [story-maint-16](docs/retrospectives/story-maint-16.md) |
| R18 | Worktree push protocol: one agent per branch, never push `main`, fetch+rebase+propose-resolutions-on-conflict before push | [story-maint-16](docs/retrospectives/story-maint-16.md) |
| R19 | ~~Maintenance sub-loop checks open/draft PRs and issues for sibling-work overlap~~ *Retired 2026-07-18 ([walk](docs/learning/rule-walk-2026-07.md)): absorbed into the § 6.7 sub-loop template + the sibling-overlap review leg; the uniqueness half is R23* | [story-maint-16](docs/retrospectives/story-maint-16.md) |
| R20 | ~~Empty `feat:` slices retitle to `chore(workflow): empty slice`~~ *Retired 2026-07-18 ([walk](docs/learning/rule-walk-2026-07.md)): the retitle never once fired; R11's justified-empty-slice framing governs both commit types* | [story-D](docs/retrospectives/story-D.md) |
| R21 | Drift-scan enforces CLAUDE.md § 8 ↔ retro, plan ↔ source, and `.claude/` spec ↔ § 8 rule-tag consistency at write/CI time; opt-out via `*(pending)*` (retro) / `*(hole)*` (`.claude/` spec) markers — every marker carries a stamp `*(pending — story-<id>, YYYY-MM-DD)*` and expires (90 days or 10 merged stories) via Check G's advisory `pending-expired` finding, forcing codify-or-drop (story-h13) | [story-h1](docs/retrospectives/story-h1.md) / [story-h10b](docs/retrospectives/story-h10b.md) |
| R22 | *Never minted — permanent tombstone (2026-07-18, [walk](docs/learning/rule-walk-2026-07.md)): three pending claimants dispositioned — h1's over-import trap and h2's delete-identifier grep expired unobserved; h3's parallel-Phase-2 default was absorbed into § 6.1 phase 2 prose* | [story-h1](docs/retrospectives/story-h1.md) / [story-h2](docs/retrospectives/story-h2.md) / [story-h3](docs/retrospectives/story-h3.md) |
| R23 | Maintenance sub-loop checks story-id uniqueness (`docs/plans/`, `docs/retrospectives/`, `docs/status.d/` on `origin/main`, plus open PR branch names) before a new story id is chosen | [story-maint-18](docs/retrospectives/story-maint-18.md) |
| R24 | Stories touching Core domain concepts require a Phase-0 model note at `docs/domain/model-notes/story-<id>.md`; the plan's Domain-model section derives from it; no-model-impact stories declare it with a reason | [story-ddd-1](docs/retrospectives/story-ddd-1.md) |
| R25 | Model-conformance review at Phase 4 (`ddd-modeler` Mode B): code identifiers use glossary terms; new domain vocabulary updates `docs/domain/glossary.md` in the same PR | [story-ddd-1](docs/retrospectives/story-ddd-1.md) |
| R26 | Risk-based lanes — Full/Reduced/Light selected by risk surface; each lane fixes its Phase-0 / review / commit-envelope / plan-location shape. `.claude/agents`, `.claude/commands`, and skill specs are harness → Reduced, not Light (Light is docs/process/harness doc-only) | [story-h8](docs/retrospectives/story-h8.md) |
| R27 | Dev harness is a second bounded context: user-owned ubiquitous language in docs/harness/glossary.md + control inventory; agent specs declare role: doer\|judge\|advisor; only doers carry file-mutation tools — enforced by drift-scan Check F | [story-ddd-2](docs/retrospectives/story-ddd-2.md) |
| R28 | The commit envelope (R13/R14) counts **slices**, not raw commits: a `test: — failing` + `feat: — minimal green` pair is one slice; `refactor:` commits and green-on-landing `test:` commits (a test that passes against the prior feat, with the sibling condition stated — formerly R10) count as their own slices. Targets unchanged (R13 6–10, R14 5–7); dod-check counts via `countSlices` (excludes `— failing` red-halves). R16's 4-change-body-commit target is unaffected (zero-behaviour stories have no failing/green pairs) | [story-4.2a](docs/retrospectives/story-4.2a.md) |
| R29 | Test-smell lint rules (`eslint-rules/test-smells/`, wired via `eslint.config.js`) mechanically enforce the empirically-common, high-confidence smells from Jorge et al. (SAST'21); `code-reviewer` P1/P3 checklist bullets cover the residual smells needing cross-file/semantic judgment (Mystery Guest/Resource Optimism, Eager/Lazy Test) that lint can't reliably automate | [story-maint-24](docs/retrospectives/story-maint-24.md) |
| R30 | Story-id docs commits use the countSlices-**exempt** canonical subjects — prep `chore(docs): story-<id> plan + P1/P2/P3 review` and `chore(retro)…` — any other story-id-bearing commit counts toward the envelope; DoR/PR-link edits fold into the prep commit, Phase-4/5 doc updates into the retro commit | [story-4.3a](docs/retrospectives/story-4.3a.md) |
| R31 | Any PR changing a `--json` output shape, error code, or exit-code mapping updates [docs/cli-json-contract.md](docs/cli-json-contract.md) in the same PR — the contract doc is the agent-facing product surface and must never trail the code | [story-4.4b](docs/retrospectives/story-4.4b.md) |
| R32 | A transport-errored `ExitPlanMode` call can leave a session-wide plan-mode flag stuck even though the main loop's own subsequent tool calls proceed; a spawned subagent's refusal to write code citing "plan mode active" is authoritative — re-run `ExitPlanMode` for real and confirm the harness's clearance message, don't override via another agent's text message | [story-maint-26](docs/retrospectives/story-maint-26.md) |
