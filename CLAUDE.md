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

**Stack:** Node.js 20, TypeScript (strict), SQLite via `better-sqlite3` (WAL), `dinero.js`, `commander`, `zod`, `vitest` + `fast-check`.

## 2. Architecture

Full decisions in [docs/architecture.md](docs/architecture.md). Quick reference:

- Three layers, strict dependency rule. `src/core/` depends on nothing (no Node APIs, no `better-sqlite3`, no `commander`, no `process.exit`); `src/infra/` talks to the outside world via ports in `src/core/ports/`; `src/cli/` wires them together.
- **Constructor DI only.** No `new SomeRepo()` inside Core.
- **`Result<T, E>` in Core** — domain methods return `Result` values, never throw. CLI is the only place that inspects `result.isFailure`.
- **Append-only ledger.** No `UPDATE`/`DELETE` on ledger rows — corrections are new balancing entries.
- Port interfaces are PascalCase without an `I` prefix (`TransactionRepository`). Repositories map snake_case DB columns to camelCase domain fields at the boundary.

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

- **100% branch coverage** on `src/core/`. Infra/CLI lower. Coverage targets apply to `src/`; `harness/` is exempt — harness code is tooling, not domain logic.
- **TDD rhythm (outside-in):** failing acceptance → failing unit → minimal green → acceptance green → refactor. See § 6.4 for commits.
- **Batch ingestion — two stages.** *Parse:* malformed rows skipped, reported individually; valid siblings proceed. *Commit:* valid rows in one SQL transaction — all-or-nothing. Authoritative policy in [docs/prd.md](docs/prd.md) and [docs/quality-assurance.md](docs/quality-assurance.md).

## 6. Development workflow

Two formal gates: **DoR** (phases 1–2 complete) · **DoD** (phases 3–5 complete, merge checklist — see § 7).

### 6.1 Phases

1. **Plan** (Opus): collect intent → converge → Gherkin → draft PR → hand off to Sonnet. Plan file at `docs/plans/story-<id>.md`. *Exit:* draft PR, sections 1–6 filled. Sub-rules (see § 8): **R1** plan file alongside code · **R2** production-code surface section · **R3** tool-bundle import audit · **R4** composition-root subprocess test when `program.ts` touched.
2. **Critical review** (Opus, P1/P2/P3): invoke `plan-reviewer` sub-agent (`subagent_type: "plan-reviewer"`) with the plan path; consume the structured findings; tag each adopted/deferred/rejected in the suggestion log. Deferred → GitHub issue. *Exit (DoR):* no un-tagged suggestions, every deferred has an issue link.
3. **Implement** (Sonnet): failing acceptance → failing unit → green → structured report. *Exit:* tests green, branch pushed, PR in draft.
4. **Code review + refactor** (Opus): invoke `code-reviewer` sub-agent (`subagent_type: "code-reviewer"`) with the PR number and plan path; consume the structured findings; classify each fix-now / defer-issue / acknowledge. Sub-rules (see § 8): **R5** Gherkin-to-test mapping · **R6** `fails if` honesty · **R7** test-mechanism honesty · **R8** mock diversity · **R9** trivial inline fix carve-out. *Exit:* refactor merged, CI green.
5. **Retrospective.** Keep/Change/Try at `docs/retrospectives/story-<id>.md`. New rules add a row to § 8. *Exit:* file committed. Merge user-gated.

### 6.2 Model tier

- **Opus:** planning, critical review, code review, refactor planning, retrospective synthesis.
- **Sonnet:** failing tests, implementation, refactor execution.
- **Haiku:** not used yet.

### 6.3 Sonnet return format

Full agent spec: [.claude/agents/sonnet-implementer.md](.claude/agents/sonnet-implementer.md). Sections in order: `What was built` · `Red → green sequence` · `Deviations` · `Unknowns` · `Proposed follow-ups` · `Files touched`. Invoke with `subagent_type: "sonnet-implementer"`; frontmatter supplies the model. **New custom agents** added to `.claude/agents/*.md` require a session restart to register with the harness Agent tool. For same-session verification, invoke `general-purpose` with the spec file's contents inline as the prompt.

### 6.4 Commit convention

