import type { Money } from '@core/shared/money.js';

export interface SplitRule {
  readonly partner: string;
  readonly ratio: number;
}

export interface SplitWindow {
  readonly validFrom: string;
  readonly rules: readonly SplitRule[];
}

export interface BufferBucket {
  readonly name: string;
  readonly account: string;
  readonly target: Money;
  readonly cap?: Money;
}

export interface AccountConfig {
  readonly id: string;
  readonly type: 'bank' | 'card';
  readonly filenamePrefix: string;
  readonly cardSuffix?: string;
}

export type RecurringCadence = 'monthly' | 'quarterly' | 'annual';

export interface RecurringAmendment {
  readonly validFrom: string;
  readonly amount: Money;
}

export interface RecurringRule {
  readonly name: string;
  readonly category: string;
  readonly cadence: RecurringCadence;
  readonly amount: Money;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly amendments: readonly RecurringAmendment[];
}

export interface AppConfig {
  readonly dbPath: string;
  readonly defaultCurrency: string;
  readonly timezone: string;
  readonly splits: readonly SplitWindow[];
  readonly buffers: readonly BufferBucket[];
  readonly accounts: readonly AccountConfig[];
  readonly recurring: readonly RecurringRule[];
}
