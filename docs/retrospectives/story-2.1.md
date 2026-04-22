# Story 2.1 retrospective

**PR:** _pending_ (will be linked on draft PR open)  **Closed:** pending merge

Third end-to-end run of the product development loop (first two were Stories 1.3 and 1.4) and the first one whose scope meaningfully shifted mid-planning. The user handed over five real BPCE bank exports partway through the plan; the raw data forced a scope re-frame (one real French format, not "monzo + chase"; a `sourceAccount` field; a new `timezone` config field). The re-scope was absorbed cleanly because the plan was still in flight. Nine code commits + one refactor commit + this retro.

## Keep

- **Planning against real user data caught a major scope re-frame before implementation.** The user's mid-plan drop of five real CSVs (one joint account + four cards, BPCE group) invalidated the initial "monzo + chase" sketch — real constraints were `;` delimiter, `,` decimals, DD/MM/YYYY dates, Latin-1 encoding, separate Debit/Credit columns, and a 13-column schema. Reading the files before finalising the plan surfaced every one of those *and* exposed the card-vs-account double-counting concern. A plan built without seeing the data would have been wrong in specific, discoverable-only-at-implement-time ways.
- **Plan agent pushback was load-bearing.** Three decisions flipped on the Plan agent's critique:
  - Positional `parse(content, format, currency)` → options object `parse(content, { ... })` (avoids string-arg swap footgun).
  - Signed `Money` on `IngestItem` → `{ direction, Money≥0 }` (aligns with `Entry`'s shape so Story 2.3 doesn't re-derive sign).
  - BOM/CRLF + comma-decimal handling pulled *into* scope (Plan agent flagged them as real-world CSV bite).

  None of these would have been caught by P1/P2/P3 alone — they were naming/shape concerns that a stress-test reviewer catches.
- **Security-checklist walked against the code during the phase-2 review, not just the plan.** P3 review caught the plan's reliance on `Money.fromDecimal` — whose internal `amount * factor` is float arithmetic — and specifically the fact that going from CSV string to a JS number at the parser boundary forces a `parseFloat`-equivalent round-trip. Plan was rewritten pre-implementation to use regex → integer cents → `Money.fromCents`, eliminating float math entirely. Walking the checklist on the plan (not just the final diff) saved a refactor round.
- **Explicit `sourceAccount` field from day one avoided a downstream breaking-change.** The user's "five files, five sources" observation was a product insight; routing it through `ParseOptions → IngestItem` at Story 2.1 time means Story 2.2 (idempotency) and Story 2.3 (reconciliation) receive a ready-to-use label instead of synthesising one from the filename. Idempotency hashes can include it from the start.
- **`file -I` encoding check before planning.** The main-account file is ISO-8859-1; the card files happen to be ASCII-clean. If Opus had used the default Read tool without encoding inspection, the first run would have shown mojibake (`CHEQUE N�`) and the plan would have either (a) ignored the encoding issue or (b) guessed it wrong. One shell command ruled out the guess.

## Change

