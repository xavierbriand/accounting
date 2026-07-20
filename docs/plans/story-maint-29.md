# Story maint-29 — Mechanize the two convention-only claims: core branch-coverage gate + layer-boundary lint

## Context

The [2026-07-20 critical project review](../reviews/2026-07-20-critical-project-review.md)
(§ 4) found that the repo's two most load-bearing trust claims are enforced by convention
only, and the user picked both for this story:

- **#209** — CLAUDE.md § 5 claims 100% branch coverage on `src/core/`, but no coverage
  tooling is installed, configured, or run in CI. **Pre-planning probe (2026-07-20,
  full suite, `@vitest/coverage-v8` scoped to `src/core/**`): actual branch coverage is
  88.44% (329/372) — 43 uncovered branches across 9 files.** The claim does not survive
  its first mechanical measurement. Probe breakdown:
  `safe-transfer-calculator.ts` 16, `settlement-variance-service.ts` 14, `result.ts` 4,
  `money.ts` 3, `transaction.ts` 2, and 1 each in `buffer-state-service.ts`,
  `config-canonical-form.ts`, `config-change-detector.ts`, `line-item-key.ts`.
- **#241** — the layer rule (core imports nothing but `dinero.js`) holds today by grep
  but has no ESLint enforcement, despite 10 custom test-smell rules in
  `eslint.config.js`. Absorbs **#228** (categorize-specific no-DB import restriction —
  same file, same mechanism).

No FR coverage — engineering-standards/QA enforcement story (DoD item 1 surface).

### Maintenance sub-loop (§ 6.7) run 2026-07-20 pre-planning

- **Sibling work:** 1 open PR — #238 `story-h14` (thesis refresh, Light, draft). No
  overlap with coverage/lint tooling. Open issues reviewed via tracker search; #209,
  #241, #228 are the targets of this story; no other issue addresses them.
- **Story-id uniqueness (R23):** `git ls-tree origin/main` shows no
  `story-maint-29` in `docs/plans/`, `docs/retrospectives/`, `docs/status.d/`; only
  open PR branch is `story-h14`. Id free.
- **Working tree:** clean; session branch `claude/project-review-critical-3stjy0`
  reset onto `origin/main` (0b36272) after PR #240 merged (session-branch precedent:
  story-ddd-1).
