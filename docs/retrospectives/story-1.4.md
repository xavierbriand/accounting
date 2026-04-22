# Story 1.4 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/20  **Closed:** _pending merge_

Second end-to-end run of the product development loop (first was Story 1.3). Smoother and faster than the first run — most of what we changed after Story 1.3's retro actually paid off. One new friction surfaced around commit granularity.

## Keep

- **Pre-implementation Suggestion Log caught a real issue before code was written.** P2 flagged that `superRefine` custom messages for duplicate partner / bucket names could leak PII (`"Duplicate partner: Alex"`). Sonnet implemented the PII-safe version (`path + "duplicate name"`) from the start — **zero Phase-4 blockers**. This is exactly what DoR is supposed to do.
- **Pre-delegation alias sanity** (Story 1.3 retro action) confirmed `@core/*` was wired in both `tsconfig.json` and `vitest.config.js` before spawning Sonnet — nothing to discover mid-implementation.
- **"This test fails if …" comments** (Story 1.3 retro action) landed naturally in every test. Two of them (the PII-safe assertions `expect(error).not.toContain('Alex')` and `expect(error).not.toContain('Car')`) are the kind of test that would silently rot without the comment saying what they guard.
- **`accounting.example.yaml` drift-guard test** (reads the checked-in example and runs it through the schema) is a cheap insurance policy. Catches future schema changes that would break the template silently.
- **Plan authorizing the new dep (`yaml@^2`) up-front** avoided a Sonnet stop-and-ask. The "install listed, call out in Deviations" pattern worked cleanly.

## Change

- **Commit granularity was over-specified in the plan.** Sonnet collapsed four separate commit pairs (#3+#4, #5, #7+#8, #13 green-on-landing) because the plan's step-per-test granularity was more fine-grained than the actual red→green work. Every collapse was justified, but the pattern says the plan was wrong, not the execution. Next time: plan commit sequence in terms of *slices* (one `test:` + one `feat:` per coherent slice), not per-scenario.
- **Commit subjects under-described content.** `test(config): schema rejects missing splits, non-ISO currency, ratio sum — failing` landed with all 10 unit tests + 2 property tests (not the three named). Reads fine but the subject is a partial truth. Next time: summary verbs (`test(config): schema validation suite — failing`) beat enumerations that go stale as tests accrete.
- **Minor cross-platform gap.** `FileConfigService` uses `'/tmp'` as the absolute-last HOME fallback, where `os.homedir()` would be more correct (only matters when `HOME` env var is unset — rare on POSIX, normal on Windows). Filed as #22; trivial fix when cross-platform becomes a real concern.

## Try

- **Plan-in-slices, not tests-per-commit.** A slice = one behaviour + its test(s) + the minimal code to make them green. Usually corresponds to one Gherkin scenario, not one assertion. Target 6–10 commits per story instead of 14.
- **Summary commit subjects.** `test(<scope>): <area> suite — failing (Story N.M)` rather than enumerating every case. Story id still in subject; state still (`test:`/`feat:`/`refactor:`); scenario detail lives in the commit body if needed.
- **Explicit pre-authorized deps in the plan.** The pattern was successful here; keep it: list each new dep with version and a one-line rationale, mark as "authorized"; Sonnet installs at the designated commit step.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. CLAUDE.md § 6.4 — add a line on commit subjects (summary over enumeration) | CLAUDE.md in this PR | in same commit as this retro |
| B. `os.homedir()` fallback in `FileConfigService` | issue #22 | open |
| C. Plan-time: slice-per-commit not test-per-commit — fold into the next story's planning brief | next planning session | carried forward |

## Loop metrics (second run)

- Plan phase: 1 Explore agent + 1 Plan agent + 3-pass critical review.
- Implementation: 1 Sonnet Task (9 commits — 14 planned, 5 collapsed with justification).
- Phase-4 retro: **zero blockers** (first-run had 2). Two minor observations → one follow-up issue (#22) + one commit-style action in CLAUDE.md.
- Deferred at plan: 1 issue (#21 dbPath traversal).
- Deferred from retro: 1 issue (#22 HOME fallback).
- Time-to-DoD: roughly on par with Story 1.3, but with far less Phase-4 churn — the DoR gate earned its keep.
