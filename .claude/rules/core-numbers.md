---
paths:
  - "src/core/**"
  - "src/numbers/**"
---

# `src/core/` and `src/numbers/` touch nothing but their arguments

No wall clock, no disk, no network. Enforced by `src/purity.test.ts`, not
just documented; `src/config/` and `src/ingest/` are the I/O layer, on
purpose.
