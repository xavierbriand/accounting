# accounting

A local-first, CLI-based **predictive asset-based financial engine** for couples managing joint finances. It replaces reactive "top up the joint account again" conversations with a deterministic engine that predicts fair monthly transfers, buffers financial volatility, and keeps an auditable append-only ledger — all on your laptop, no cloud.

Full problem framing and vision: [docs/product-brief.md](docs/product-brief.md).

## Two core domains

This repo develops two things at once, each with its own user-owned ubiquitous language:

- **Shared Finances** — the product: a deterministic predictive engine for couples' joint finances. Language: [docs/domain/glossary.md](docs/domain/glossary.md).
- **Dev Harness** — the control system that develops the product: an agentic dev loop with enforced language, agent roles, and mechanical gates so controls can't be silently forgotten or mis-scoped. Language: [docs/harness/glossary.md](docs/harness/glossary.md), tooling: [harness/README.md](harness/README.md), workflow: [CLAUDE.md](CLAUDE.md).

Strategic view of both, and how they relate: [docs/domain/context-map.md](docs/domain/context-map.md).

## Status

*Refresh when the 'Next' line in [`docs/status.md`](docs/status.md) changes, or when adding a new top-level npm script.*

Active development.

- **Epic 1 (Foundation)** — complete. Money value object, append-only ledger, migration runner, YAML config.
- **Epic 2 (Transaction Ingestion & Tagging)** — complete. BPCE CSV parsing, idempotent ingest, auto-tagger + card-settlement classifier, interactive review, atomic commit with snapshot + rollback.
- **Epic 3 (Predictive Engine)** — complete. Versioned split rules, buffer state reader, recurring cost forecast, safe monthly transfer calculator, status CLI command.
- **Refactor epic (Epic M-A)** — story-maint-01 through story-maint-16 shipped, including a full BDD harness, dist-compile subprocess test infrastructure, `Result` combinators, YAML-authoritative `dbPath`, and dedicated `plan-reviewer` / `code-reviewer` sub-agents for the development loop.
- **Next:** Epic 4 (Trust, Transparency & Lifecycle).
- **Harness engineering curriculum** (non-product, tracked separately) — skill-development track on agentic engineering, sequenced cheapest-first across 6 modules. See [docs/learning/harness-engineering.md](docs/learning/harness-engineering.md).

See [docs/epics.md](docs/epics.md) for the roadmap, [docs/status.md](docs/status.md) for the current epic position, and [docs/status.d/](docs/status.d/) for per-story log fragments (newest first).

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

- [docs/status.md](docs/status.md) — Current epic position (per-story log fragments live in [docs/status.d/](docs/status.d/))
- [docs/prd.md](docs/prd.md) — Product requirements & non-functional requirements
- [docs/architecture.md](docs/architecture.md) — Architectural decisions (layering, money storage, versioning)
- [docs/epics.md](docs/epics.md) — Epics and stories roadmap
- [docs/product-brief.md](docs/product-brief.md) — Problem statement, target users, success criteria
- [docs/harness/glossary.md](docs/harness/glossary.md) — Dev Harness ubiquitous language
- [docs/harness/control-inventory.md](docs/harness/control-inventory.md) — Every dev-loop control, classified
- [CLAUDE.md](CLAUDE.md) — Project rules for AI-assisted development

## License

ISC
