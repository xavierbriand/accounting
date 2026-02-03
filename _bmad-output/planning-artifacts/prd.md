---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish']
inputDocuments: ['_bmad-output/planning-artifacts/product-brief-accounting-2026-02-02.md', '_bmad-output/project-context.md', '_bmad-output/brainstorming/brainstorming-session-2026-02-02.md']
workflowType: 'prd'
classification:
  projectType: 'cli_tool'
  domain: 'fintech'
  complexity: 'high'
  projectContext: 'greenfield'
---

# Product Requirements Document - Couples Expense Sharing App

**Author:** Xavier
**Date:** Tue Feb 03 2026

## Success Criteria

### User Success

*   **The "Zero-Stress" Transfer:** >90% of monthly transfers completed within 24 hours of notification (high trust signal).
*   **The "Thriving" Buffer:** User shifts from "avoiding overdraft" to "building buffer" (months of continuous buffer growth).
*   **"Friction-Free" Settlement:** Users actively utilize "Turn Taking" (in-kind resolution) for small balances rather than petty cash transfers.
*   **"The Silence Metric":** Users spend < 5 minutes/month managing finances (Passive vs Active management).
*   **Emotional Safety:** Users report a reduction in "Money Anxiety" and "Relationship Friction" due to finances.

### Business Success

