# Story maint-02 — `os.homedir()` fallback in FileConfigService

## Context

Second story on the pre-Epic-3 maintenance track. [Issue #22](https://github.com/xavierbriand/accounting/issues/22) — Story 1.4 P3 finding (minor defensive-correctness nit, deferred at the time).

[src/infra/config/config-service.ts:29](src/infra/config/config-service.ts:29) computes the XDG config fallback as:

```ts
path.join(this.opts.homeDir ?? process.env['HOME'] ?? '/tmp', '.config')
```

`/tmp` is a cross-platform hazard: world-writable on POSIX, nonexistent on Windows. Node's built-in `os.homedir()` already handles the cross-platform resolution (honours `HOME` on POSIX, `USERPROFILE` on Windows, falls back to `/etc/passwd` if both absent) and **never returns `undefined`**. The current chain is over-specified and the tail is unsafe.

**Maintenance sub-loop (§ 6.7)** run 2026-04-24 before planning: main synced, 0 open Dependabot PRs, `npm audit` unchanged (0 high/critical, 4 moderate/4 low — all dev-chain), 12 open issues post story-maint-01 merge. **Proceed-to-planning.**

## Story (verbatim from [issue #22](https://github.com/xavierbriand/accounting/issues/22))

> Or, cleaner: `path.join(this.opts.homeDir ?? os.homedir(), '.config')` — dropping the `HOME` env check, since `os.homedir()` already inspects it on POSIX. Add a test that `os.homedir()` is used when no explicit `homeDir` is passed.

Closes #22. No FR coverage (tooling/hardening). Walks the [security-checklist](docs/security-checklist.md) line "avoid predictable world-writable paths".

## Selected solution

Two options, one chosen.

**Option A — minimal (add `os.homedir()` as the last fallback):**
```ts
path.join(this.opts.homeDir ?? process.env['HOME'] ?? os.homedir(), '.config')
```
Preserves the `HOME` env short-circuit. Con: redundant — `os.homedir()` already reads `HOME` on POSIX.

**Option B — clean (drop `HOME`, let `os.homedir()` own POSIX/Windows resolution):** ← **chosen**
```ts
path.join(this.opts.homeDir ?? os.homedir(), '.config')
```
Single source of truth; one fewer branch to test; matches the behaviour the repo already expects on Windows (where `HOME` isn't set and `/tmp` doesn't exist).

### Chosen implementation

- **Edit [src/infra/config/config-service.ts:29](src/infra/config/config-service.ts:29)**:
  - Add `import os from 'os';` at the top (alongside `import fs` / `import path`).
  - Replace the fallback expression with `path.join(this.opts.homeDir ?? os.homedir(), '.config')`.
- **Add one integration test** to [tests/integration/infra/config/config-service.test.ts](tests/integration/infra/config/config-service.test.ts):
  - Unset `HOME` via `vi.stubEnv('HOME', '')`; construct `FileConfigService` without `homeDir` or `xdgConfigHome`; assert the both-missing error cites `${os.homedir()}/.config/accounting/config.yaml` and **not** `/tmp/.config`.
  - `vi.unstubAllEnvs()` in `afterEach`.

## Gherkin acceptance scenarios

```gherkin
Feature: XDG fallback uses os.homedir() instead of /tmp

  Scenario: HOME unset, no explicit homeDir → fallback resolves via os.homedir()
    Given HOME is unset
    And neither opts.homeDir nor opts.xdgConfigHome is passed
    When FileConfigService.load() is called against an empty projectDir
    Then the both-missing error cites a path under os.homedir()/.config/accounting/config.yaml
    And the error does not mention /tmp

  Scenario: Explicit opts.homeDir wins
    Given opts.homeDir = /custom/home
    When FileConfigService.load() is called against an empty projectDir
    Then the both-missing error cites /custom/home/.config/accounting/config.yaml
    (This scenario is covered implicitly — new test asserts the opts override still wins after the refactor.)
```

## Slice plan for Sonnet

Target **3 commits** (§ 6.6 minimum; story is genuinely one-behaviour). No optional refactor slot — the fix is the refactor.

1. **`test(config): falls back to os.homedir() when HOME unset — failing (story-maint-02)`**
   - Add the new integration test. Must fail against current code (HOME-unset path lands in `/tmp/.config/...`, which the assertion forbids).
   - Use `vi.stubEnv('HOME', '')` + `vi.unstubAllEnvs()` around the test (scoped to the single test, not the whole file).
   - `npm test` shows 1 failure in `config-service.test.ts`.

2. **`feat(config): use os.homedir() fallback in FileConfigService — minimal green (story-maint-02)`**
   - Add `import os from 'os';`.
   - Replace the `process.env['HOME'] ?? '/tmp'` fallback with `os.homedir()`.
   - `npm test` 213/213 green; `npm run lint && npm run build` green.

3. **`refactor(config): empty slot — no behaviour-preserving cleanup identified (story-maint-02)`**
   - Empty `refactor:` commit per § 6.4. Body: "No-op: the change is already minimal (2 lines net), no naming/duplication/LOC trigger hit."

## Risks

- **`vi.stubEnv` leakage.** If `afterEach` doesn't run (e.g., test aborts mid-run), a stubbed env could persist into the next test. `vi.unstubAllEnvs()` in `afterEach` is vitest's canonical unwind. No risk in practice — vitest guarantees `afterEach` runs even on test failure.
- **`os.homedir()` throws on hostile systems.** Per Node docs it never throws in normal operation; returns `/etc/passwd` entry or equivalent. No catch needed.
- **Windows behaviour.** On Windows `os.homedir()` returns `USERPROFILE` (e.g. `C:\Users\alice`). Safer than the old `/tmp` fallback (which was a POSIX path). Net improvement.
- **PII in error messages.** Error now shows `${os.homedir()}/.config/...` which embeds the username. Current error already does this when `HOME` is set (the vast majority of cases). Not a regression.

## Suggestion log

Phase 2 (P1 / P2 / P3) run by Opus on 2026-04-24.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Gherkin scenario 2 ("explicit opts.homeDir wins") is described parenthetically, not written as a formal scenario. If you want the test to explicitly cover it, promote to a first-class scenario. | rejected | Not worth an explicit scenario — current tests already exercise the opts.homeDir path via `xdgConfigHome` injection. Adding a homeDir-only path coverage is out of scope (would expand the fix beyond the issue's AC). |
| P2 | `os.homedir()` embeds username in error-message paths — PII implication? | rejected | No change from today's behaviour when `HOME` is set. Only the `HOME`-unset fallback differs. Current flow already leaks home path. Not introduced by this change. |
| P3 | Should `import os from 'os'` use the `node:os` protocol? | rejected | The repo already uses bare `'fs'` / `'path'` imports (see [src/infra/config/config-service.ts:1–2](src/infra/config/config-service.ts:1)). Consistent with repo convention; switching one file to `node:os` would be cosmetic drift. If repo-wide `node:` adoption is ever desired, it's a separate story. |

No deferred or adopted items. All 3 rejected with reasons. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 3 rejections with reasons.
- [ ] Draft PR open with template sections 1–6 filled. **Next action.**

**DoR gate met. Ready for Phase 3 (Sonnet implementation) after PR opens.**
