# Story B retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/82  **Closed:** 2026-04-28 (pending merge)

## Keep

- **Clarifying questions before plan-write paid off again.** Story A established the rule; Story B used it from the start (no user correction needed). All four Q1–Q4 answers are recorded in the plan's "User decisions taken before planning" section, and Phase-2 review found zero architectural disagreements — only documentation gaps. The new `feedback_planning_clarifying_questions.md` memory is doing what it was designed to do.
- **`plan-reviewer` produced 11 fully-actionable adopt items on a 100-line plan.** Most importantly, every adopted item caught a real gap: the R4 harness location, the writeStubYaml drift, the AutoTagRule import-circularity risk, the architecture.md namespace addition, the parseRawConfig return-object update, the duplicate-category Gherkin scenario, the ReDoS disposition. The Phase-2 cycle promoted the plan from "good spec" to "spec the implementer cannot misread."
- **`code-reviewer` surfaced 3 small soft items on a 9-commit diff.** Honest test-quality improvements (cast hygiene, fast-check filter, fails-if completeness). Neither over-flagging nor under-flagging — the agent is calibrated.
- **R10 deviation handled cleanly.** Slice 8 landed green-on-landing because removing `DEFAULT_RULES` in slice 7 broke the BDD scenario, forcing `writeStubYaml` to extend in slice 7. The commit subject documents the deviation explicitly (`— green-on-landing`), the body explains the cause, and the R4 subprocess test still asserts new wiring (it would fail if `program.ts:104` reverted to `undefined`). R10's documented carve-out works as designed.
- **Story-A Try-list R-rule (defer empty R11 refactor until after Phase-4) saved a wasted commit.** Phase-4 surfaced 3 fix-now items, so slice 11 landed as a *real* refactor commit. The plan didn't pre-author an empty placeholder this time. Cleaner history, no force-push awkwardness.

## Change

- **`writeStubYaml` drift was almost shipped.** Phase-2 plan-reviewer (finding #6) caught that the existing `ingest-end-to-end-wiring` test would silently weaken post-merge: with no `autoTagRules` injected, all 5 rows become low-confidence (still satisfies exit 2 numerically) but the test no longer guards what it intended. Without the catch, the test would have stayed "green" but become a tautology. **Try:** add a Phase-2 sub-rule "when removing implicit defaults, scan integration tests for callers relying on those defaults" — easy to operationalise, prevents the same class of drift in Story C and beyond.
- **Slice-7 commit subject became coarse.** It bundles 5 distinct file changes with `feat(core/ingest)+feat(cli):` dual-prefix and a 3-clause subject (`remove DEFAULT_RULES; constructor param required; program.ts wires`). The plan documented the bundling necessity (compile-time chain reaction from removing the default), and code-reviewer correctly classified it as documented coarseness. But subjects that ship under both `feat(core)+feat(cli)` are awkward to navigate in a `git log --oneline`. **Try:** when a slice intrinsically requires bundling across layers, split the commit body into a "What" + "Why" structure so future readers can scan the diff without parsing the multi-clause subject.
- **Sonnet's report had a typo (`.claire/` instead of `.claude/`) and miscounted commits (8 vs 9 — slice-1 refactor was excluded from the Red→green sequence).** Cosmetic; both caught at verification. **Try:** the sonnet-implementer agent spec could prompt the agent to include slice-1-style refactor commits in the sequence narrative even when there's no test pair, with a `(no test sibling — pure refactor per R10)` annotation, so the count and prose both round-trip cleanly.

## Try

- **Phase-2 sub-rule: "removing-implicit-defaults integration scan."** When a story removes a default parameter or eliminates a fallback constant (Story B did both: `DEFAULT_RULES` and the `= DEFAULT_RULES` constructor default), plan-reviewer should scan `tests/integration/` and `tests/features/` for tests that previously relied on the implicit default — those tests need their stubs/helpers extended to inject explicit values, or they degrade to tautologies. Codify in next process-touching PR.
- **Sonnet-implementer report consistency tweak.** Spec change: include all commits in the sequence narrative with explicit "no test sibling" annotation when applicable. Closes the gap surfaced in this retro.
- **Carry-overs from Story A retro (still open):**
  - Plan-reviewer "verify named imports" sub-rule. Story B *would* have caught the `@inquirer/core` issue if applied; the rule is still valid even though Story B didn't surface a similar trap.
  - `docs/security-checklist.md` carve-out for user-typed labels. Still open. Story B added a PII note for YAML categories — a third data point reinforcing the need for a checklist update.
  - R16 codification (R15-extension to zero-code stories). Story B is not zero-code; carry-over remains.
- **End-to-end BDD scenario for define-new + auto-tag interaction.** Story B made every transaction `Uncategorized` when YAML `autoTagRules` is empty/missing, recoverable via Story A's `+ Define new category…`. There is no acceptance test combining the two paths (define-new during ingestion of a CSV with no matching rule). Future Story C — when YAML write-back lands — naturally adds this scenario.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **One adopted in-PR.** `docs/architecture.md` was missing the `core/categories/` namespace; the slice-1 refactor commit added it (Phase-2 finding #8). No CLAUDE.md changes needed (no new R-rule landed; Try-list defers to next process-touching PR).
- [x] If yes, reconciled in this PR? **Yes** — `core/categories/` listed under the `src/core/` tree fragment near line 86 of `docs/architecture.md`.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `validateNewCategoryName` + `RESERVED_TOKENS` relocated to `core/categories/` | `src/core/categories/category-name.ts` | done (slice 1, `0903e43`) |
| `core/categories/` listed in architecture.md tree | `docs/architecture.md` | done (slice 1) |
| `AutoTagRule` group schema + flatten transform + property test | `src/infra/config/config-schema.ts` + flatten-property test | done (slices 2-5) |
| `validateNewCategoryName` applied to YAML category strings (Q1-a) | schema superRefine | done (slice 5) |
| `DEFAULT_RULES` removed; `TransactionBuilder` rules required; `program.ts:104` wires `config.autoTagRules` | core + cli | done (slice 7) |
| R4 subprocess smoke `tests/integration/cli/ingest-autotag-wiring.test.ts` | new file | done (slice 8 green-on-landing per R10) |
| `writeStubYaml` extension + ingest-end-to-end-wiring updated to inject rules | `tests/_helpers/inline-config.ts` + caller | done (slice 7 bundle) |
| `accounting.example.yaml` autoTagRules section (Q4-a 1:1 migration) + sharpened --non-interactive message (Q3-b) | example + ingest-command | done (slice 10) |
| `docs/status.md` log entry | this PR | done (Phase 5) |
| Phase-4 fixes: cast hygiene, RESERVED_TOKENS filter, fails-if extended | tests | done (slice 11, `f1baf92`) |
| Phase-2 sub-rule: "removing-implicit-defaults integration scan" | next process-touching PR | open |
| Sonnet-implementer spec: include refactor-only commits in sequence narrative | next process-touching PR | open |
| Plan-reviewer "verify named imports" sub-rule (carry-over from Story A retro) | next process-touching PR | open |
| `docs/security-checklist.md` carve-out for user-typed labels (carry-over) | future security-checklist edit | open |
| R16 codification (carry-over) | next process-touching PR | open |
| End-to-end BDD scenario for define-new + auto-tag interaction | future Story C | open |
| Local `accounting.yaml` patch applied | user task post-merge | open (PR description carries the diff) |