- **Slice granularity was too fine for an adapter story — three of five `test:` commits landed green-on-landing.** The `feat(ingest): BPCE adapter minimal green` commit (slice 4) naturally implemented BOM-stripping, per-row error collection, direction-from-column, file-level header validation, and DST-aware offsets in one pass. Those are CSV-adapter basics — you cannot write a minimum-viable CSV adapter that omits them without writing an unnatural broken one. The plan asked for four separate red→green pairs for behaviours that the first `feat:` covered inherently. Per Story 1.4 retro this risks divorcing the planned commit sequence from the actual execution — here it happened, and the green-on-landing commit messages call it out, but the plan's slice boundaries were the root cause. **Pattern for next adapter story:** one `test:` + `feat:` pair for the adapter's obvious basics (happy path + the invariants any correct implementation satisfies), then one dedicated red→green pair per deliberately-counterintuitive rule (e.g., chase's sign-inversion, a bank-specific edge case).
- **Sonnet substituted `regex + manual validation` for the plan's "per-row Zod row schema" without flagging it in the Deviations section.** The commit message for slice 4 mentions "Zod-free row validation", but Sonnet's return report listed three minor deviations and omitted this one. Functionally both are equivalent (validated at boundary, PII-safe, integer-cent math) — but the plan called for Zod and the substitution deserves an explicit "here's why I didn't use the tool the plan named." Per `.claude/agents/sonnet-implementer.md` § 1, structural deviations should stop-and-ask; tool-substitution is borderline structural. Action item A below.
- **Story size grew mid-plan (timezone config + `accounts` config + new ingest types + adapter + 5 fixtures) but the plan was still delivered in 10 commits.** Borderline for the § 6.6 "3 Gherkin scenarios max, one Sonnet task round" guideline. Nothing broke, but an earlier trigger to split would have been healthy — e.g., extracting the timezone/accounts config changes into a pre-2.1 maintenance PR. Not a blocker; noting as a calibration signal.

## Try

- **"Obvious basics" slice pattern for adapter stories.** When the next Sonnet plan involves an adapter (bank format, export target, file reader), recognise that its minimum-viable implementation includes a large set of intrinsic behaviours (encoding tolerance, per-row isolation, header validation, etc.). Plan: one `test:` + `feat:` pair for the adapter's obvious basics and the invariants they must satisfy; then one red→green pair per deliberately-non-obvious rule. Target 5–7 commits instead of 9–10. This dovetails with Story 1.4 retro's "plan-in-slices" guidance — slices-per-behaviour here means fewer, broader slices for adapter code.
- **Add a pre-return question to Sonnet's brief: "List every tool/library you used that wasn't the one the plan named."** One line in the invocation brief ("if you substituted X for Y, record it under Deviations") would have caught the Zod → regex change. Cheaper than retrofitting a structural review.
- **Produce a plan-vs-code delta table in Phase 4's retro-check output.** Rather than walking the three P-phases as prose, keep a compact "plan said X / code did Y / resolution" table alongside. Makes the Phase 4 output portable directly into the PR's Suggestion Log (section 7) and surfaces plan-deviations that Sonnet missed. Variant of Story 1.4's "this test fails if …" pattern, applied to the code instead of the tests.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Update `.claude/agents/sonnet-implementer.md` § 1 — tool/library substitutions MUST appear under "Deviations", not just in commit messages | `.claude/agents/sonnet-implementer.md` in this PR | in same commit as this retro |
| B. Add "adapter story sizing" note to CLAUDE.md § 6.6 — one slice for obvious basics, one per counterintuitive rule | CLAUDE.md in this PR | in same commit as this retro |
| C. File issue for pre-return Sonnet question ("list tool/lib substitutions") | new GH issue | open — small workflow improvement; will file post-merge |
| D. Encoding caveat: Story 2.4 MUST read BPCE files with `fs.readFileSync(path, 'latin1')` | covered by issue #25 (filename matcher) + a dedicated note in Story 2.4's plan | open — surfaced at Story 2.4 planning |

## Loop metrics (third run)

- **Plan phase:** 2 Explore agents (codebase landscape + maintenance audit) + 1 Plan agent (stress-test) + 3-pass Opus critical review + 1 user-driven scope re-frame (real bank data).
- **Implementation:** 1 Sonnet task (9 commits — 9 planned, 0 collapsed, 3 green-on-landing — documented per slice) + 1 Sonnet refactor task (1 commit for `parseRow` extraction).
- **Phase-4 retro-check:** 1 blocker (parse method >50 LOC — fixed in refactor) + 2 non-blocker findings (Zod deviation not flagged; csv-parse error-message passthrough could include raw content — both logged in PR Suggestion Log).
- **Deferred at plan:** 0 issues filed from the plan.
- **Deferred at review:** 5 issues (#23–#27) covering multi-bank support, quickpickle wiring, filename-prefix matcher, card-reconciliation, throughput benchmark.
- **Scope re-frame cost:** one plan rewrite and one AskUserQuestion round; absorbed cleanly because the user-driven scope change arrived mid-plan rather than mid-implementation.
- **Time-to-DoD:** one working session, same as Stories 1.3 and 1.4 despite larger scope.