- **Open PRs / Dependabot:** only #238 (see above). No pending bumps.
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Drain (story-h13, #164):** this story closes **#228** (aging since 2026-07-17) by
  absorption, plus #209 (2026-07-08) and #241 — net −3 open items.
- **Proceed-to-planning:** yes — combined story confirmed with the user
  (one story vs two: one; #228 absorption: yes).

**Lane: Full** (R26) — closing the coverage gaps requires edits inside `src/core/`
(new tests are `tests/`-only, but structurally-unreachable guards need
`/* v8 ignore */` annotations in core files; comment-only, zero behaviour). Phase 0
skipped via No-model-impact declaration below. Phase 2 = `plan-reviewer` +
`sibling-overlap` in parallel; Phase 4 = `code-reviewer` (no model note → no
ddd-modeler).

## Story

> As the project's maintainers (human + agents), I want the core branch-coverage claim
> and the layer-dependency rule enforced by CI-run tooling instead of prose and grep,
> so that a regression in either becomes a red build instead of a silent drift.

## Domain model

No model impact — tooling/enforcement story: no domain concept, port, schema, or
behaviour changes. New tests exercise existing documented failure contracts
(`Result.fail` on currency mismatch, `Result` misuse throws); `/* v8 ignore */`
annotations are comments.

## Selected solution

Three legs, one PR:

1. **Coverage gate.** Add `@vitest/coverage-v8` as a devDependency (**R3 audit,
   run 2026-07-20 against the probe install of 4.1.10:** its `package.json`
   declares all 10 runtime deps — `@bcoe/v8-coverage`, `ast-v8-to-istanbul`,
   `istanbul-lib-coverage/-report/-reports`, `magicast`, `obug`, `std-env`,
   `tinyrainbow`, `@vitest/utils` — plus a satisfied `vitest@4.1.10` peer; dev-only
   tool, never bundled into product code; no undeclared-transitive smell of the
   story-3.1 kind). In
   `vitest.config.ts`, add a `coverage` block: `include: ['src/**']`,
   `thresholds: { 'src/core/**': { branches: 100 } }` (no thresholds for infra/cli
   yet — CLAUDE.md § 5 allows lower; a follow-up can ratchet). Add script
   `"test:coverage": "vitest run --coverage"`; CI's "Run Tests" step becomes
   `npm run test:coverage` (single run — coverage replaces the plain run, no double
   execution).
2. **Close the 43 branch gaps** so the 100% threshold is true, preferring real tests:
   - *Reachable — test them.* `result.ts` misuse throws (4); `money.ts`
     subtract-mismatch + allocate negative-ratio guards (3); the calculators' and
     settlement service's port-failure propagation paths (fake `SplitsService` /
     ledger query returning `Result.fail` — the mock-the-port idiom already used in
     those test files); the `cond-expr` else-arms in `line-item-key.ts` /
     config files; `buffer-state-service.ts` comparison-failure guard if reachable
     via mixed-currency injection.
   - *Structurally unreachable — annotate.* Guards on operations over Money values
     constructed with the same currency inside the same function (currency mismatch
     cannot occur). Each gets `/* v8 ignore next N */` (or start/stop) plus a
     one-line why-comment naming the invariant that makes it unreachable — this
     resolves #209's open design point in favour of annotations over contrived tests,
     keeping tests honest (no test that asserts a path that cannot happen).
   - Split expectation from probe reading: ~25–30 testable, ~13–18 annotate. Sonnet
     classifies each concretely; any guard that *can* be driven by a fake port gets a
     test, not an annotation.
3. **Boundary lint.** In `eslint.config.js`, add config blocks using core ESLint
   `no-restricted-imports` (no new lint dependency):
   - `src/core/**`: forbid **all** runtime dependencies except `dinero.js` and
     **all** Node builtins, computed dynamically — the config imports
     `builtinModules` from `node:module` and reads `package.json`
     `dependencies`, building `paths` as
     `[...deps except dinero.js, ...builtinModules, ...builtinModules.map(m => 'node:'+m)]`
     — plus `patterns: ['**/infra/**', '**/cli/**']`. A future `chalk` or
     `csv-parse` import into core (or any newly-added dependency) is blocked
     without editing the rule (adopted from plan-review P3-1: a static blocklist
     silently missed 6 of today's runtime deps). Message points at CLAUDE.md § 2.
     (`@core/*` and relative core paths remain allowed by omission.)
   - `src/infra/**`: forbid `**/cli/**`.
   - `src/cli/commands/categorize-command.ts`: forbid `**/infra/db/**` (closes #228;
     the subprocess test `categorize-end-to-end-wiring.test.ts` remains the dynamic
     leg).
   - CLAUDE.md § 2 gains one line noting mechanical enforcement (DoD item 10);
     docs/architecture.md ditto.

Alternatives set aside:

- *`eslint-plugin-boundaries` / `import-x`* — richer layer model, but a new dependency
  + R3 audit for what three `no-restricted-imports` blocks express today.
- *Lower threshold (88%) + ratchet* — leaves the flagship claim false; the gap is
  closable in one story.
- *Contrived tests for unreachable guards* — tests that can never fail honestly are
  themselves a test smell (R6 spirit); annotations with justification are more honest.
- *Separate coverage job in CI* — a second full test run for no isolation benefit.

## Production-code surface (R2)

- **No type, signature, JSON-shape, error-code, or exit-code changes** (R31 not
  triggered).
- `src/core/` files gain `/* v8 ignore */` comments only (behaviour-identical).
- `package.json`: +`@vitest/coverage-v8` devDep (rationale: the vitest-native v8
  coverage provider — the only supported way to threshold-gate branch coverage in
  the existing test runner; R3 audit in Selected solution leg 1), +`test:coverage`
  script.
- `vitest.config.ts`: +coverage block. `eslint.config.js`: +3 boundary blocks.
- `.github/workflows/ci.yml`: test step runs `npm run test:coverage`.
- CLAUDE.md § 5 coverage line + § 2 layer line annotated as tool-enforced; R-row per
  DoD 10 if the retro mints a rule.

## Gherkin acceptance scenarios

Scenario 1 — coverage gate holds src/core at 100% branches (in-process; R7):
```gherkin
Given the repo's vitest coverage configuration
When the full suite runs with coverage
Then the run exits 0 and reports src/core branch coverage of 100%
And the config declares a branches:100 threshold scoped to src/core/**
```
`fails if` the thresholds block is missing, mis-scoped (not `src/core/**`), or the
gate is advisory — guards the CI "Run Tests" step being a real gate.
*(Mechanism: automated assertion = threshold config + green `test:coverage` run in
CI. The mutation arm — removing one guard test makes the run exit non-zero — is
deliberately NOT automated (vitest-in-vitest is the #147-class trap); it is
demonstrated once manually with output pasted in the PR body. Reworded at Phase 2:
the original Then-clause claimed the manual arm as scenario behaviour — P1-2.)*

Scenario 2 — boundary lint rejects a core→infra import (in-process; R7):
```gherkin
Given the eslint boundary configuration
When a virtual src/core file imports 'better-sqlite3' (or 'node:fs', bare 'fs',
  'chalk', or a src/infra path)
Then the boundary rule reports a no-restricted-imports error for each
And the unmodified real tree passes npm run lint with zero new errors
```
`fails if` the restriction blocks are missing or scoped to the wrong glob — guards the
layer rule that anchors the architecture. *(Mechanism: a unit test in
`tests/unit/eslint-rules/` runs ESLint programmatically against inline fixture
snippets under virtual `src/core/...` paths using the exported boundary config —
same pattern as the existing test-smell rule tests; no repo files are mutated. The
`npm run lint` CLI-level arm is covered by CI's lint step on the real tree plus a
one-time mutated-file demo in the PR body. Reworded at Phase 2: the original
Then-clause claimed the CLI mechanism for the automated test — P1-3.)*

Scenario 3 — categorize no-DB restriction (in-process; R7):
```gherkin
Given the categorize-specific restriction block
When src/cli/commands/categorize-command.ts imports src/infra/db/database
Then lint fails; and the real file passes today
```
`fails if` the block is absent — closes #228's static-enforcement half.
*(Mechanism: same programmatic-Linter unit test as Scenario 2, with a virtual
`src/cli/commands/categorize-command.ts` fixture path — added at Phase 2, P1-4.)*

R4 note: `program.ts` is **not** touched — no composition-root subprocess test needed.

## Slice plan

R13 envelope, 7 slices (id `maint-29` in every subject; R30 prep + retro exempt):

1. `test(harness): maint-29 boundary-lint fixtures — failing` →
   `feat(lint): maint-29 no-restricted-imports layer blocks — minimal green`
   (scenarios 2+3; includes the programmatic Linter unit test)
2. `test(core): maint-29 result misuse-guard branches — failing` →
   `feat(test): maint-29 cover result.ts guards — minimal green`
3. `test(core): maint-29 money mismatch/negative-ratio guards — green-on-landing`
   (sibling condition: guards already implemented; R28)
4. `test(core): maint-29 remaining reachable guard branches — green-on-landing`
   (sibling condition: all guarded paths pre-exist — this slice adds coverage via
   fake-port injection and cond-expr else-arm cases, no production change; R28.
   Wording tightened + else-arm tests moved here from slice 5 at Phase 2 — P3-2/P3-3)
5. `refactor(core): maint-29 v8-ignore annotations for structurally-unreachable guards`
   (annotations + why-comments only — behaviour-preserving, no test content; P3-2)
6. `feat(ci): maint-29 coverage gate — vitest thresholds + CI step + devDep`
   (lands last so the gate is born green; no `test: — failing` partner by design —
   the gate's automated evidence is Scenario 1's config assertion + the green CI
   run; a red-half would require vitest-in-vitest (see Scenario 1 mechanism) — P3-6)
7. `chore(docs): maint-29 CLAUDE.md/architecture/engineering-standards enforcement notes`
   (counted body slice — carries story id, not a canonical exempt subject; includes
   the engineering-standards § Coverage line: reports stay advisory for *which
   branches* human review, while the § 5 percentage claim is now a hard CI gate —
   adopted from P2-2)

+ exempt: `chore(docs): story-maint-29 plan + P1/P2/P3 review` (prep, R30) and
`chore(retro): …` (retro commit).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| A "reachable" branch turns out unreachable mid-implementation (or vice versa) | Sonnet reclassifies with a one-line note in the return report; annotation-vs-test decision rule is stated above, not per-case judgment |
| Coverage adds runtime to CI | Single-run replacement (no second suite execution); v8 provider overhead measured ~+10–15% in probe |
| `no-restricted-imports` misses a Node builtin spelled without `node:` prefix | Both bare and `node:`-prefixed names listed; scenario-2 fixture includes a bare `fs` case |
| Vitest 4 per-glob threshold syntax differs from probe assumption | Probe validated `--coverage.include` CLI form; Sonnet verifies the config-file `thresholds` glob form against vitest 4.1 docs before slice 6; fallback is `coverage.include: ['src/core/**']` + global 100 threshold |
| Infra/cli coverage now measured but ungated | Deliberate — deferred to #242 (ratchet from a measured CI baseline, not an arbitrary number) |

Deferred: #242 (infra/cli threshold ratchet).

## Verification plan

- Locally: `npm run lint && npm run build && npm test` green.
- CI (post-change step list): lint → build → **`npm run test:coverage`** (replaces
  plain `npm test` — P1-5 wording fix) → test:harness → drift-scan → dod-check, all
  green.
- `npm run test:coverage` exits 0; summary shows `src/core` branches 100%.
- Mutation demo (PR body): comment out one guard test → `npm run test:coverage`
  exits non-zero with a threshold error naming `src/core/**`.
- Boundary demo (PR body): add `import 'better-sqlite3'` to a core file →
  `npm run lint` fails; revert.
- `npx tsx harness/drift-scan/drift-scan.ts` and dod-check green.
- Closes #209, #241, #228 on merge.

## Suggestion log

Phase 2 run 2026-07-20: `plan-reviewer` + `sibling-overlap` in parallel.
Sibling-overlap: no overlap (PR #238 is docs/learning-only; no competing claimant on
#209/#241/#228; id free per R23) — no findings to tag.
Plan-reviewer findings (13):

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| P1-1 | R3 audit missing for `@vitest/coverage-v8` devDep | ADOPT | Audit run 2026-07-20; result recorded in Selected solution leg 1 |
| P1-2 | Scenario 1's mutation arm claimed as behaviour but only demonstrated manually | ADOPT | Scenario reworded — automated assertion is config + green run; manual mutation demo explicitly moved to PR-body evidence |
| P1-3 | Scenario 2's Then named `npm run lint` while the automated mechanism is a programmatic Linter test | ADOPT | Scenario reworded; CLI arm attributed to CI lint step + one-time PR-body demo |
| P1-4 | Scenario 3 lacked a mechanism note | ADOPT | Mechanism parenthetical added (same programmatic-Linter test as Scenario 2) |
| P1-5 | Verification plan said CI runs `npm test`, contradicting the `test:coverage` step change | ADOPT | Verification plan reworded with the post-change CI step list |
| P2-1 | No QA-invariant surfaces implicated (informational) | ACKNOWLEDGE | No action — confirms scope |
| P2-2 | engineering-standards § Coverage "advisory" framing vs the new hard gate unaddressed | ADOPT | Slice 7 extended to update engineering-standards § Coverage (reports advisory for *which-branches* review; percentage claim now CI-gated) |
| P3-1 | Static blocklist missed 6 runtime deps (`chalk`, `csv-parse`, `@inquirer/*`, `cli-table3`, `ora`) — reproduces the silent-import failure mode | ADOPT | Blocklist redesigned as dynamic: all `package.json` dependencies except `dinero.js` + all `builtinModules` (bare and `node:`-prefixed), computed in `eslint.config.js` |
| P3-2 | Slice 5 bundled new else-arm tests into a `refactor:` commit | ADOPT | Else-arm tests moved to slice 4 (green-on-landing); slice 5 is annotations-only |
| P3-3 | Slice 4 sibling-condition wording didn't state the pre-existing-paths property R28 turns on | ADOPT | Slice 4 wording tightened |
| P3-4 | Dep rationale not co-located in the R2 surface section | ADOPT | One-line rationale added at the devDep line |
| P3-5 | Infra/cli measured-but-ungated decision surfaced for disposition | DEFER | #242 filed — ratchet from a measured CI baseline |
| P3-6 | Slice 6 `feat:` has no `test: — failing` partner | ACKNOWLEDGE | By design: the red-half would require vitest-in-vitest (#147-class trap); justification recorded in the slice plan |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): findings triaged above.
- [x] Draft PR with template sections 1–6 filled. *(PR opened at DoR — see PR body.)*
