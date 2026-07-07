# Story maint-23 — Extract capturing-stream helper to tests/_helpers/streams.ts

## Context

Issue [#43](https://github.com/xavierbriand/accounting/issues/43) was filed at story-maint-01 Phase-4 review (PR #41): a `PassThrough`-wrapped stream with a `captured: string` getter (`makeCapture`/`makeStdout`) was duplicated across 4 test files, past the repo's ≥3-caller extraction threshold. Deferred at the time to stay within that story's slice budget.

Re-verified 2026-07-08: the issue is still open, never implemented, and the duplication has **grown to 7 files** (byte-identical logic, only the function name/indentation differs):

- `tests/unit/cli/commands/ingest-command.test.ts` (`makeStdout`, 11 call sites)
- `tests/unit/cli/commands/ingest-command-flags.test.ts` (`makeCapture`, 2 call sites)
- `tests/integration/cli/ingest-commit.test.ts` (`makeCapture`, 3 call sites)
- `tests/perf/ingest-throughput.test.ts` (`makeCapture`, 3 call sites)
- `tests/unit/cli/commands/categorize-command.test.ts` (`makeCapture`, 9 call sites)
- `tests/unit/cli/commands/correct-command.test.ts` (`makeCapture`, 3 call sites)
- `tests/features/steps/correct.steps.ts` (`makeCapture`, 3 call sites)

Two more files (`tests/features/steps/commit.steps.ts`, `tests/features/steps/ingest.steps.ts`) use `PassThrough` too, but as a fire-and-forget `.resume()` sink with no `.captured` getter — a different pattern, out of scope.

`tests/_helpers/` already exists with sibling helpers `spawn-cli.ts` and `inline-config.ts` (same "test I/O helper, no dedicated unit test, exercised via consumers" shape) — this story adds a third file following that exact convention.

No FR/NFR coverage — test-infra maintenance only.

**Maintenance sub-loop (§ 6.7) run 2026-07-08 pre-planning:**
- [x] **Sibling work check.** `gh pr list --state open --draft --base main` → `[]`. `gh issue list --state open --limit 50` → 38 open issues reviewed; none overlaps this story's scope.
- [x] **Story-id uniqueness.** `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ docs/status.d/ | grep -i "story-maint-23"` → no hits. Highest existing is `story-maint-22`; `story-maint-23` is free. No open PR branch uses it either.
- [x] **Working tree clean.** `git status` clean; branch `claude/issue-43-relevance-955060` up to date with `origin/main` (`c94db32`).
- [x] **Open issues.** Reviewed above; #43 (this story) is the only issue in scope.
- [x] **Open PRs.** None open.
- [x] **`npm audit --audit-level=high`** — 0 vulnerabilities.
- [x] **Proceed-to-planning.**

## Story

> As a developer maintaining the CLI test suite, I want the duplicated capturing-stream helper collapsed into one shared `tests/_helpers/streams.ts` module, so that the 7 identical `makeCapture`/`makeStdout` declarations become a single source of truth and new test files reuse it instead of growing an 8th copy.

## Lane (R26)

**Reduced** — test-infra-only change (no `src/core`, `src/infra`, `src/cli`, DB schema, or migration touched). No Core domain concept changes → Phase 0 skipped. Phase 2 review: `sibling-overlap` only (`plan-reviewer` dropped — same reasoning `story-maint-21`/`story-maint-22` used for infra-only changes, applied here by analogy to test-infra). Phase 4: `code-reviewer` + `sibling-overlap`. Envelope: below R13's 6–10 band by design (see Slice plan).

## Domain model

No model impact — test-infra maintenance, not product Core domain (R24 default for maint/process stories).

## Selected solution

Add `tests/_helpers/streams.ts` exporting:

```ts
export function makeCapturingStream(): Writable & { captured: string } {
  const buf: string[] = [];
  const stream = new PassThrough() as unknown as Writable & { captured: string };
  stream.on('data', (chunk: Buffer | string) => buf.push(chunk.toString()));
  Object.defineProperty(stream, 'captured', { get: () => buf.join('') });
  return stream;
}
```

(Verbatim body from the 7 existing declarations — confirmed byte-identical via diff before drafting this plan.)

In each of the 7 files: delete the local function declaration, add `import { makeCapturingStream } from '<relative path>/_helpers/streams.js';`. **Keep each file's existing local call-site name** via aliased import (`import { makeCapturingStream as makeCapture } from ...` or `as makeStdout`) — call sites (`makeCapture()`/`makeStdout()`, 34 occurrences total) are left untouched. This keeps each diff to a 6-line deletion + 1-line import addition, rather than also renaming ~34 call sites for a cosmetic-only reason the issue never asked for.

**Alternative considered and rejected:** renaming all call sites to the canonical `makeCapturingStream()` name — adds diff churn across 7 files for no functional benefit; the issue's goal is deduplicating *logic*, not unifying *naming*.

**No new dedicated unit test.** Follows the existing convention set by `spawn-cli.ts`/`inline-config.ts` (both test I/O helpers with no colocated unit test) rather than the `findDuplicateIndices`-style "add one direct unit test" precedent from story-maint-11 (that was a new pure-logic helper; this is a verbatim relocation of already-covered code). The 7 consuming suites already assert on `.captured` content — if the relocated helper behaves differently from the original, those suites fail immediately (this **is** the regression guard, per R6/R7).

## Production-code surface (R2)

None. Test-only change:
- New: `tests/_helpers/streams.ts`
- Modified (delete local fn + add import, call sites untouched): the 7 files listed in Context.

## Gherkin acceptance scenarios

No new scenario — this is a zero-behaviour-change mechanical extraction (R6/R7 honesty: the guard is the existing suite, not a new test).

`fails if`: the relocated `makeCapturingStream` diverges from the original 7 declarations (wrong `Object.defineProperty` getter, wrong chunk-join order, wrong `Buffer`/`string` handling) — any of the 7 consuming suites' assertions on stdout/stderr/`captured` content fail immediately, across unit, integration, perf, and BDD-step tiers (in-process for unit/BDD-step, subprocess-adjacent for perf/integration per their existing mechanism — unchanged by this story).

## Slice plan

Small mechanical extraction — below R13's 6–10 band by design, reasoning borrowed from R16's zero-behaviour-change collapse shape (that rule's listed triggers are docs/agent-spec, not test code, so this is an analogous application for Phase 2/4 review to confirm, not a literal R16 invocation):

Preparatory (before Phase 3; not counted per R16 convention):
- **P0:** `chore(docs): story-maint-23 plan + P1/P2/P3 review`

Change-body commits:
1. **C1** `refactor(tests): extract makeCapturingStream to tests/_helpers/streams.ts, replace 7 duplicated declarations (story-maint-23)` — add the helper, delete + import in all 7 files, run `npm run lint && npm run build && npm test` green.
2. **C2** `refactor: — empty slice — TDD rhythm note: pure mechanical extraction needs no follow-up (story-maint-23)` (R11 empty-refactor carve-out; also the Phase-4 output if code-reviewer finds nothing to fix-now).
3. **C3** `chore(retro): story-maint-23 retrospective (story-maint-23)`

## Risks & deferred items

| Risk | Mitigation |
|---|---|
| `commit.steps.ts`/`ingest.steps.ts`'s different `PassThrough` sink pattern gets swept in by mistake | Explicitly out of scope; left untouched; verified by final diff review. |
| Relative import path errors (7 files at 3 different nesting depths: `tests/unit/cli/commands/` = 3 deep, `tests/integration/cli/` and `tests/features/steps/` = 2 deep, `tests/perf/` = 1 deep) | Verified each path against existing sibling imports (`_helpers/spawn-cli.js` et al.) in the same files before drafting this plan; `npm run build` (tsc) catches any wrong path immediately. |

No deferred follow-ups — this story fully closes issue #43.

## Verification plan

`npm run lint && npm run build && npm test` green, covering all 4 tiers (unit, integration, perf, acceptance/BDD) — the 7 touched files' suites are the direct regression guard. Manual diff review confirms the 2 out-of-scope `.steps.ts` files are untouched. Closes issue #43 on merge.

## Suggestion log

**Phase 2 (`sibling-overlap`, Reduced lane — `plan-reviewer` dropped) — run 2026-07-08.** Zero open PRs (`gh pr list --state open` → `[]`); 38 open issues scanned by keyword (`makeCapture`, `makeStdout`, `PassThrough`, `.captured`) and by directory (`tests/_helpers/`, `tests/features/steps/`). No collision with this story's 7 touched files.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | Issue #186 (e2e journey tests) reuses sibling helper `tests/_helpers/spawn-cli.ts` for a new `tests/e2e/` tier — same directory, different file/tier, no open PR. | ACKNOWLEDGE | No action — no file/branch overlap with this story's `streams.ts` addition. |
| 2 | Issue #117 (story-maint-17 Phase-4 deferred) touches a sibling `tests/features/steps/ingest.steps.ts` (YAML fixture injection), not this story's `correct.steps.ts` (stream-capture dedup). | ACKNOWLEDGE | No action — different file, different concern, no open PR. |
| 3 | No other open issue references the 7 touched files or the `makeCapture`/`makeStdout`/`PassThrough`/`.captured` pattern. | ACKNOWLEDGE | No action — confirms proceed-to-implementation. |

## DoR checklist

- [ ] Phase 0 (Model): `No model impact — test-infra maintenance` (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — `sibling-overlap` only, Reduced lane): findings triaged above — no overlap detected.
- [ ] Draft PR with template sections 1–6 filled.
