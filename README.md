# accounting

A local-first, CLI-based **predictive asset-based financial engine** for couples managing joint finances. It replaces reactive "top up the joint account again" conversations with a deterministic engine that predicts fair monthly transfers, buffers financial volatility, and keeps an auditable append-only ledger — all on your laptop, no cloud.

Full problem framing and vision: [docs/product-brief.md](docs/product-brief.md).

## Status

Early development. Epic 1 (Foundation) in progress — the money value object and migration runner are in place; next up is the double-entry ledger schema and repository. See [docs/epics.md](docs/epics.md) for the roadmap.

## Stack

Node.js 20 · TypeScript (strict) · SQLite (`better-sqlite3`, WAL) · `dinero.js` · `commander` · `zod` · `vitest` + `fast-check`.

## Requirements

- Node.js **20+** (LTS)
- npm

## Setup

```bash
npm ci
npm run migrate
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Run the full test suite with Vitest |
| `npm run lint` | ESLint across the repo |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run migrate` | Apply pending SQL migrations to the local SQLite DB |

## Documentation

- [docs/prd.md](docs/prd.md) — Product requirements & non-functional requirements
- [docs/architecture.md](docs/architecture.md) — Architectural decisions (layering, money storage, versioning)
- [docs/epics.md](docs/epics.md) — Epics and stories roadmap
- [docs/product-brief.md](docs/product-brief.md) — Problem statement, target users, success criteria
- [CLAUDE.md](CLAUDE.md) — Project rules for AI-assisted development

## License

ISC
