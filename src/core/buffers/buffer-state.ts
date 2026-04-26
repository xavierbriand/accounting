import type { Money } from '@core/shared/money.js';

export type BufferStatus = 'below' | 'on-target' | 'above-cap';

export interface BufferState {
  readonly name: string;
  readonly balance: Money;
  readonly target: Money;
  readonly cap?: Money;
  readonly status: BufferStatus;
}
