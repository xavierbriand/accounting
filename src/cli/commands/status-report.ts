import type { BufferState } from '@core/buffers/buffer-state.js';
import type { ForecastOccurrence } from '@core/recurring/forecast-occurrence.js';
import type { SafeTransferCalculation } from '@core/transfer/safe-transfer-calculation.js';

export interface StatusReport {
  readonly asOf: string;
  readonly window: { readonly from: string; readonly to: string };
  readonly buffers: readonly BufferState[];
  readonly transfer:
    | { readonly ok: true; readonly value: SafeTransferCalculation }
    | { readonly ok: false; readonly error: string; readonly suggestedAction: string };
  readonly forecast:
    | { readonly ok: true; readonly value: readonly ForecastOccurrence[] }
    | { readonly ok: false; readonly error: string };
}
