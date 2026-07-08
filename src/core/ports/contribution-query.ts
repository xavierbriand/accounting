import type { Result } from '@core/shared/result.js';
import type { Money } from '@core/shared/money.js';

export interface PartnerContribution {
  readonly partner: string;
  readonly amount: Money;
}

export interface ContributionsInWindow {
  readonly attributed: readonly PartnerContribution[];
  readonly totalActual: Money;
}

export interface ContributionQuery {
  contributionsInWindow(currency: string, from: string, to: string): Result<ContributionsInWindow>;
}
