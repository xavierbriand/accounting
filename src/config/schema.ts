// The error messages in this file are long prose whose value is that they
// explain consequences to someone editing sluice.toml once a year. Mutating
// them generates hundreds of mutants whose only question is whether some test
// happens to regex that fragment; the signal here is in operators, boundaries
// and conditionals.
//
// Scoped to this file rather than set globally in stryker.config.mjs. The same
// exclusion applied tree-wide also silences `header.split(';')`, the CSV
// delimiter, and `new TextDecoder('iso-8859-1')`, the bank export's encoding —
// strings that ARE the data-format contract, where a wrong one is a silently
// wrong number rather than a clumsy sentence.
// Stryker disable StringLiteral: the strings below are prose, not contract — see the note above
import { parse, TomlError } from 'smol-toml';
import { formatEur, type Cents } from '../core/money.ts';
import { INTERNAL_TRANSFER_SUBCATEGORY, SETTLEMENT_SUBCATEGORY } from '../ingest/ledger.ts';
import { labelMatches, matchersOverlap, normaliseLabel, type EnvelopeMatcher } from './match.ts';
import { Problems, Reader } from './values.ts';

/**
 * `sluice.toml` — everything sluice cannot read out of the bank exports, and
 * nothing it can.
 *
 * No property here is optional. A key that may be absent from the file becomes
 * either a union variant or `| null`, the way `Source` does in the ingest: it
 * keeps `exactOptionalPropertyTypes` from reaching every consumer, and it forces
 * the question "what does absent mean here" to be answered once, at the parse,
 * rather than at each use.
 */

export type { EnvelopeMatcher } from './match.ts';

