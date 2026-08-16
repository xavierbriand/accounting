import type { Cents } from '../../core/money.ts';
import type { Day } from '../../core/dates.ts';
import type { Transaction, TransactionKind } from '../../ingest/ledger.ts';
import { reconcileSettlements } from '../../ingest/reconcile.ts';
import type { Ledger } from '../../ingest/load.ts';
import type { Source } from '../../ingest/sources.ts';
import { parseConfig, type Config, type IncomeSource, type Person } from '../../config/schema.ts';
import { configToml, type ConfigParts } from '../../config/__fixtures__/build.ts';

/**
 * Fixtures shared across every PR in this step, extended additively as later
 * ones need more — never by changing an existing default, which would
 * silently shift what an earlier, already-merged PR's tests actually assert.
 * Same discipline `config/__fixtures__/build.ts`'s `ConfigParts` already
 * applies, one level up: everything here defaults to something usable, and a
 * test overrides only the part it is exercising.
 *
 * `src/numbers/` operates one layer above ingest and config — on already
 * -parsed `Transaction`s and a `Config`, not on bank export bytes or TOML
 * text — so fixtures here build those shapes directly rather than going
 * through `csvFixture`/`ofxFixture`. Parsing itself is proven by steps 1
 * and 2's own suites; this step's tests have no reason to re-exercise it.
 */

const ACCOUNT: Source = { kind: 'account', id: '00000000001' };

export interface TxParts {
  readonly id?: string;
  readonly kind?: TransactionKind;
  readonly occurredOn: string; // YYYY-MM-DD
  readonly settlesOn?: string; // YYYY-MM-DD, defaults to occurredOn
  readonly amount: Cents;
  readonly label?: string;
  readonly category?: string;
  readonly subCategory?: string;
  readonly source?: Source;
}

/**
 * One transaction. `id` defaults to a value derived from the other fields
 * rather than a shared counter, so two fixtures built in any order, in any
 * test, never collide and never depend on execution order. Includes `kind`
 * specifically: a `movement` and a `settlement` on the same day for the same
 * amount is an ordinary fixture to want, and without `kind` in the mix the
 * two would default to the same id. Two rows that are genuinely identical in
 * every field this touches still need an explicit `id` from the caller.
 */
export function tx(parts: TxParts): Transaction {
  const kind = parts.kind ?? 'movement';
  return {
    id: parts.id ?? `${parts.occurredOn}:${kind}:${parts.label ?? parts.category ?? 'movement'}:${parts.amount}`,
    source: parts.source ?? ACCOUNT,
    kind,
    occurredOn: parts.occurredOn as Day,
    settlesOn: (parts.settlesOn ?? parts.occurredOn) as Day,
    amount: parts.amount,
    label: parts.label ?? '',
    description: '',
    notes: '',
    operationType: '',
    category: parts.category ?? 'Alimentation',
    subCategory: parts.subCategory ?? 'Supermarche',
  };
}

/**
 * Wraps transactions into a `Ledger`, reconciled for real via
 * `reconcileSettlements` rather than a stubbed report — `src/numbers/` never
 * reads `reconciliation` itself, but building an honest one costs nothing
 * and means a fixture never has to fake a shape it doesn't understand.
 */
export function ledgerOf(transactions: readonly Transaction[]): Ledger {
  const data = { transactions, sources: [] };
  return { ...data, reconciliation: reconcileSettlements(data) };
}

export interface PersonParts {
  readonly id: string;
  readonly name?: string;
  readonly income?: readonly IncomeSource[];
  readonly transferLabels?: readonly string[];
}

export function person(parts: PersonParts): Person {
  return {
    id: parts.id,
    name: parts.name ?? parts.id,
    income: parts.income ?? [{ cadence: 'monthly', label: 'Salary', net: 300000 }],
    transferLabels: parts.transferLabels ?? [],
  };
}

/**
 * Two people, one configured envelope over `Alimentation / Supermarche`,
 * leaving every other category to be derived — the shape every later PR in
 * this step (3b onward) needs to exercise both a configured and a derived
 * envelope from the same document.
 */
const NUMBERS_PARTS: ConfigParts = {
  people: `
[people.alice]
name = "Alice"
transfer_labels = ["VIR ALICE MARTIN"]

[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[people.bruno]
name = "Bruno"
transfer_labels = ["VIR B DUPONT"]

[[people.bruno.income]]
label = "Salary"
monthly = "2450.00"
`,
  envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Alimentation", sub_category = "Supermarche" }]
estimate = "1200.00"
`,
};

export function numbersConfig(overrides: ConfigParts = {}): Config {
  return parseConfig(configToml({ ...NUMBERS_PARTS, ...overrides }), 'sluice.toml');
}
