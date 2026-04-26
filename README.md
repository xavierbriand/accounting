# accounting

A local-first, CLI-based **predictive asset-based financial engine** for couples managing joint finances. It replaces reactive "top up the joint account again" conversations with a deterministic engine that predicts fair monthly transfers, buffers financial volatility, and keeps an auditable append-only ledger — all on your laptop, no cloud.

Full problem framing and vision: [docs/product-brief.md](docs/product-brief.md).

## Status

Active development.

- **Epic 1 (Foundation)** — complete. Money value object, append-only ledger, migration runner, YAML config.
- **Epic 2 (Transaction Ingestion & Tagging)** — complete. BPCE CSV parsing, idempotent ingest, auto-tagger + card-settlement classifier, interactive review, atomic commit with snapshot + rollback.
- **Epic 3 (Predictive Engine)** — in progress. Story 3.1 (Versioned Split Rules) shipped; Story 3.2 (Predictive Transfer Engine) is up next.
- **Refactor epic (Epic M-A)** — running in parallel; 15 maintenance stories shipped, including a full BDD harness, dist-compile subprocess test infrastructure, `Result` combinators, YAML-authoritative `dbPath`, and dedicated `plan-reviewer` / `code-reviewer` sub-agents for the development loop.

See [docs/epics.md](docs/epics.md) for the roadmap and [docs/status.md](docs/status.md) for the per-story log.

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

## Configuration

The app reads its split rules and buffer targets from `accounting.yaml` in the project root. This file is git-ignored because it contains household data.

```bash
cp accounting.example.yaml accounting.yaml
# Edit accounting.yaml with your own values
```

Alternatively, place the config at `$XDG_CONFIG_HOME/accounting/config.yaml` (defaults to `~/.config/accounting/config.yaml`). The project-root file takes precedence if both are present.

See `accounting.example.yaml` for the full schema with inline documentation.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Run the full test suite with Vitest |
| `npm run lint` | ESLint across the repo |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run migrate` | Apply pending SQL migrations to the local SQLite DB |
| `npm run ingest -- --file <path>` | Parse a bank CSV, auto-tag, interactively review, and commit transactions (use `--non-interactive` for CI; `--json` for machine-readable output) |

## Documentation

- [docs/status.md](docs/status.md) — Current position and per-story merge log
- [docs/prd.md](docs/prd.md) — Product requirements & non-functional requirements
- [docs/architecture.md](docs/architecture.md) — Architectural decisions (layering, money storage, versioning)
- [docs/epics.md](docs/epics.md) — Epics and stories roadmap
- [docs/product-brief.md](docs/product-brief.md) — Problem statement, target users, success criteria
- [CLAUDE.md](CLAUDE.md) — Project rules for AI-assisted development

## License

ISC