/** Twelve relative weights, January to December. */
export type SeasonalWeights = readonly [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

export type IncomeSource =
  | { readonly cadence: 'monthly'; readonly label: string; readonly net: Cents }
  | { readonly cadence: 'annual'; readonly label: string; readonly net: Cents };

export interface Person {
  readonly id: string;
  readonly name: string;
  /** At least one. */
  readonly income: readonly IncomeSource[];
  /** May be empty: someone whose transfers never carry a name. */
  readonly transferLabels: readonly string[];
}

export interface EnvelopeConfig {
  readonly id: string;
  readonly name: string;
  /** At least one. */
  readonly matches: readonly EnvelopeMatcher[];
  /**
   * What this envelope is expected to cost over a year. Required.
   *
   * Written down rather than derived, and that is the whole point. Its first
   * value comes from last year's actuals — the generator hands you the figure —
   * but from then on it is a commitment you own, and last year's actuals are a
   * separate number it is compared against.
   *
   * An estimate that re-derived itself each year would track reality by
   * construction and always agree with it, which would make the drift this
   * product exists to catch invisible: spending could grow every year and the
   * plan would silently grow with it, reporting no problem at any point.
   */
  readonly estimate: Cents;
  /**
   * An optimisation target, when there is one. `null` when this envelope is
   * simply expected to cost what it costs.
   */
  readonly goal: Cents | null;
  /** `null` means take the shape from the envelope's own history. */
  readonly seasonal: SeasonalWeights | null;
}

export interface Config {
  /** As written. Resolved to an absolute path by `loadConfig`. */
  readonly exportsDirectory: string;
  readonly bufferTarget: Cents;
  /** 1–28. A contribution on or after this day funds the following month. */
  readonly fundingCutoffDay: number;
  readonly people: readonly Person[];
  readonly envelopes: readonly EnvelopeConfig[];
}

export interface ConfigErrorOptions extends ErrorOptions {
  /** Every problem found, one per entry, unformatted. */
  readonly problems?: readonly string[];
}

export class ConfigError extends Error {
  /**
   * The problems as a list, alongside the joined message.
   *
   * The message is for a terminal; the list is for anything that wants to render
   * one problem per row. Without it a caller's only route is to split the message
   * back apart on its bullet characters — re-parsing text this module already had
   * structured. `AmountParseError` and `DateParseError` carry their fields the
   * same way, for the same reason.
   */
  readonly problems: readonly string[];

  constructor(message: string, options?: ConfigErrorOptions) {
    super(message, options);
    this.name = 'ConfigError';
    this.problems = options?.problems ?? [];
  }
}

// ── reading ───────────────────────────────────────────────────────────────

function twelve(weights: readonly number[]): SeasonalWeights {
  // Length is checked by the caller; the cast is what turns a checked array into
  // the tuple that spares every consumer a `?? 0` on an index that cannot miss.
  return weights as unknown as SeasonalWeights;
}

function readSeasonal(r: Reader, problems: Problems): SeasonalWeights | null {
  const before = problems.count;
  const hasMonths = r.has('months');
  const hasWeights = r.has('weights');

  if (hasMonths && hasWeights) {
    r.skip('months');
    r.skip('weights');
    r.done();
    problems.add(
      `"${r.where}" gives both "months" and "weights". Give one: "months" is the ` +
        `shorthand for a pot that falls evenly across the months you list, "weights" ` +
        `is the general form.`,
    );
    return null;
  }
  if (!hasMonths && !hasWeights) {
    // Unknown keys first. Arriving here usually means a key was misspelt, and
    // naming the misspelling is the whole answer — where advising the user to
    // delete the table, which is all this branch could otherwise say, sends them
    // to throw away the thing they got nearly right.
    r.done();
    if (problems.count === before) {
      problems.add(
        `"${r.where}" gives neither "months" nor "weights". Remove it to take the ` +
          `shape from this envelope's own history, or say which months the money falls in.`,
      );
    }
    return null;
  }

  if (hasMonths) {
    const months = r.integerArray('months');
    r.done();
    if (months === null || problems.count !== before) return null;
    if (months.length === 0) {
      problems.add(`"${r.where}.months" is empty. List the months the money falls in.`);
      return null;
    }
    const weights = Array.from({ length: 12 }, () => 0);
    for (const m of months) {
      if (m < 1 || m > 12) {
        problems.add(
          `"${r.where}.months" contains ${m}. Months are 1 to 12, January to December.`,
        );
        return null;
      }
      weights[m - 1] = 1;
    }
    return twelve(weights);
  }

  const weights = r.integerArray('weights');
  r.done();
  if (weights === null || problems.count !== before) return null;

  if (weights.length !== 12) {
    problems.add(
      `"${r.where}.weights" has ${weights.length} entries. It needs exactly 12, ` +
        `January to December: with fewer, whichever month was dropped is the one the ` +
        `plan stops setting money aside for.`,
    );
    return null;
  }
  const negative = weights.findIndex((w) => w < 0);
  if (negative !== -1) {
    problems.add(
      `"${r.where}.weights" entry ${negative + 1} is ${weights[negative]}. A weight is ` +
        `a share of the year, and a negative share would take money back out of a ` +
        `month that has already been budgeted.`,
    );
    return null;
  }
  if (weights.every((w) => w === 0)) {
    problems.add(
      `"${r.where}.weights" are all zero. They are relative and are normalised by ` +
        `their own total, so an all-zero shape has no total to divide by and the ` +
        `envelope would be spread across no month at all. Twelve 1s is a flat year.`,
    );
    return null;
  }
  return twelve(weights);
}

function readMatcher(r: Reader, problems: Problems): EnvelopeMatcher | null {
  const before = problems.count;
  const category = r.string('category');
  const subCategory = r.optionalString('sub_category');
  const declaredSub = r.has('sub_category');
  r.done();
  if (category === null || problems.count !== before) return null;

  if (!declaredSub) return { kind: 'category', category };
  if (subCategory === null) return null;
  return { kind: 'sub-category', category, subCategory };
}

// A Map, not an object literal: an object lookup walks the prototype chain, so a
// sub-category legitimately named "constructor" or "toString" would be refused as
// reserved, with a stringified function as the explanation.
const RESERVED = new Map<string, string>([
  [
    SETTLEMENT_SUBCATEGORY,
    `is the deferred cards' monthly charge to the account, and the purchases behind ` +
      `it are already itemised on the card exports — budgeting both would inflate the ` +
      `year by roughly a third`,
  ],
  [
    INTERNAL_TRANSFER_SUBCATEGORY,
    `is the household's own transfers between its own accounts — the funding side of ` +
      `this whole exercise, not spending — so budgeting it would count money as spent ` +
      `on the way in`,
  ],
]);

function readEnvelope(id: string, r: Reader, problems: Problems): EnvelopeConfig | null {
  const before = problems.count;
  const name = r.string('name');
  const matchReaders = r.tableArray('matches');
  const matches = (matchReaders ?? [])
    .map((m) => readMatcher(m, problems))
    .filter((m): m is EnvelopeMatcher => m !== null);
  const estimate = r.money('estimate');
  const goal = r.optionalMoney('goal');
  const seasonalReader = r.optionalTable('seasonal');
  const seasonal = seasonalReader === null ? null : readSeasonal(seasonalReader, problems);
  r.done();
  if (name === null || problems.count !== before) return null;

  if (matches.length === 0) {
    problems.add(
      `Envelope "${id}" claims nothing. An envelope matching no category holds no ` +
        `transactions, but its estimate still enters the plan — so the year is ` +
        `budgeted for spending that is also counted under whatever envelope those ` +
        `transactions really land in.`,
    );
    return null;
  }

  for (const m of matches) {
    if (m.kind !== 'sub-category') continue;
    const why = RESERVED.get(m.subCategory);
    if (why === undefined) continue;
    problems.add(
      `Envelope "${id}" claims "${m.subCategory}", which ${why}. sluice classifies ` +
        `those rows before any envelope sees them.`,
    );
    return null;
  }

  if (estimate === null) return null;

  if (estimate < 0) {
    problems.add(`Envelope "${id}" has an estimate of ${formatEur(estimate)}.`);
    return null;
  }

  if (goal !== null && goal < 0) {
    // The estimate has this floor already. Without the same one here, "not above
    // the estimate" is the only constraint on the goal, and any negative value
    // satisfies it — leaving an optimised scenario that asks the household to set
    // money aside in reverse.
    problems.add(`Envelope "${id}" has a goal of ${formatEur(goal)}. A goal cannot be negative.`);
    return null;
  }

  if (goal !== null && goal > estimate) {
    problems.add(
      `Envelope "${id}" has a goal of ${formatEur(goal)} above its estimate of ` +
        `${formatEur(estimate)}. The goal is the optimised scenario and the estimate ` +
        `the realistic one, so the goal is never the larger — as written, the ` +
        `optimised plan asks for more money than the realistic one.`,
    );
    return null;
  }

  return { id, name, matches, estimate, goal, seasonal };
}

function readIncome(r: Reader, problems: Problems): IncomeSource | null {
  const before = problems.count;
  const label = r.string('label');
  const declaredMonthly = r.has('monthly');
  const declaredAnnual = r.has('annual');
  const monthly = r.optionalMoney('monthly');
  const annual = r.optionalMoney('annual');
  r.done();
  if (label === null || problems.count !== before) return null;

  if (declaredMonthly && declaredAnnual) {
    problems.add(
      `"${r.where}" gives both "monthly" and "annual". A source is one or the other ` +
        `— write two entries if the salary and the bonus are both real, or the same ` +
        `money is counted twice.`,
    );
    return null;
  }
  if (!declaredMonthly && !declaredAnnual) {
    problems.add(
      `"${r.where}" gives neither "monthly" nor "annual". Say which the figure is: a ` +
        `bonus read as a monthly salary is multiplied by twelve, and the split moves ` +
        `with it.`,
    );
    return null;
  }

  const net = declaredMonthly ? monthly : annual;
  if (net === null) return null;
  if (net < 0) {
    problems.add(`"${r.where}" is ${formatEur(net)}. Income cannot be negative.`);
    return null;
  }
  return declaredMonthly
    ? { cadence: 'monthly', label, net }
    : { cadence: 'annual', label, net };
}

function readPerson(id: string, r: Reader, problems: Problems): Person | null {
  const before = problems.count;
  const name = r.string('name');
  const declaredLabels = r.has('transfer_labels');
  const rawLabels = r.optionalStringArray('transfer_labels');
  const incomeReaders = r.tableArray('income');
  const income = (incomeReaders ?? [])
    .map((entry) => readIncome(entry, problems))
    .filter((entry): entry is IncomeSource => entry !== null);
  r.done();
  if (name === null || problems.count !== before) return null;

  if (income.length === 0) {
    problems.add(
      `Person "${id}" has no income. The split is each person's net over the ` +
        `household's, so a person with none is given a zero share and everyone else ` +
        `is asked to fund the whole household.`,
    );
    return null;
  }

  const labels: string[] = [];
  for (const [i, raw] of (declaredLabels ? (rawLabels ?? []) : []).entries()) {
    const label = normaliseLabel(raw);
    if (label === '') {
      problems.add(
        `"${r.where}.transfer_labels" entry ${i + 1} is empty. An empty label is ` +
          `contained in every string, so it would credit every inbound transfer in the ` +
          `ledger to "${id}".`,
      );
      return null;
    }
    labels.push(label);
  }

  return { id, name, income, transferLabels: labels };
}

// ── cross-record rules ────────────────────────────────────────────────────

/**
 * Reported once per pair of envelopes, not once per overlapping matcher.
 *
 * Every pair is examined — stopping at the first would leave a file with three
 * overlaps taking three runs to clean up, which is exactly the one-problem-per-run
 * behaviour this parser was built to avoid. But a whole-category matcher overlaps
 * every sub-category matcher beneath it, so reporting each of those separately
 * would bury one mistake under a dozen lines. The pair is the mistake; the first
 * overlapping claim is the evidence for it.
 */
function checkEnvelopesDoNotOverlap(envelopes: readonly EnvelopeConfig[], problems: Problems): void {
  for (let i = 0; i < envelopes.length; i++) {
    for (let j = i + 1; j < envelopes.length; j++) {
      const a = envelopes[i]!;
      const b = envelopes[j]!;
      const clash = a.matches
        .flatMap((ma) => b.matches.map((mb) => [ma, mb] as const))
        .find(([ma, mb]) => matchersOverlap(ma, mb));
      if (clash === undefined) continue;

      const [ma] = clash;
      const what =
        ma.kind === 'category' ? `"${ma.category}"` : `"${ma.category} / ${ma.subCategory}"`;
      problems.add(
        `Envelopes "${a.id}" and "${b.id}" both claim ${what}. Every transaction ` +
          `belongs to exactly one envelope: two claims on the same spending count ` +
          `it twice, once in each, and inflate the year by the size of the overlap.`,
      );
    }
  }
}

/**
 * Every colliding pair of labels, not just the first.
 *
 * Each one is a distinct edit the user has to make, so reporting one at a time
 * would cost a run per label.
 */
function checkLabelsDoNotCollide(people: readonly Person[], problems: Problems): void {
  // Unordered pairs. Both containment directions still have to be tested — which
  // label is the shorter one depends on the order they happen to be declared in —
  // but each pair is examined once, so a symmetric collision (two labels equal
  // but for case or spacing) is one problem rather than the same problem twice
  // with the roles swapped.
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i]!;
      const b = people[j]!;
      for (const inA of a.transferLabels) {
        for (const inB of b.transferLabels) {
          const found = labelMatches(inA, inB)
            ? { shortId: a.id, short: inA, longId: b.id, long: inB }
            : labelMatches(inB, inA)
              ? { shortId: b.id, short: inB, longId: a.id, long: inA }
              : null;
          if (found === null) continue;
          problems.add(
            `"${found.short}" attributes to "${found.shortId}", but "${found.longId}" ` +
              `declares "${found.long}", which contains it. Every transfer matching the ` +
              `longer label matches the shorter one too, so those transfers match two ` +
              `people and can be credited to neither — they fall into the unattributed ` +
              `band while looking configured.`,
          );
        }
      }
    }
  }
}

