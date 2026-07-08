import type { Money } from '@core/shared/money.js';
import type { VarianceLine } from '@core/settlement/variance-line.js';
import type { FollowThrough } from '@core/settlement/follow-through.js';

export interface ExplainWindow {
  readonly from: string;
  readonly to: string;
}

export interface ExplainVarianceOk {
  readonly lines: readonly VarianceLine[];
  readonly totalDelta: Money;
  readonly perPartnerDelta: ReadonlyMap<string, Money>;
}

export interface ExplainReport {
  readonly asOf: string;
  readonly thisWindow: ExplainWindow;
  readonly lastWindow: ExplainWindow;
  readonly variance:
    | { readonly ok: true; readonly value: ExplainVarianceOk }
    | { readonly ok: false; readonly error: string; readonly suggestedAction: string };
  readonly followThrough:
    | { readonly ok: true; readonly value: FollowThrough }
    | { readonly ok: false; readonly notConfigured: true }
    | { readonly ok: false; readonly error: string; readonly suggestedAction: string };
}
