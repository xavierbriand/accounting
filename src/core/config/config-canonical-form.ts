import type {
  AppConfig,
  AccountConfig,
  SplitWindow,
  SplitRule,
  BufferBucket,
  RecurringRule,
  RecurringAmendment,
  SettlementConfig,
  SettlementAccountMapping,
} from '@core/config/app-config.js';
import type { AutoTagRule } from '@core/ingest/auto-tag-rules.js';

export interface CanonicalAccount {
  readonly id: string;
  readonly type: string;
  readonly filenamePrefix: string;
  readonly cardSuffix?: string;
}

export interface CanonicalSplitRule {
  readonly partner: string;
  readonly ratio: number;
}

export interface CanonicalSplitWindow {
  readonly validFrom: string;
  readonly rules: readonly CanonicalSplitRule[];
}

export interface CanonicalBuffer {
  readonly name: string;
  readonly account: string;
  readonly target: string;
  readonly targetDate: string;
  readonly cap?: string;
}

export interface CanonicalRecurringAmendment {
  readonly validFrom: string;
  readonly amount: string;
}

export interface CanonicalRecurring {
  readonly name: string;
  readonly category: string;
  readonly cadence: string;
  readonly amount: string;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly amendments: readonly CanonicalRecurringAmendment[];
}

export interface CanonicalAutoTagRule {
  readonly pattern: string;
  readonly category: string;
}

export interface CanonicalSettlementAccount {
  readonly account: string;
  readonly partner: string;
}

export interface CanonicalSettlement {
  readonly accounts: readonly CanonicalSettlementAccount[];
}

// dbPath is deliberately absent: relocating the database file is app plumbing, not a
// household rule, and an absolute filesystem path must never enter the append-only
// trail (security-checklist § Secrets & PII).
export interface CanonicalAppConfig {
  readonly defaultCurrency: string;
  readonly timezone: string;
  readonly accounts: readonly CanonicalAccount[];
  readonly splits: readonly CanonicalSplitWindow[];
  readonly buffers: readonly CanonicalBuffer[];
  readonly recurring: readonly CanonicalRecurring[];
  readonly autoTagRules: readonly CanonicalAutoTagRule[];
  readonly settlement: CanonicalSettlement | null;
}

function byKey<T>(keyOf: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

function canonicalAccount(account: AccountConfig): CanonicalAccount {
  return { id: account.id, type: account.type, filenamePrefix: account.filenamePrefix, cardSuffix: account.cardSuffix };
}

function canonicalSplitRule(rule: SplitRule): CanonicalSplitRule {
  return { partner: rule.partner, ratio: rule.ratio };
}

function canonicalSplitWindow(window: SplitWindow): CanonicalSplitWindow {
  return {
    validFrom: window.validFrom,
    rules: window.rules.map(canonicalSplitRule).sort(byKey((r) => r.partner)),
  };
}

function canonicalBuffer(buffer: BufferBucket): CanonicalBuffer {
  return {
    name: buffer.name,
    account: buffer.account,
    target: buffer.target.toString(),
    targetDate: buffer.targetDate,
    cap: buffer.cap?.toString(),
  };
}

function canonicalRecurringAmendment(amendment: RecurringAmendment): CanonicalRecurringAmendment {
  return { validFrom: amendment.validFrom, amount: amendment.amount.toString() };
}

function canonicalRecurring(rule: RecurringRule): CanonicalRecurring {
  return {
    name: rule.name,
    category: rule.category,
    cadence: rule.cadence,
    amount: rule.amount.toString(),
    validFrom: rule.validFrom,
    validTo: rule.validTo,
    amendments: rule.amendments.map(canonicalRecurringAmendment).sort(byKey((a) => a.validFrom)),
  };
}

function canonicalAutoTagRule(rule: AutoTagRule): CanonicalAutoTagRule {
  return { pattern: rule.pattern.source, category: rule.category };
}

function canonicalSettlementAccount(mapping: SettlementAccountMapping): CanonicalSettlementAccount {
  return { account: mapping.account, partner: mapping.partner };
}

function canonicalSettlement(settlement: SettlementConfig): CanonicalSettlement {
  return { accounts: settlement.accounts.map(canonicalSettlementAccount).sort(byKey((a) => a.account)) };
}

export function toCanonicalAppConfig(config: AppConfig): CanonicalAppConfig {
  return {
    defaultCurrency: config.defaultCurrency,
    timezone: config.timezone,
    accounts: config.accounts.map(canonicalAccount).sort(byKey((a) => a.id)),
    splits: config.splits.map(canonicalSplitWindow).sort(byKey((w) => w.validFrom)),
    buffers: config.buffers.map(canonicalBuffer).sort(byKey((b) => b.name)),
    recurring: config.recurring.map(canonicalRecurring).sort(byKey((r) => r.name)),
    autoTagRules: config.autoTagRules.map(canonicalAutoTagRule).sort(byKey((r) => r.pattern)),
    settlement: config.settlement ? canonicalSettlement(config.settlement) : null,
  };
}

export function canonicalConfigForm(config: AppConfig): string {
  return JSON.stringify(toCanonicalAppConfig(config));
}

export function parseCanonicalConfigForm(serialized: string): CanonicalAppConfig {
  return JSON.parse(serialized) as CanonicalAppConfig;
}
