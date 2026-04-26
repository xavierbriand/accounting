import { Result } from '@core/shared/result.js';
import type { RecurringRule } from '@core/config/app-config.js';
import type { ForecastOccurrence } from './forecast-occurrence.js';

export class RecurringForecastService {
  constructor(private readonly _rules: readonly RecurringRule[]) {}

  forecastBetween(_from: string, _to: string): Result<readonly ForecastOccurrence[]> {
    return Result.fail('service not implemented');
  }
}
