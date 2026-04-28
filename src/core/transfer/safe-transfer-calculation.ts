import type { Money } from '@core/shared/money.js';
import type { LineItem } from './line-item.js';

export interface SafeTransferCalculation {
  readonly totalRequired: Money;
  readonly perPartner: ReadonlyMap<string, Money>;
  readonly lineItems: readonly LineItem[];
}
