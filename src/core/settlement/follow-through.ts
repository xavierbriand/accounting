import type { Money } from '@core/shared/money.js';

export interface PartnerFollowThrough {
  readonly suggested: Money;
  readonly actual: Money;
  readonly delta: Money;
}

export interface FollowThrough {
  readonly perPartner: ReadonlyMap<string, PartnerFollowThrough>;
  readonly totalSuggested: Money;
  readonly totalActual: Money;
  readonly totalDelta: Money;
}
