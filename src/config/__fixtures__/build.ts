/**
 * Fixtures for the config tests.
 *
 * A document is assembled from five fragments, each defaulting to a good one, so
 * a test writes only the fragment it is exercising and the rest stays valid.
 * Without that, every test of one rule carries a full config's worth of noise
 * and quietly stops testing what its name says when an unrelated default moves.
 *
 * Nothing here is a real household's figures, and no real category name from any
 * real export appears — the same rule the ingest fixtures state.
 */

export interface ConfigParts {
  readonly exports?: string;
  readonly buffer?: string;
  readonly funding?: string;
  readonly people?: string;
  readonly envelopes?: string;
}

const DEFAULT_EXPORTS = `
[exports]
directory = "./exports"
`;

const DEFAULT_BUFFER = `
[buffer]
target = "2500.00"
`;

const DEFAULT_FUNDING = `
[funding]
cutoff_day = 25
`;

const DEFAULT_PEOPLE = `
[people.alice]
name = "Alice"
transfer_labels = ["VIR ALICE MARTIN"]

[[people.alice.income]]
label = "Salary"
monthly = "3200.00"
`;

/** Envelopes are optional, so the default is none. */
const DEFAULT_ENVELOPES = '';

export function configToml(parts: ConfigParts = {}): string {
  return [
    parts.exports ?? DEFAULT_EXPORTS,
    parts.buffer ?? DEFAULT_BUFFER,
    parts.funding ?? DEFAULT_FUNDING,
    parts.people ?? DEFAULT_PEOPLE,
    parts.envelopes ?? DEFAULT_ENVELOPES,
  ].join('\n');
}

/**
 * The example that documents the format.
 *
 * It is a fixture and a test parses it, so the documentation and the parser
 * cannot drift apart. A worked example that no longer loads is a documentation
 * bug that reads to the user as a product bug.
 */
export const EXAMPLE_TOML = `
# sluice.toml — the household's plan.
#
# Amounts are always quoted strings. A bare 7800.10 is a TOML float, and a float
# is not an exact number of cents.

[exports]
# Relative paths resolve from this file's folder, not the shell's cwd.
# A leading "~/" is expanded.
directory = "./exports"

[buffer]
# The cushion the joint account holds on top of the month's spending. Deferred
# card purchases are already spent before they are charged; this covers the gap.
target = "2500.00"

[funding]
# A contribution leaving on or after this day funds the FOLLOWING month.
# 1–28 only: the 30th does not exist in February.
cutoff_day = 25

[people.alice]
name = "Alice"
# Inbound transfers whose label contains one of these are credited to Alice.
# Case-insensitive substring, whitespace runs collapsed. Transfers matching
# nobody — or two people — stay in the unattributed band rather than be guessed.
transfer_labels = ["VIR ALICE MARTIN"]

# Exactly one of "monthly" and "annual" per entry.
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[[people.alice.income]]
label = "Profit share"
annual = "4800.00"

[people.bruno]
name = "Bruno"
transfer_labels = ["VIR B DUPONT"]

[[people.bruno.income]]
label = "Salary"
monthly = "2450.00"

# Envelopes are optional, and declaring one never hides the rest: every
# (category, sub-category) no envelope claims gets one of its own, derived from
# the ledger. This section is for grouping and planning, never for deciding
# what counts.
[envelopes.groceries]
name = "Groceries"
matches = [
  { category = "Food", sub_category = "Supermarket" },
  { category = "Food", sub_category = "Market" },
]
# Two annual scenarios: realistic, and optimised. Both or neither.
estimate = "7800.00"
goal = "7200.00"

[envelopes.home_insurance]
name = "Home insurance"
matches = [{ category = "Home", sub_category = "Insurance" }]
estimate = "480.00"
goal = "420.00"
# Taken once a year, in June. Shorthand for weights with one non-zero month.
seasonal = { months = [6] }

[envelopes.heating]
name = "Heating"
matches = [{ category = "Home", sub_category = "Energy" }]
estimate = "1440.00"
goal = "1200.00"
# Twelve relative weights, Jan→Dec, for THIS envelope. Twelve 1s is a flat year.
seasonal = { weights = [3, 3, 2, 1, 1, 1, 1, 1, 1, 2, 3, 3] }

[envelopes.leisure]
name = "Leisure"
matches = [{ category = "Leisure" }]   # a whole category
# No estimate and no goal: groups only, figures come from history.
`;
