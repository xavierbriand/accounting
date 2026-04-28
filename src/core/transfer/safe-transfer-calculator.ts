import { Result } from '@core/shared/result.js';
import type { SplitRulesService } from '@core/splits/split-rules-service.js';
import type { BufferStateService } from '@core/buffers/buffer-state-service.js';
import type { RecurringForecastService } from '@core/recurring/recurring-forecast-service.js';
import type { SafeTransferCalculation } from './safe-transfer-calculation.js';

// STUB — implementation lands in slice 5 (forecast) and slice 7 (buffer-topup).
export class SafeTransferCalculator {
  constructor(
    private readonly splitsService: SplitRulesService,
    private readonly buffersService: BufferStateService,
    private readonly forecastService: RecurringForecastService,
  ) {}

  calculateForWindow(
    _asOf: string,
    _from: string,
    _to: string,
  ): Result<SafeTransferCalculation> {
    return Result.fail('SafeTransferCalculator not yet implemented');
  }
}