*   **Trust Retention (North Star):** <5% Churn Rate after Month 3 (High switching costs due to accumulated buffers + trust).
*   **Conflict De-Escalation:** **Unedited Transfer Rate > 80%**. (If users accept the calculated transfer without editing it, they trust the system's fairness).
*   **Referral Coefficient:** Users refer the app to friends specifically as a "Relationship Saver."

### Technical Success

*   **Financial Accuracy:** 100% precision in integer math (Zero floating point errors).
*   **Settlement Invariant Tests:** Mathematical proofs that *Total In = Total Out* run on every commit.
*   **Fixed Cost Prediction:** Variance between Predicted vs Actual Fixed Costs < 5%.
*   **System Blame:** The system correctly identifies "Model Failure" vs "User Spending" in 100% of buffer depletion events (to preserve user relationships).
*   **Test Coverage:** 100% Branch Coverage for the Core Engine (as per Engineering Standards).

### Measurable Outcomes

*   **Time to Trust:** < 7 days from "First Import" to "First Unedited Transfer."
*   **Buffer Utilization:** > 90% of irregular expenses covered by existing buffer (Prediction Accuracy).

## Product Scope

### MVP - Minimum Viable Product

*   **Input Mechanism:** CSV Import (3 months history) + Manual "Life Object" Tagging.
*   **Configuration:** **"Rules of Engagement" Config (YAML):** Define Split Rules (Income vs Asset) and Buffer Targets in code.
*   **Core Engine:**
    *   **Liquidity Controller:** Calculates "Safe Monthly Transfer" based on future liabilities.
    *   **Buffer Logic:** Simple bucket system (House, Car, Vacation) that fills/drains.
    *   **Penny-Perfect Math:** Strict integer-based currency handling.
    *   **Dynamic Equity Splits:** Support for time-series split rules (e.g., changing from 50/50 to 60/40 on a specific date).
*   **Interface:** CLI / Text-Based Interface.
    *   **"Conversational CFO":** Generates human-readable explanations for transfer amounts.
    *   **Commands:** `ingest`, `status`, `explain`, `settle`, `edit` (Soft Edit).

### Growth Features (Post-MVP)
*   **Web Interface (PWA):** Visual dashboards for "Buffer Health" and "Equity Splits."
*   **Bank Sync:** Plaid/GoCardless integration for auto-ingestion.
*   **"Turn-Taking" Gamification:** UI features to suggest "Date Night" instead of cash settlement.
*   **"The Spoiler Protocol":** Feature to mask transaction descriptions ("Gift") until a specific date.
*   **Forex Settlement:** Logic to handle multi-currency exchange rates during settlement.

### Vision (Future)
*   **"The Arbitrator":** AI agent that actively mediates financial disputes based on fairness principles.
*   **"Family Office":** Expansion into Estate Planning, Insurance Optimization, and Investment tracking.

## User Journeys

**1. Journey: "The Sunday Morning Audit" (The CFO Partner)**
*   **Opening:** It's Sunday morning. Alex (CFO) usually dreads this time—opening the complex Excel sheet, finding missing receipts, and preparing to "nag" Sam for money. The tension is palpable.
*   **Rising Action:** Alex opens the terminal and runs `accounting ingest -f bank_export.csv`. The system parses 150 transactions in seconds.
*   **Climax:** The system flags 3 ambiguous items. Alex quickly tags them using arrow keys. The system calculates the monthly transfer: "$1,600 (Includes +$100 catch-up for Winter Heating)."
*   **Resolution:** Alex copies the simple summary text and sends it to Sam. No complex spreadsheet screenshots, no arguments. The task took 4 minutes. Alex feels *relief* and *control*.

**2. Journey: "The Emergency Tire Replacement" (The Participant Partner)**
*   **Opening:** Sam (Participant) is at the mechanic. The bill is $400 for new tires. Sam freezes—is there enough in the joint account? Will this ruin their savings goal? The "Scarcity Panic" sets in.
*   **Rising Action:** Instead of calling Alex in a panic, Sam texts the `accounting` bot: `check car buffer`.
*   **Climax:** The bot replies instantly: "Car Maintenance Buffer: $650 available. Safe to spend."
*   **Resolution:** Sam pays the bill with the joint card, feeling *empowered* and *informed*. Later, Sam logs it: `spent 400 on tires`. The bot confirms: "Buffer updated. Remaining: $250."

**3. Journey: "The System Takes the Blame" (The Virtual Agent)**
*   **Opening:** A surprise annual subscription ($200) hits the account. The "Subscriptions" buffer only has $50. Normally, this would cause a fight: "Who forgot to cancel this?"
*   **Rising Action:** The System's *Liquidity Controller* detects the shortfall. It scans other buckets for available liquidity.
*   **Climax:** The System issues a "Mea Culpa" notification: *"Alert: Unexpected charge detected. My prediction model missed this. I have covered it using the 'General Savings' overflow. I recommend increasing the monthly subscription transfer by $15."*
*   **Resolution:** The couple reads the notification. They roll their eyes at the "dumb bot" but agree to the increase. The conflict is directed at the *system*, not each other.

**4. Journey: "The Promotion & The Config Tweak" (The Developer/Admin)**
*   **Opening:** Alex gets a promotion. The couple agrees to shift from a 50/50 split to 60/40 to reflect the new income reality.
*   **Rising Action:** Alex opens `config.yaml` in VS Code. They update the `income_ratio` variable.
*   **Climax:** Alex runs `accounting test --dry-run`. The system simulates the next transfer, showing the new split. Crucially, it runs a *Historical Integrity Check* to ensure past months' data remains unchanged (50/50).
*   **Resolution:** Alex commits the config change. The system is updated. The change is transparent, version-controlled, and mathematically safe.

**5. Journey: "The Clean Break" (Data Exit)**
*   **Opening:** The relationship ends. Both users need to separate their finances cleanly and fairly.
*   **Rising Action:** User runs `accounting export --all`.
*   **Climax:** System generates two encrypted archives containing all history, labeled by "Contributor". It provides a final "Settlement Balance" to zero out the books.
*   **Resolution:** Users have their data. The shared instance is wiped. The system facilitates a fair exit without bias.

**6. Journey: "The Job Loss" (Dynamic Equity Logic)**
*   **Opening:** Sam loses their job in March. The couple agrees to shift the split from 50/50 to 80/20 (Alex pays more) effective March 15th.
*   **Rising Action:** Alex updates `splits.yaml` adding a new rule: `{ date: "2026-03-15", ratio: "80/20" }`.
*   **Climax:** When settling March expenses, the system checks every transaction date. A grocery run on March 10th is split 50/50. A utility bill on March 20th is split 80/20.
*   **Resolution:** The final transfer amount respects the precise timing of the life event. Sam feels supported, not indebted.

## Domain-Specific Requirements

### Compliance & Data Privacy
*   **Local-Only Sovereignty:** All data (CSVs, Ledger, SQLite DB) must reside locally on the user's machine. No cloud sync for MVP.
*   **Zero-Knowledge Architecture:** The application logic must not require external API calls that transmit financial data.
*   **PII Redaction:** Any logs generated by the system (for debugging) must automatically redact IBANs, Account Numbers, and specific Transaction Descriptions.

### Technical Constraints (The "Bank-Grade" Standard)
*   **Append-Only Ledger:** The core ledger is **Immutable**.
    *   *Constraint:* Users cannot "Edit" a past transaction directly.
    *   *Pattern:* To fix an error, the system must generate a "Reversal" transaction and a new "Correction" transaction (Double-Entry principles).
    *   *UX:* The "Soft Edit" command in CLI handles this complexity automatically (User sees "Edit", System does "Reverse + Post").
*   **Integer Math (Dinero.js):** All monetary values are stored as Integers (Cents). Floating point arithmetic is strictly forbidden in the codebase.
*   **ACID Compliance:** The local SQLite database must enforce strict transactional integrity. A batch import either fully succeeds or fully fails (no partial states).
*   **Multi-Currency Data Structure:** The schema must support `{ amount: Int, currency: ISO_CODE }` from Day 1 to allow for future Forex features without schema migration.

### Integration Requirements
*   **Bank Export Standard:** The CSV Importer must be "Schema Agnostic" but "Type Strict." It must be able to map varying bank formats (Date, Amount, Desc) into the strict internal ledger format without data loss.

### Risk Mitigations
*   **Data Corruption Risk:**
    *   *Mitigation:* Automatic "Snapshot" backups of the SQLite DB before every `ingest` or `settle` command.
*   **Settlement Drift:**
    *   *Mitigation:* The "Invariant Test" (Total In = Total Out) must run after every write operation. If the invariant breaks, the transaction rolls back immediately.

## Innovation & Novel Patterns

### Detected Innovation Areas

*   **Relationship-First Financial Engine:** Unlike typical finance apps that optimize for accounting accuracy, this engine optimizes for *Relationship Harmony*. It actively absorbs conflict (System Blame) and prioritizes "Friction-Free" resolution over granular tracking.
*   **Predictive Pre-Funding (The Subscription Model):** Shifts shared expenses from a reactive "Reimbursement" model (past-focused) to a predictive "Subscription" model (future-focused). This creates a stable "Monthly Fee" for the household, smoothing volatility.
*   **Dynamic Time-Series Equity:** A novel approach to splitting expenses that respects the *timeline* of income changes. By using "Effective Dates" for split rules, the system handles life events (Job Loss, Raises) without requiring a "Reset" or complex manual math, maintaining historical integrity.

### Market Context & Competitive Landscape

*   **Splitwise:** Excellent for transactional splitting (roommates), but fails at "Equity" (Income-based splits) and "Asset Building" (Joint Savings).
*   **Mint/Copilot:** Excellent for tracking/budgeting, but single-player focused. They lack the "Negotiation" and "Settlement" logic required for two distinct financial entities.
*   **Joint Bank Accounts:** The "dumb pipe" solution. Offers no intelligence on *how much* to put in, leading to the "Transfer Problem" this app solves.

### Validation Approach

*   **The "Unedited Transfer" Metric:** The primary validation signal is when users stop checking the math. If >80% of transfers are accepted without manual override, the "Fairness Engine" is validated.
*   **Relationship Sentiment:** Qualitative surveys asking "Do you fight less about money?" rather than "Did you save money?".

### Risk Mitigation

*   **Model Failure Risk:** If the "Predictive Engine" is wrong (underestimates expenses), it could cause an overdraft.
    *   *Mitigation:* The "Buffer Bucket" logic explicitly separates "Operational Cash" from "Reserve Cash," ensuring a safety floor is always maintained.
*   **Trust Erosion:** If the system is perceived as biased.
    *   *Mitigation:* "Audit Trail Clarity" and "System Blame" notifications ensure the user understands *why* a number changed, and that the error is impartial.

## CLI Tool Specific Requirements

### Project-Type Overview
A dual-mode CLI tool designed for "Personal Finance Engineering." It balances high-touch interactive workflows (tagging) with low-touch automation (settlement scripts).

### Command Structure Architecture
*   **Mode Separation:** Commands must explicitly handle `stdout` vs `stderr`.
    *   *Interactive Mode:* Uses `stderr` for prompts/spinners so `stdout` remains clean for piping.
    *   *Scriptable Mode:* All commands accept `--non-interactive` (or `--ci`) to fail fast on prompts.
*   **Core Verbs:**
    *   `accounting ingest`: Interactive tagging loop.
    *   `accounting status`: Read-only view of buffers.
    *   `accounting settle`: Write-only generation of transfer amounts.
    *   `accounting config`: Manage rules/schema.
    *   `accounting edit`: (Soft Edit) UX command that generates reversal + correction transactions.

### Output Formats
*   **Dual Output:** Every command must support `--json`.
    *   *Default:* Human-readable tables (using libraries like `cli-table3` or `ink`) with "Conversational CFO" personality (helpful, blameless).
    *   *JSON:* Machine-parsable output for future Web/Dashboard integration.

### Configuration Schema
*   **File Format:** YAML for human readability (comments supported).
*   **Location Strategy:**
    *   The tool looks for `accounting.yaml` in the current directory (Project-based).
    *   If not found, it checks `XDG_CONFIG_HOME/accounting/config.yaml`.
    *   **State Location:** The SQLite DB path is defined *inside* the config file (e.g., `db_path: ./ledger.db`), allowing users to place the DB in a synced folder (Dropbox) while keeping the config separate if desired.

### Scripting Support
*   **Exit Codes:** Strict adherence to POSIX exit codes (0 = Success, 1 = Error, 2 = Invalid Input).
*   **Idempotency:** `ingest` and `settle` commands must be idempotent where possible (re-running `ingest` on the same file should skip duplicates without error).

### UX Ergonomics (The "Delightful" CLI)
*   **Smart Ingest Loop:** The `ingest` command should pre-process and auto-tag transactions where possible, only asking the user for confirmation on low-confidence items ("Found 50 items. Auto-tagged 45. Review remaining 5?").
*   **Transactional Safety:** Critical operations (ingest, settle) default to a "Staging/Dry-Run" mode, requiring an explicit confirmation ("Commit these 50 transactions? [Y/n]") to prevent accidental data corruption.
*   **"Conversational CFO" Persona:** Output messages should be phrased as a helpful, neutral assistant ("I noticed a large expense..." rather than "Error: Limit Exceeded").

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** "The Engineer's Utility." Focus on solving the *data integrity* and *math trust* problem first with a high-reliability CLI tool. UI and Automation come later.
**Resource Requirements:** Single Developer (You). Local execution environment.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
*   The Sunday Morning Audit (Ingest & Tag)
*   The Config Tweak (Dynamic Splits)
*   The Emergency Tire Replacement (Buffer Check via CLI)

**Must-Have Capabilities:**
*   **CLI Engine:** `ingest`, `status`, `settle`, `config` commands.
*   **Core Logic:** Liquidity Controller, Buffer Buckets, Dynamic Equity Splits.
*   **Data Integrity:** Local SQLite, Append-Only Ledger, Integer Math.
*   **UX:** Interactive Tagging Loop with Smart Defaults.

### Post-MVP Features

**Phase 2 (Growth - The Visual Layer):**
*   **PWA / Web Dashboard:** Visual graphs of "Buffer Health" and "Equity Splits."
*   **Read-Only JSON API:** To feed the dashboard from the local CLI/DB.
*   **Spoiler Protocol:** Gift hiding mechanism.

**Phase 3 (Expansion - The Automation):**
*   **Bank Sync:** Plaid/GoCardless integration to remove CSV manual steps.
*   **AI Arbitrator:** Advanced logic for dispute mediation.
*   **Family Office:** Estate/Investment features.

### Risk Mitigation Strategy

**Technical Risks:** Complex Time-Series Logic (Dynamic Splits).
*   *Mitigation:* "Settlement Invariant Tests" (Mathematical proofs run on every commit).

**Market Risks:** CLI Friction limits adoption (Partner acceptance).
*   *Mitigation:* "Conversational CFO" personality makes the text output feel human and helpful, reducing the "intimidation factor" of a terminal tool.

**Resource Risks:** Single Developer Bottleneck.
*   *Mitigation:* "Local-Only" architecture drastically reduces dev ops/infra work (no server, no cloud DB, no auth), keeping the scope manageable for one person.

## Functional Requirements

### Configuration & Rules

- FR1: **Admin User** can configure **Split Rules** (e.g., Income Ratio 60/40) via a YAML configuration file.
- FR2: **Admin User** can define **Buffer Buckets** (e.g., "Car", "House") with target amounts and caps via YAML.
- FR3: **System** can validate the configuration file structure and data types upon load, rejecting invalid configs with clear error messages.

### Data Ingestion

- FR4: **User** can ingest transaction history from standard CSV bank exports (multi-bank support).
- FR5: **User** can interactively **Tag** transactions into predefined buckets via the CLI interface.
- FR6: **System** can automatically tag transactions based on exact merchant name matches from previous history.
- FR7: **System** can identify and skip duplicate transactions during ingestion to ensure **Idempotency**.

### Core Engine (Liquidity & Math)

- FR8: **System** can calculate the **Safe Monthly Transfer** amount required from each partner based on splits and liability forecasts.
- FR9: **System** can perform all currency calculations using **Integer Math** (cents) to ensure zero floating-point errors.
- FR10: **System** can manage **Buffer Levels**, automatically filling or draining buckets based on expense flow and target rules.
- FR11: **System** can predict recurring **Fixed Costs** (subscriptions, rent) to reserve liquidity in advance.
- FR12: **System** can apply **Dynamic Equity Splits** based on transaction dates relative to "Effective Date" rules (e.g., change split from 50/50 to 60/40 on March 1st).
- FR22: **System** can perform **Deterministic Temporal Calculations**, ensuring that re-running a settlement for a past month yields the exact same result regardless of the current system date.

### Transaction Management (Ledger)

- FR13: **System** can record all financial events in an **Append-Only Ledger** (SQLite), preventing direct modification of history.
- FR14: **User** can "Edit" a past transaction via a **Soft Edit** command, which triggers a Reversal and a Correction entry.
- FR15: **System** can enforce **Double-Entry Consistency**, ensuring every debit has a matching credit within the ledger.
- FR16: **System** can store monetary values with their associated **Currency Code** (ISO 4217) to support future multi-currency features.
- FR17: **System** can create a **Snapshot Backup** of the database before any write operation (ingest/settle).
- FR21: **User** can perform a **Graceful Dissolution** (Data Wipe), exporting all personal data to portable formats and securely resetting the application state.

### Reporting & Output

- FR18: **User** can view current **Buffer Status** and "Safe to Spend" amounts via a CLI command (`status`).
- FR19: **System** can generate **Human-Readable Explanations** ("Conversational CFO") for why a transfer amount changed (e.g., "Increased due to higher heating bill").
- FR20: **System** can output all command results in **JSON Format** to support external dashboards or piping.
- FR23: **System** can generate an **Immutable Audit Trail** of all user actions (ingests, edits, config changes) to ensure transparency and accountability.

## Non-Functional Requirements

### Performance

- **Read Latency (Status/Help):** Read-only commands must execute in **< 500ms** to ensure the tool feels "instant" for quick checks.
- **Write Latency (Ingest/Settle):** Write operations are permitted up to **2000ms** to accommodate mandatory ACID transaction locking and snapshot generation.
- **Ingestion Throughput:** The system must be able to parse, deduplicate, and dry-run **1,000 transactions in < 2 seconds** on standard hardware (M1/M2/Intel i5).

### Data Integrity & Safety

- **Mathematical Precision:** The system must have **0% usage of floating-point arithmetic** for currency values. All financial calculations must be integer-based.
- **Penny Allocation Protocol:** To handle indivisible splits (e.g., 100 / 3), the system must use a deterministic algorithm (e.g., "Largest Remainder Method") to assign the residual penny, ensuring `Sum(Shares) == Total` strictly holds.
- **Settlement Invariant:** The system must enforce that `Sum(Credits) + Sum(Debits) = 0` for every transaction group. If this invariant fails, the write operation must be rejected automatically.
- **ACID Compliance:** The SQLite configuration must be set to `WAL` mode with `synchronous = NORMAL` or higher to ensure database integrity.
- **Snapshot Reliability:** The system must successfully create a `.bak` copy of the database before every write operation (`ingest`, `settle`) with **100% reliability**.

### Security & Privacy

- **Network Isolation:** The core application logic must make **zero (0) outgoing network requests** automatically.
    - *Exception:* Network access is permitted ONLY when the user explicitly runs `accounting update --check`.
- **Log Redaction:** Debug logs must automatically detect and redact patterns matching IBANs, Credit Card Numbers, and Bank Account Numbers.
- **File Permissions:** Created database and configuration files must default to `600` (User Read/Write Only) permissions on Unix-like systems.

### Usability & Ergonomics

- **Safe Mode Recovery:** If the system detects a corrupt SQLite file on startup, it must offer an interactive "Repair" workflow to restore the most recent valid snapshot.
- **Error Recovery:** **100% of user-facing error messages** must include a "Suggested Action" or "Why this happened" explanation, avoiding raw stack traces in `stderr`.
- **Interactive Navigation:** The `ingest` loop must support standard terminal navigation keys (Arrow Up/Down, Enter, Esc, 'j'/'k') for accessibility and speed.
- **Exit Code Standards:** The application must strictly adhere to POSIX exit codes (0 for success, >0 for specific failure modes).
