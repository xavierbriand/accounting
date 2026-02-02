---
project_name: 'Couples Expense Sharing App'
user_name: 'User'
date: 'Mon Feb 02 2026'
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
status: 'complete'
rule_count: 25
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Runtime:** Node.js 20+ (LTS)
- **Language:** TypeScript 5.x (Strict Mode)
- **Math:** Dinero.js (Strict Integer Money)
- **Testing:** Vitest (Unit/Integration), fast-check (Property-based)
- **Validation:** Zod (Runtime Schema Validation)
- **CSV:** csv-parse

## Critical Implementation Rules

### Language-Specific Rules

- **Strict Typing:** `tsconfig.json` `strict: true` is mandatory. Do not use `any`.
- **Explicit Returns:** Publicly exported functions must have explicit return type annotations.
- **Async/Await:** Prefer `async/await` over raw `.then()` chains.
- **Imports:** Use absolute imports (if configured) or consistent relative imports.

### Framework-Specific Rules

- **Architecture:** Pragmatic Clean Architecture. `Core` (Business Logic) must NOT depend on `Infra` (DB/API) or `CLI`.
- **Dependency Injection:** Inject dependencies into `Core` services/use-cases to allow mocking in tests.
- **Zod Schemas:** Use Zod for all input validation at the boundary (CLI inputs, File reads).

### Testing Rules

- **Coverage:** 100% Branch Coverage required for `Engine`/`Core` modules.
- **Property-Based Testing:** Use `fast-check` for financial invariants (e.g., `split(amount) -> sum(parts) == amount`).
- **Structure:** Colocate tests with source files (`*.test.ts`).
- **Pattern:** Use Arrange-Act-Assert for unit tests.

### Code Quality & Style Rules

- **Formatting:** Prettier default settings.
- **Naming:** CamelCase for variables/functions, PascalCase for Classes/Types.
- **Simplicity:** Keep core logic functions small (< 50 lines) and pure where possible.

### Development Workflow Rules

- **Commits:** Conventional Commits (feat, fix, chore, docs).
- **Refactoring:** Refactor BEFORE adding new features if the codebase is brittle.

### Critical Don't-Miss Rules

- **Floating Point Math:** NEVER use `+`, `-`, `*`, `/` on money values. Use `Dinero` methods.
- **Rounding Strategy:** Use **Banker's Rounding (Round Half to Even)** to minimize cumulative error.
- **Date Handling:**
    - **System Events:** Store as UTC.
    - **Transactions:** Store as ISO 8601 with Offset (`YYYY-MM-DDTHH:mm:ss+02:00`) to preserve "receipt truth".
- **Batch Processing:** **Partial Success** allowed. If row 500 fails, commit the valid rows and queue the error for resolution (don't fail the whole batch).
- **Data Privacy:** Redact PII (IBAN, Names) in logs by default.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: Mon Feb 02 2026
