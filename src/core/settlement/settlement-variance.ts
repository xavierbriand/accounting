import type { Money } from '@core/shared/money.js';
import type { VarianceLine } from './variance-line.js';
import type { FollowThrough } from './follow-through.js';

export interface SettlementVariance {
  readonly lines: readonly VarianceLine[];
  readonly totalDelta: Money;
  readonly perPartnerDelta: ReadonlyMap<string, Money>;
  readonly followThrough: FollowThrough;
}
