---
paths:
  - "app/**"
---

# `app/` has no automated tests, by design

`vitest.config.ts` scopes `src/**` only; `tsc --noEmit` still covers
`app/**`. The absence is a decision from the original page-building plan,
not an oversight — verify a change here in a browser, against real data
where possible (`SLUICE_CONFIG_DIR=~/sluice-private`), not by reaching for a
component-test runner.
