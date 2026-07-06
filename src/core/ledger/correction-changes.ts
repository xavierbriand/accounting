import type { Money } from '@core/shared/money.js';

export interface CorrectionChanges {
  readonly amount?: Money;
  readonly account?: string;
  readonly date?: string;
  readonly description?: string;
}
