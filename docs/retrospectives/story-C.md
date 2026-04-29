# Story C retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/84  **Closed:** 2026-04-29 (pending merge)

## Keep

- **Third dogfood of the agent pair (`plan-reviewer` + `code-reviewer`) was the most rigorous yet.** Plan-reviewer surfaced 21 findings on a 250-line plan (14 adopt, 7 acknowledge); code-reviewer surfaced 9 on the 11-commit diff (2 fix-now, 6 acknowledge, 1 transient). Most importantly: zero false positives across both runs; every finding pointed at a real artefact (`configPath` exposure gap, `Transaction.create` fall-through, missing `ScriptedPrompter` unit test, Gherkin scenario reasoning glitches). The agents are calibrated.
- **The Story-A-retro R-rule "defer empty refactor commits until after Phase-4" paid off cleanly here.** Phase-4 produced two real fix-now items, slice 13 landed as a *real* refactor commit (`a478879`) — not an empty placeholder. The discipline of authoring slice 13 only after code-review classifies findings is now a proven pattern, not just a hope.
- **Phase-2 review caught the `--scripted-prompts` mechanism gap.** Original plan said "Sonnet picks the path that lands clean." Phase-2 reviewer flagged this as a coordination gap (#6) and pushed me to pin a primary mechanism (`SpawnOpts.stdin` + `INQUIRER_FORCE_TTY=0`) with a documented fallback (`--scripted-prompts` test-only flag). Sonnet then picked the fallback (the inquirer raw-mode TTY isn't bypassable in v8.x), with the choice noted in the slice-9 commit. Pre-deciding the *fallback* was the load-bearing decision — Sonnet didn't have to invent it under time pressure.
- **The `writeStubYaml` extension (Story B retro Try-list) caught a real Story-A bug.** The R4 subprocess test was the first end-to-end exerciser of the change-then-DB round-trip. It surfaced that `outcome.category` was being updated but `transaction.entries[].account` was not — saveBatch was persisting `Expense:Uncategorized` after the user's `change` action. Fix landed in slice 10 with the entry-rebuild via `Transaction.create`. **Story A merged with this latent bug; the test infrastructure that Story B/C added is what found it.** Worth surfacing as a Try item: when a story adds a new R4 subprocess test, scan the previous N stories' Phase-4 reviews for end-to-end claims that weren't actually covered by R4 at the time.
- **Carry-over Try-list items from Stories A and B were systematically retired:** plan-reviewer "verify named imports" (Phase-1 sub-rule applied to `yaml.parseDocument`); BDD round-trip scenario (slice 11); security-checklist user-label carve-out (slice 12 — three data points now codified). The Try-list discipline is sustainable across the trio.

## Change

- **The plan's `--scripted-prompts` decision tree was right but too late in the document.** It was buried in § Files-to-change as an "implementer fallback if INQUIRER_FORCE_TTY=0 fails." It should have been promoted to § Production-code surface (R2) since it adds a new CLI flag. Code-reviewer flagged this (P1 finding 1). **Try:** when a planning Phase-2 cycle changes a "behaviour" from undecided to pinned-with-fallback, also update the R2 section if a new surface results. Easy to operationalise.
- **The slice-9 R4 test was committed with two latent test-side bugs** (wrong script ordering, wrong DB schema query) that slice 10 silently fixed. Sonnet's slice-10 commit message documents the fixes transparently, but the slice-9 red commit's `fails if` claim ("guards program.ts:104 wiring") was technically right while the test as committed would have failed for a different reason (script-mismatch exception, not wiring assertion). The `fails if` was for the *intended* failure; the test mechanism would have produced the *actual* failure. **Try:** in red commits where the production code does not yet exist, run the test once at commit time and verify the failure message names the *intended* path. If the failure is for a pre-existing test bug, fix the test bug *before* committing the red.
- **Slice 13 ended up bundling two unrelated fix-now items** (Transaction.create guard + ScriptedPrompter unit test) into a single refactor commit. Code-reviewer would have accepted them as one "Phase-4 review fixes" commit, but a sharper split — `refactor(cli/commands): guard Transaction.create failure` + `test(cli/utils): ScriptedPrompter unit test` — would have made the diff easier to scan. **Try:** when Phase-4 surfaces multiple fix-now items, prefer one commit per concern even if all land within slice 13 (multiple commits are fine; R11 disposition is per-fix-item, not per-slice).
- **The `runInteractiveLoop` change branch was already 47 LOC pre-Story-C; Story C grew it to 79 LOC** (added the suggester call + remember prompt + buffer push). Code-reviewer flagged this as soft. The `if (answer.action === 'change')` block (lines 229-280) is the natural extraction candidate. **Try:** if a fourth interactive action type ever lands, extract `handleChangeAction(...)` then. Premature now; tracked here so the trigger is explicit.

## Try

- **New Phase-2 sub-rule: "promote pinned-with-fallback decisions to R2 surface."** When Phase-2 review changes a "let Sonnet pick" decision into "pinned primary + documented fallback," scan whether the fallback adds a new CLI flag, env var, or symbol export. If so, update § Production-code surface in the plan during the Phase-2 revision commit. Codify in next process-touching PR.
- **New red-commit hygiene rule: run-the-test-and-verify-it-fails-for-the-right-reason.** Before committing a `test: — failing` commit, run the test once and confirm the failure message names the production path the `fails if` clause guards. If the failure is for a pre-existing test bug or a setup error, fix the test bug *first* and re-author the red commit. Closes the slice-9 hygiene gap.
- **New code-reviewer sub-rule: scan previous N stories' R4 claims for end-to-end paths not actually covered.** When this story adds an R4 subprocess test, retroactively check whether any R4 claim from Stories N-1 / N-2 made an end-to-end assertion that the new R4 test now exercises for the first time. Story C found a Story-A latent bug this way; the heuristic generalises.
- **Carry-overs from prior retros (now retired):**
  - "Verify named imports" sub-rule (Story A retro, applied here to `yaml.parseDocument`).
  - BDD round-trip scenario (Story A retro, landed slice 11).
  - Security-checklist user-label carve-out (Story B retro, landed slice 12 with three data points).
  - "Removing-implicit-defaults integration scan" (Story B retro): not triggered by Story C (we add, not remove).
  - "Sonnet-implementer spec includes refactor-only commits in sequence narrative" (Story B retro): not triggered (Story C had no slice-1-style pure relocations).
- **Open carry-overs (forwarded again):** R16 codification (R15-extension to zero-code stories — still 4 data points strong; awaiting next process-touching PR).
- **New future-command callout (Q2-follow-up):** a separate command analysing the *whole* committed transaction set for cross-batch pattern suggestions ("you've manually tagged 3 ALTIMA descriptions as AutoInsurance — propose a rule?"). User pre-approved deferring to a future story. Tracked in the issue body if filed; otherwise re-surface when the next epic plans for tagging UX.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** `docs/security-checklist.md` was edited in slice 12 (user-label carve-out + sanitizeFsError bullet + YAML symlink `[deferred]` note). The edits codify Story-A/B/C consistent practice; no CLAUDE.md changes needed (no new R-rule lands; Try-list defers new rules to next process-touching PR).
- [x] If yes, reconciled in this PR? N/A (no contradictions introduced).

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `suggestPattern` + `NOISE_TOKENS` (pure Core helper, property-tested) | `src/core/ingest/pattern-suggester.ts` | done (slice 1-2) |
| `ConfigWriter` port + `ConfigWriterError` discriminated union | `src/core/ports/config-writer.ts` | done (slice 4) |
| `YamlConfigWriter` infra impl: parseDocument round-trip, mtime guard, conflict reject, atomic tmp+rename, sanitizeFsError | `src/infra/config/yaml-config-writer.ts` | done (slice 4-6) |
| `confirmRememberRule` prompt method + `RememberRuleResult` type + edit-validator (compile + match + 200-char ReDoS cap) | `src/cli/utils/interactive.ts` | done (slice 7-8) |
| `runInteractiveLoop` integration: buffer remembered rules + entry rebuild on change | `src/cli/commands/ingest-command.ts` | done (slice 8 + slice 13 guard) |
| `program.ts` wiring: `FileConfigService.getResolvedConfigPath()`, mtime capture, `YamlConfigWriter` construction, exit code 5 | `src/cli/program.ts` | done (slice 8) |
| `ScriptedPrompter` + `--scripted-prompts` test-only CLI flag (NODE_ENV-gated) + focused unit test | `src/cli/utils/scripted-prompter.ts` + `src/cli/program.ts` + `tests/unit/cli/utils/scripted-prompter.test.ts` | done (slice 10 + slice 13) |
| R4 subprocess test (YAML-then-DB ordering + mtime-race abort) | `tests/integration/cli/ingest-remember-rule-wiring.test.ts` | done (slice 9-10) |
| BDD round-trip scenario (define-new + remember + re-ingest auto-tags) | `tests/features/ingest.feature` + `ingest.steps.ts` | done (slice 11 — closes Story A retro carry-over) |
| `docs/security-checklist.md` user-label carve-out + sanitizeFsError bullet + YAML symlink [deferred] | `docs/security-checklist.md` | done (slice 12 — closes Story B retro carry-over) |
| `accounting.example.yaml` 3-line hint comment about interactive write-back | `accounting.example.yaml` | done (slice 12) |
| YAML symlink-hijacking gap filed for future maint refactor | issue [#88](https://github.com/xavierbriand/accounting/issues/88) | done (slice 12) |
| Phase-4 fixes: `Transaction.create` failure guard + `ScriptedPrompter` unit test | `src/cli/commands/ingest-command.ts` + `tests/unit/cli/utils/scripted-prompter.test.ts` | done (slice 13) |
| `docs/status.md` log entry | this PR | done (Phase 5) |
| New Phase-2 sub-rule: "promote pinned-with-fallback to R2 surface" | next process-touching PR | open |
| New red-commit hygiene rule: verify-test-fails-for-right-reason | next process-touching PR | open |
| New code-reviewer sub-rule: scan previous R4 claims for end-to-end gaps | next process-touching PR | open |
| R16 codification (carry-over from maint-15 / Story B) | next process-touching PR | open |
| Future-command callout: cross-batch pattern suggester | future story | open |
| `runInteractiveLoop.handleChangeAction(...)` extraction | future Nth-action story | open |
| Local `accounting.yaml` patch applied (post-merge user task) | (no patch needed: Stories A+B+C don't change the user's existing rules; Story C only writes user-confirmed rules going forward) | N/A |
