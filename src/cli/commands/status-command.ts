import type { BufferStateService } from '@core/buffers/buffer-state-service.js';
import type { BufferState } from '@core/buffers/buffer-state.js';
import type { RecurringForecastService } from '@core/recurring/recurring-forecast-service.js';
import type { SafeTransferCalculator } from '@core/transfer/safe-transfer-calculator.js';
import type { StatusReport } from './status-report.js';
import { formatStatusJson } from './status-formatter-json.js';
import { formatStatusHuman } from './status-formatter-human.js';
import { nextCalendarMonth } from '../utils/settle-window.js';
import { ISO_DATE, buildSuggestedAction } from '../utils/report-command.js';

// Re-exported for existing importers (status unit tests import nextCalendarMonth
// from this module) — the window/as-of composition itself now lives in
// ../utils/settle-window.ts, shared with the explain command (story-4.3b, #208 item 1).
export { nextCalendarMonth };

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

export function assembleStatusReport(
  asOf: string,
  from: string,
  to: string,
  buffers: readonly BufferState[],
  deps: Pick<StatusCommandDeps, 'forecastService' | 'transferCalculator'>,
): StatusReport {
  const forecastResult = deps.forecastService.forecastBetween(from, to);
  const forecast = forecastResult.isFailure
    ? ({ ok: false as const, error: forecastResult.error })
    : ({ ok: true as const, value: forecastResult.value });

  const calcResult = deps.transferCalculator.calculateForWindow(asOf, from, to);
  const transfer = calcResult.isFailure
    ? ({
        ok: false as const,
        error: calcResult.error,
        suggestedAction: buildSuggestedAction(calcResult.error),
      })
    : ({ ok: true as const, value: calcResult.value });

  return {
    asOf,
    window: { from, to },
    buffers,
    transfer,
    forecast,
  };
}

export async function runStatusCommand(
  opts: StatusCommandOptions,
  deps: StatusCommandDeps,
): Promise<number> {
  const { stdout, stderr, clock } = deps;

  if (opts.asOf !== undefined && !ISO_DATE.test(opts.asOf)) {
    stderr.write(`error: --as-of must be ISO 8601 date (YYYY-MM-DD), got "${opts.asOf}"\n`);
    return 2;
  }
  if (opts.from !== undefined && !ISO_DATE.test(opts.from)) {
    stderr.write(`error: --from must be ISO 8601 date (YYYY-MM-DD), got "${opts.from}"\n`);
    return 2;
  }
  if (opts.to !== undefined && !ISO_DATE.test(opts.to)) {
    stderr.write(`error: --to must be ISO 8601 date (YYYY-MM-DD), got "${opts.to}"\n`);
    return 2;
  }

  const asOf = opts.asOf ?? clock();

  let from: string;
  let to: string;
  if (opts.from !== undefined && opts.to !== undefined) {
    if (opts.from > opts.to) {
      stderr.write(`error: --from must be <= --to, got from="${opts.from}", to="${opts.to}"\n`);
      return 2;
    }
    from = opts.from;
    to = opts.to;
  } else {
    const defaultWindow = nextCalendarMonth(asOf);
    from = defaultWindow.from;
    to = defaultWindow.to;
  }

  // Buffer-state failure is unrecoverable (DB-level, currency mismatch). Exit 1 — distinct
  // from the calc-failure path below, which is informational and exits 0 (buffers rendered).
  const bufferStateResult = deps.buffersService.getStateAsOf(asOf);
  if (bufferStateResult.isFailure) {
    stderr.write(`error: ${bufferStateResult.error}\n`);
    return 1;
  }

  const report = assembleStatusReport(asOf, from, to, bufferStateResult.value, deps);

  if (opts.json) {
    stdout.write(formatStatusJson(report));
  } else {
    stdout.write(formatStatusHuman(report));
  }

  return 0;
}
