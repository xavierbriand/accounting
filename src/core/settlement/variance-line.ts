import type { Money } from '@core/shared/money.js';
import type { LineItemKey } from './line-item-key.js';

export type VarianceLinePresence = 'both' | 'this-only' | 'last-only';

export interface VarianceLine {
  readonly key: LineItemKey;
  readonly presence: VarianceLinePresence;
  readonly totalDelta: Money;
  readonly perPartnerDelta: ReadonlyMap<string, Money>;
}