// ── the parse ─────────────────────────────────────────────────────────────

export function parseConfig(text: string, path: string): Config {
  let document: Record<string, unknown>;
  try {
    document = parse(text, {}) as Record<string, unknown>;
  } catch (cause) {
    if (cause instanceof TomlError) {
      throw new ConfigError(
        `"${path}" is not valid TOML: ${cause.message}. Nothing was loaded — sluice ` +
          `reads the whole plan or none of it, because a half-read plan produces a ` +
          `transfer figure that looks reasonable and is not.`,
        { cause },
      );
    }
    throw cause;
  }

  const problems = new Problems();
  const root = new Reader(document, '', problems);

  const exportsTable = root.table('exports');
  const exportsDirectory = exportsTable === null ? null : exportsTable.string('directory');
  exportsTable?.done();

  const bufferTable = root.table('buffer');
  const bufferTarget = bufferTable === null ? null : bufferTable.money('target');
  bufferTable?.done();

  const fundingTable = root.table('funding');
  const fundingCutoffDay = fundingTable === null ? null : fundingTable.integer('cutoff_day', 1, 28);
  fundingTable?.done();

  const peopleTables = root.namedTables('people');
  const people = [...(peopleTables ?? new Map())]
    .map(([id, reader]) => readPerson(id, reader, problems))
    .filter((p): p is Person => p !== null);

  const envelopeTables = root.has('envelopes') ? root.namedTables('envelopes') : new Map();
  const envelopes = [...(envelopeTables ?? new Map())]
    .map(([id, reader]) => readEnvelope(id, reader, problems))
    .filter((e): e is EnvelopeConfig => e !== null);

  root.done();

  if (bufferTarget !== null && bufferTarget < 0) {
    problems.add(
      `"buffer.target" is ${formatEur(bufferTarget)}. The buffer is a cushion the ` +
        `account holds, so it cannot be negative — a negative target would reduce ` +
        `every contribution by its size.`,
    );
  }

  if (peopleTables !== null && peopleTables.size === 0) {
    problems.add(
      `sluice.toml declares no people. The whole output is "how much should each of ` +
        `us transfer", so there is nobody to compute it for.`,
    );
  }

  checkEnvelopesDoNotOverlap(envelopes, problems);
  checkLabelsDoNotCollide(people, problems);

  if (problems.count > 0) {
    const listed = problems.list.map((message) => `  • ${message}`).join('\n');
    throw new ConfigError(
      `"${path}" has ${problems.count} problem${problems.count === 1 ? '' : 's'}:\n\n` +
        `${listed}\n\n` +
        `Nothing was loaded — sluice reads the whole plan or none of it, because a ` +
        `half-read plan produces a transfer figure that looks reasonable and is not.`,
      { problems: problems.list },
    );
  }

  return {
    exportsDirectory: exportsDirectory!,
    bufferTarget: bufferTarget!,
    fundingCutoffDay: fundingCutoffDay!,
    people,
    envelopes,
  };
}

