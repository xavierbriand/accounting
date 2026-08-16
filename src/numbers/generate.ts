import type { Cents } from '../core/money.ts';
import { yearOf } from '../core/dates.ts';
import { envelopeIndex, type Config } from '../config/load.ts';
import type { Ledger } from '../ingest/load.ts';
import { outflow, resolveEnvelopes, transactionsFor, type ResolvedEnvelope } from './envelopes.ts';
import { resolveSeasonal, type SeasonalShape } from './seasonal.ts';
import { compare } from './funding.ts';

/**
 * The yearly rebuild, automated: read what actually happened in `year` and
 * emit a ready-to-paste `[envelopes.*]` block. This is the thing #296 was
 * opened for — the household edits the result rather than authoring it from
 * a blank page, and the spreadsheet it replaces stops being worth the
 * afternoon it used to cost.
 *
 * `config` is read for context, not required: pairs it already claims are
 * skipped (their `estimate` is a commitment the household owns, not
 * something to silently regenerate every year — see `schema.ts`), and a
 * declared envelope with nothing to show for `year` gets a note rather than
 * being ignored. `null` means a first-ever run: everything is new.
 *
 * Returns TOML text, never writes a file — nothing under `src/numbers/`
 * touches disk, and pasting the result into `sluice.toml` is meant to stay a
 * deliberate act, the moment a person notices a number that looks wrong
 * before it becomes the plan.
 */
export function generateEnvelopeBlock(ledger: Ledger, config: Config | null, year: number): string {
  const index = config === null ? null : envelopeIndex(config);

  // Two map levels, not one key joined from both — the same reason
  // resolveEnvelopes() in envelopes.ts is two levels: several of the bank's
  // real category names carry spaces, so a joined string risks two distinct
  // pairs colliding onto one key.
  const byCategory = new Map<string, Set<string>>();
  for (const t of ledger.transactions) {
    if (t.kind !== 'movement' || yearOf(t.occurredOn) !== year) continue;
    let subCategories = byCategory.get(t.category);
    if (subCategories === undefined) {
      subCategories = new Set();
      byCategory.set(t.category, subCategories);
    }
    subCategories.add(t.subCategory);
  }

  // Every new pair, sorted by (category, subCategory) rather than left in
  // ledger encounter order — the same "every list src/numbers/ produces
  // commits to an order" discipline the rest of this step follows, using
  // plain code-point comparison rather than localeCompare() for the same
  // reason envelopes.ts and funding.ts do.
  const pairs = [...byCategory.entries()]
    .flatMap(([category, subCategories]) => [...subCategories].map((subCategory) => ({ category, subCategory })))
    .filter(({ category, subCategory }) => index === null || index.find(category, subCategory) === null)
    .sort((a, b) => compare(a.category, b.category) || compare(a.subCategory, b.subCategory));

  const usedIds = new Set<string>(config?.envelopes.map((e) => e.id) ?? []);
  const blocks: string[] = [];

  for (const { category, subCategory } of pairs) {
    const candidate: ResolvedEnvelope = {
      kind: 'derived',
      id: `${category} / ${subCategory}`,
      category,
      subCategory,
    };
    const transactions = transactionsFor(candidate, ledger);
    const estimate = outflow(transactions.filter((t) => yearOf(t.occurredOn) === year));
    // `priorYear = year`, not `year - 1`: unlike the runtime call in
    // computeConsumption, which paces the year in progress against the
    // one before it, the generator is summarising the year it just
    // measured — the shape and the total it's paired with come from the
    // same twelve months, with no lag.
    const seasonal = resolveSeasonal(candidate, transactions, year);

    const id = uniqueId(slugify(`${category}_${subCategory}`), usedIds);
    blocks.push(envelopeToml(id, category, subCategory, estimate, seasonal));
  }

  const notes: string[] = [];
  if (config !== null) {
    for (const envelope of resolveEnvelopes(config, ledger)) {
      if (envelope.kind !== 'configured') continue;
      const yearOutflow = outflow(transactionsFor(envelope, ledger).filter((t) => yearOf(t.occurredOn) === year));
      if (yearOutflow === 0) {
        notes.push(`# "${envelope.config.id}" had no spending in ${year}.`);
      }
    }
  }

  if (blocks.length === 0 && notes.length === 0) {
    return `# No new spending to configure for ${year}.\n`;
  }
  return [...blocks, ...notes].join('\n\n') + '\n';
}

function envelopeToml(
  id: string,
  category: string,
  subCategory: string,
  estimate: Cents,
  seasonal: SeasonalShape,
): string {
  const euros = (estimate / 100).toFixed(2);
  const weights = seasonal.weights.join(', ');
  return [
    `[envelopes.${id}]`,
    `name = "${escapeToml(`${category} / ${subCategory}`)}"`,
    `matches = [{ category = "${escapeToml(category)}", sub_category = "${escapeToml(subCategory)}" }]`,
    `estimate = "${euros}"`,
    `seasonal = { weights = [${weights}] }`,
  ].join('\n');
}

function escapeToml(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Diacritics stripped, lowercased, anything that isn't `[a-z0-9]` folded to a single `_`. */
function slugify(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks, once NFD has split them off
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base === '' ? 'envelope' : base;
}

/** Appends `_2`, `_3`, … until `base` no longer collides with an id already in `used`, marking the result used. */
function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}
