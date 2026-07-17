import type { CanonicalAppConfig, CanonicalSettlement } from '@core/config/config-canonical-form.js';

export interface ChangedEntry {
  readonly key: string;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly previous?: string;
  readonly current?: string;
}

export interface ChangedSection {
  readonly section: string;
  readonly entries: readonly ChangedEntry[];
}

interface FieldSpec<T> {
  readonly name: string;
  readonly valueOf: (item: T) => string | undefined;
}

// Identity-keyed array diff: a whole-element add/remove is one entry (the element's
// canonical form, JSON-stringified, as the value); an in-place field edit on a
// surviving element is one entry keyed "<identity>.<field>" with old->new values.
function diffIdentitySection<T>(
  section: string,
  previous: readonly T[],
  current: readonly T[],
  identityOf: (item: T) => string,
  fields: readonly FieldSpec<T>[],
): ChangedSection | null {
  const prevMap = new Map(previous.map((item) => [identityOf(item), item] as const));
  const currMap = new Map(current.map((item) => [identityOf(item), item] as const));
  const entries: ChangedEntry[] = [];

  for (const [id, item] of prevMap) {
    if (!currMap.has(id)) {
      entries.push({ key: id, kind: 'removed', previous: JSON.stringify(item) });
    }
  }
  for (const [id, item] of currMap) {
    if (!prevMap.has(id)) {
      entries.push({ key: id, kind: 'added', current: JSON.stringify(item) });
    }
  }
  for (const [id, currItem] of currMap) {
    const prevItem = prevMap.get(id);
    if (prevItem === undefined) continue;
    for (const field of fields) {
      const previousValue = field.valueOf(prevItem);
      const currentValue = field.valueOf(currItem);
      if (previousValue !== currentValue) {
        entries.push({ key: `${id}.${field.name}`, kind: 'changed', previous: previousValue, current: currentValue });
      }
    }
  }

  return entries.length > 0 ? { section, entries } : null;
}

function diffScalarSection(section: string, previous: string, current: string): ChangedSection | null {
  if (previous === current) return null;
  return { section, entries: [{ key: section, kind: 'changed', previous, current }] };
}

function diffSettlementSection(
  previous: CanonicalSettlement | null,
  current: CanonicalSettlement | null,
): ChangedSection | null {
  if (previous === null && current === null) return null;
  if (previous === null) {
    return { section: 'settlement', entries: [{ key: 'settlement', kind: 'added', current: JSON.stringify(current) }] };
  }
  if (current === null) {
    return { section: 'settlement', entries: [{ key: 'settlement', kind: 'removed', previous: JSON.stringify(previous) }] };
  }
  return diffIdentitySection('settlement', previous.accounts, current.accounts, (a) => a.account, [
    { name: 'partner', valueOf: (a) => a.partner },
  ]);
}

export function diffConfigs(previous: CanonicalAppConfig, current: CanonicalAppConfig): readonly ChangedSection[] {
  const sections: Array<ChangedSection | null> = [
    diffScalarSection('defaultCurrency', previous.defaultCurrency, current.defaultCurrency),
    diffScalarSection('timezone', previous.timezone, current.timezone),
    diffIdentitySection('accounts', previous.accounts, current.accounts, (a) => a.id, [
      { name: 'type', valueOf: (a) => a.type },
      { name: 'filenamePrefix', valueOf: (a) => a.filenamePrefix },
      { name: 'cardSuffix', valueOf: (a) => a.cardSuffix },
    ]),
    diffIdentitySection('splits', previous.splits, current.splits, (w) => w.validFrom, [
      { name: 'rules', valueOf: (w) => JSON.stringify(w.rules) },
    ]),
    diffIdentitySection('buffers', previous.buffers, current.buffers, (b) => b.name, [
      { name: 'account', valueOf: (b) => b.account },
      { name: 'target', valueOf: (b) => b.target },
      { name: 'targetDate', valueOf: (b) => b.targetDate },
      { name: 'cap', valueOf: (b) => b.cap },
    ]),
    diffIdentitySection('recurring', previous.recurring, current.recurring, (r) => r.name, [
      { name: 'category', valueOf: (r) => r.category },
      { name: 'cadence', valueOf: (r) => r.cadence },
      { name: 'amount', valueOf: (r) => r.amount },
      { name: 'validFrom', valueOf: (r) => r.validFrom },
      { name: 'validTo', valueOf: (r) => r.validTo },
      { name: 'amendments', valueOf: (r) => JSON.stringify(r.amendments) },
    ]),
    diffIdentitySection('autoTagRules', previous.autoTagRules, current.autoTagRules, (r) => r.pattern, [
      { name: 'category', valueOf: (r) => r.category },
    ]),
    diffSettlementSection(previous.settlement, current.settlement),
  ];

  return sections.filter((s): s is ChangedSection => s !== null);
}
