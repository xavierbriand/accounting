import type { Money } from '@core/shared/money.js';

export interface LineItem {
  readonly kind: 'forecast' | 'buffer-topup';
  readonly date: string;
  readonly category: string;
  readonly description: string;
  readonly gross: Money;
  readonly perPartnerSplit: ReadonlyMap<string, Money>;
}
