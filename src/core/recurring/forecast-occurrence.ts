import type { Money } from '@core/shared/money.js';

export interface ForecastOccurrence {
  readonly name: string;
  readonly category: string;
  readonly expectedDate: string;
  readonly amount: Money;
}