// ── lookups ───────────────────────────────────────────────────────────────

export interface EnvelopeIndex {
  /** The declared envelope claiming this pair, or `null` — meaning it gets one of its own. */
  find(category: string, subCategory: string): EnvelopeConfig | null;
}

/**
 * Built once, queried per transaction.
 *
 * Two levels rather than one flat key, because a category matcher claims
 * sub-categories that only the ledger knows about — so a single flat map could
 * not be built from the config alone.
 */
export function envelopeIndex(config: Config): EnvelopeIndex {
  const byCategory = new Map<string, { whole: EnvelopeConfig | null; bySub: Map<string, EnvelopeConfig> }>();

  for (const envelope of config.envelopes) {
    for (const matcher of envelope.matches) {
      let entry = byCategory.get(matcher.category);
      if (entry === undefined) {
        entry = { whole: null, bySub: new Map() };
        byCategory.set(matcher.category, entry);
      }
      if (matcher.kind === 'category') entry.whole = envelope;
      else entry.bySub.set(matcher.subCategory, envelope);
    }
  }

  return {
    find(category, subCategory) {
      const entry = byCategory.get(category);
      if (entry === undefined) return null;
      return entry.bySub.get(subCategory) ?? entry.whole;
    },
  };
}

/**
 * Everyone whose declared labels catch this transfer.
 *
 * Returns every match rather than the first. More than one is ambiguous, and a
 * transfer that could be either person's is credited to neither — guessing here
 * would move real money between two people's totals.
 */
export function peopleMatching(config: Config, label: string): readonly Person[] {
  return config.people.filter((person) =>
    person.transferLabels.some((pattern) => labelMatches(pattern, label)),
  );
}
