# Project status

Authoritative source for "where we are." [CLAUDE.md § 1](../CLAUDE.md) points here.

## Current position

- **Epic 1** — complete. Stories 1.1–1.4 (project scaffold, Money, Ledger, Config) shipped.
- **Epic 2** — complete. Stories 2.1–2.5 (Ingest + Tagging + Commit) shipped.
- **Epic 3** — in progress. Stories 3.1 (Versioned Split Rules) + 3.2 (Buffer State Reader) + 3.3 (Recurring Cost Forecast) shipped.
- **Refactor epic (Epic M-A)** — story-maint-01 through story-maint-15 shipped.
- **Next:** Story 3.4 planning (Safe Monthly Transfer Calculator — see [epics.md](epics.md)).

## Refresh trigger

Update this file in the same commit as the retrospective for any story that:

- ships an epic-level milestone, OR
- starts a new epic, OR
- changes the "Next" line.

Routine maint-story merges only need a status-log entry (newest first).

## Status log

Append-only one-line summary per merged story. Newest first.

- **2026-04-28** — Story B shipping (#82, closes #74). YAML becomes the only source of `autoTagRules`: grouped-by-category schema, regex pre-compiled in superRefine, category strings validated via Story A's `validateNewCategoryName` (relocated to `src/core/categories/`). `DEFAULT_RULES` deleted; `TransactionBuilder` rules param required; `program.ts:104` wires `config.autoTagRules`. `accounting.example.yaml` carries the 8-category migration; user's local `accounting.yaml` updated via manual diff in the PR description.
- **2026-04-28** — Story A merged (#78). Inline `+ Define new category…` in the ingest prompt; pure `validateNewCategoryName` 5-rule pipeline (ASCII `toLowerCase()` for locale-determinism); `RESERVED_TOKENS` exported; `@inquirer/core` declared as direct dep for `ExitPromptError`; in-batch propagation only — Stories B/C handle persistence. First real-story dogfood for `plan-reviewer` + `code-reviewer` agents (12 + 12 findings, all actionable).
- **2026-04-27** — Story 3.3 shipping. Recurring Cost Forecast: `RecurringForecastService` (pure Core, no port) + `cadence.ts` helpers with anchor-ratchet DoM clamp (recovers leap years correctly: `2024-02-29` annual → `2025-02-28, 2026-02-28, 2027-02-28, 2028-02-29`). New YAML `recurring:` section with per-rule `validFrom`/`validTo`/`amendments[]` lifecycle, three cadences (monthly/quarterly/annual). Variance/validation against actuals deferred to Story 3.4. Phase 4 also fixed a pre-existing canonicalize flake (R9 inline).
- **2026-04-26** — Story 3.2 merged (#76). Buffer State Reader: `BufferStateService` (pure Core, mirrors `SplitRulesService`) + `BufferLedgerQuery` port returning `Result<Money>` + `SqliteBufferLedgerQuery` adapter using `substr(occurred_at, 1, 10) <= ?` for receipt-truth same-day inclusivity. Establishes bucket→ledger-account convention via explicit `account` field on `BufferBucket`. First epic-3 story to round-trip both `plan-reviewer` and `code-reviewer` sub-agents end-to-end.
- **2026-04-26** — story-maint-15 merged (#71). README.md status section + Scripts table refresh (`npm run ingest` added, Documentation list points to status.md); status log catches up with maint-13 / maint-14.
- **2026-04-26** — story-maint-14 merged (#70). `code-reviewer` sub-agent for Phase 4 retro-check + CLAUDE.md § 6.1 phase 4 wiring. Symmetric to plan-reviewer; tier-separated scan vs tag.
- **2026-04-26** — story-maint-13 merged (#69). `plan-reviewer` sub-agent for Phase 2 critical review + CLAUDE.md § 6.1 phase 2 wiring + § 6.3 session-restart note for new custom agents. Dogfood test caught and fixed `docs/architecture.md` validity-window drift inherited from maint-12.
- **2026-04-26** — story-maint-12 merged (#68). Process refresh: CLAUDE.md compressed (168 → 140 lines), `docs/status.md` introduced as authoritative current-position source, maintenance-sub-loop checklist extracted to template, drift-detection retro item added, story-maint-09 Try-1 disposition recorded.
- **2026-04-26** — story-maint-11 merged (#67). `Result` combinators (`map`, `flatMap`, `getOrElse`, `Result.all`) + SQLite `busy_timeout=5000` pragma + YAML-authoritative `dbPath` (closes #65) + `findDuplicateIndices` extracted (closes #56).
- **2026-04-26** — story-maint-10 merged (#66). Epic-2 BDD backfill (`tests/features/ingest.feature`, `commit.feature`); dist-compile subprocess harness via `tests/_setup/build-dist.ts`.
- **2026-04-25** — story-maint-09 merged (#64). Ingest CLI factory wiring fix (closes #60) + retire stale Story-2.5 prompt (closes #61). Codified composition-root subprocess test rule (R4).
- **2026-04-25** — Story 3.1 merged (#53). Versioned Split Rules — validity-window foundation; first acceptance-feature file landed.
- **2026-04-25** — story-maint-08 merged (#55). dinero.js v1 → v2 (full Money rewrite).
- **2026-04-25** — story-maint-07 merged (#54). TypeScript 5.9.3 → 6.0.3.
- **2026-04-25** — story-maint-06 merged (#52). ESLint 9 → 10 migration. Codified major-bump-zero-code subcase (R15).
- **2026-04-25** — story-maint-05 merged (#48). @inquirer/prompts 5 → 8 migration.
- **2026-04-25** — story-maint-04 merged (#50). validateDbPath against symlink hijacking.
- **2026-04-25** — story-maint-03 merged (#45). Friendly 'run migrate' hint for uninitialised DB.
- **2026-04-24** — story-maint-02 merged (#44). os.homedir() fallback in FileConfigService.
- **2026-04-24** — story-maint-01 merged (#41). tsconfig.test.json so tsc type-checks test files.
- **2026-04-22** — Story 2.5 merged (#33). Atomic commit with snapshot + rollback.
- **2026-04-22** — Story 2.4 merged (#32). Interactive ingest command + filename-prefix matcher.
- **2026-04-22** — Story 2.3 merged (#31). Transaction builder + auto-tagger + card-settlement classifier.
- **2026-04-22** — Story 2.2 merged (#30). Idempotency service + SHA-256 hash column.
- **2026-04-21** — Story 2.1 merged (#28). BPCE CSV parser + timezone/accounts config.
- **2026-04-21** — Story 1.4 merged (#20). YAML configuration manager + 0600 DB perms.
- **2026-04-20** — Story 1.3 merged (#16). Ledger schema & repository.
- **(earlier)** — Story 1.2 (Money value object) and Story 1.1 (project scaffold).