- `test(<scope>): <scenario> — failing` · `feat(<scope>): <scenario> — minimal green` · `refactor(<scope>): <what>`
- Story id in every subject. See § 8: **R10** green-on-landing · **R11** empty refactor · **R12** summary verb · **R13** 6–10 commits/story. Squash on merge optional.

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

### 6.7 Maintenance sub-loop

Runs **at the start of each new planning session**, treating the check as a read-only snapshot — no blocking on sibling stories in flight. Run the [maintenance-sub-loop checklist](docs/templates/maintenance-sub-loop.md). **Major-bump-zero-code subcase:** collapse to 4 commits (`chore(docs)` + `chore(deps)` + `refactor:` empty + `chore(retro)`). See § 8: **R15**.

## 7. Definition of Done

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
| R1 | Plan file committed alongside the code it plans | [story-2.2](docs/retrospectives/story-2.2.md) |
| R2 | Production-code surface section enumerates type/signature/format changes | [story-maint-10](docs/retrospectives/story-maint-10.md) |
| R3 | Tool-bundle import audit when a new framework/library enters the deps | [story-3.1](docs/retrospectives/story-3.1.md) |
| R4 | Composition-root subprocess test required when `program.ts` is touched | [story-maint-09](docs/retrospectives/story-maint-09.md) |
| R5 | Gherkin-to-test mapping audit at Phase 4 | [story-2.5](docs/retrospectives/story-2.5.md) |
| R6 | `fails if` note identifies the production path it guards | [story-1.3](docs/retrospectives/story-1.3.md) / [story-2.2](docs/retrospectives/story-2.2.md) |
| R7 | Test-mechanism honesty: in-process vs subprocess `fails if` scope | [story-maint-10](docs/retrospectives/story-maint-10.md) |
| R8 | Mock diversity check on structured output (JSON, tables) | [story-2.4](docs/retrospectives/story-2.4.md) |
| R9 | Trivial inline fix carve-out (≤5 LOC, single file, pre-specified) | [story-maint-01](docs/retrospectives/story-maint-01.md) |
| R10 | Green-on-landing `test:` commits acceptable when sibling condition | (general) |
| R11 | Empty `refactor:` commit with justification is acceptable | (general) |
| R12 | Commit subject: summary verb over scenario enumeration | [story-1.4](docs/retrospectives/story-1.4.md) |
| R13 | Plan in slices, target 6–10 commits; one slice = one behaviour | [story-1.4](docs/retrospectives/story-1.4.md) |
| R14 | Adapter stories: coarser slices, target 5–7 commits | [story-2.1](docs/retrospectives/story-2.1.md) |
| R15 | Major-bump-zero-code subcase: collapse to 4 chore/refactor commits | [story-maint-05](docs/retrospectives/story-maint-05.md) / [story-maint-06](docs/retrospectives/story-maint-06.md) |
| R16 | R15 collapse extends to any zero-behaviour-change story (process refresh, agent spec, doc refresh, parallel-safety): **4 change-body commits** — `chore(docs)`/`feat(agent)` change + `refactor:` empty slot + `chore(retro)` + (optional 4th body slice when the change spans process **and** docs); the preparatory `chore(docs): plan + P1/P2/P3 review` commit is authored before phase 3 and is **not** counted in the 4 | [story-maint-15](docs/retrospectives/story-maint-15.md) |
| R17 | Status log fragmented into `docs/status.d/` per-story files; `docs/status.md` keeps only Current position + Refresh trigger + pointer | [story-maint-16](docs/retrospectives/story-maint-16.md) |
| R18 | Worktree push protocol: one agent per branch, never push `main`, fetch+rebase+propose-resolutions-on-conflict before push | [story-maint-16](docs/retrospectives/story-maint-16.md) |
| R19 | Maintenance sub-loop checks open/draft PRs **and** issues for sibling-work overlap before opening a new plan | [story-maint-16](docs/retrospectives/story-maint-16.md) |
| R20 | Empty `feat:` slices retitle to `chore(workflow): empty slice — TDD rhythm note <reason>` (R11 covers `refactor:` only) | [story-D](docs/retrospectives/story-D.md) |
| R21 | Drift-scan enforces CLAUDE.md § 8 ↔ retro and plan ↔ source consistency at write/CI time; opt-out via `*(pending)*` marker | [story-h1](docs/retrospectives/story-h1.md) |
