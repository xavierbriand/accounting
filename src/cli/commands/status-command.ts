// Slice 1 stub — implementation pending (Slice 3)
import type { BufferStateService } from '@core/buffers/buffer-state-service.js';
import type { RecurringForecastService } from '@core/recurring/recurring-forecast-service.js';
import type { SafeTransferCalculator } from '@core/transfer/safe-transfer-calculator.js';

export interface StatusCommandDeps {
  readonly buffersService: BufferStateService;
  readonly forecastService: RecurringForecastService;
  readonly transferCalculator: SafeTransferCalculator;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  readonly clock: () => string;
}

export interface StatusCommandOptions {
  readonly asOf?: string;
  readonly from?: string;
  readonly to?: string;
  readonly json: boolean;
}

export function nextCalendarMonth(_asOf: string): { from: string; to: string } {
  throw new Error('nextCalendarMonth not implemented');
}

export async function runStatusCommand(
  _opts: StatusCommandOptions,
  _deps: StatusCommandDeps,
): Promise<number> {
  throw new Error('runStatusCommand not implemented');
}
