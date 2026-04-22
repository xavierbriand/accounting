import type { Money } from '@core/shared/money.js';

export interface SplitRule {
  readonly partner: string;
  readonly ratio: number;
}

export interface BufferBucket {
  readonly name: string;
  readonly target: Money;
  readonly cap?: Money;
}

export interface AccountConfig {
  readonly id: string;
  readonly filenamePrefix: string;
}

export interface AppConfig {
  readonly dbPath: string;
  readonly defaultCurrency: string;
  readonly timezone: string;
  readonly splits: readonly SplitRule[];
  readonly buffers: readonly BufferBucket[];
  readonly accounts: readonly AccountConfig[];
}
