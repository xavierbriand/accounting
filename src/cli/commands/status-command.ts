import type { BufferStateService } from '@core/buffers/buffer-state-service.js';
import type { RecurringForecastService } from '@core/recurring/recurring-forecast-service.js';
import type { SafeTransferCalculator } from '@core/transfer/safe-transfer-calculator.js';
import type { StatusReport } from './status-report.js';
import { formatStatusJson } from './status-formatter-json.js';
import { formatStatusHuman } from './status-formatter-human.js';

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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function nextCalendarMonth(asOf: string): { from: string; to: string } {
  const [year, month] = asOf.split('-').map(Number) as [number, number];
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const from = `${nextYear}-${pad2(nextMonth)}-01`;

  // Last day of nextMonth: new Date(year, monthIndex+1, 0) gives last day of month at monthIndex
  // monthIndex is 0-based, so nextMonth-1 is the 0-based index; nextMonth is the 1-based index.
  // new Date(nextYear, nextMonth, 0) gives last day of month nextMonth in year nextYear.
  const lastDay = new Date(nextYear, nextMonth, 0).getDate();
  const to = `${nextYear}-${pad2(nextMonth)}-${pad2(lastDay)}`;

  return { from, to };
}

function buildSuggestedAction(error: string): string {
  const match = /buffer "([^"]+)"/.exec(error);
  if (match) {
    const bucketName = match[1];
    return `Update ${bucketName}'s targetDate in accounting.yaml (buffers[].targetDate) to a future date.`;
  }
  return 'Check the accounting.yaml buffers configuration.';
}

export function assembleStatusReport(
  opts: StatusCommandOptions,
  asOf: string,
  from: string,
  to: string,
  deps: Pick<StatusCommandDeps, 'buffersService' | 'forecastService' | 'transferCalculator'>,
): StatusReport {
  const bufferStateResult = deps.buffersService.getStateAsOf(asOf);
  const buffers = bufferStateResult.isFailure ? [] : [...bufferStateResult.value];

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

  // Validate --as-of if provided
  if (opts.asOf !== undefined && !ISO_DATE.test(opts.asOf)) {
    stderr.write(`error: --as-of must be ISO 8601 date (YYYY-MM-DD), got "${opts.asOf}"\n`);
    return 2;
  }

  // Validate --from / --to if provided
  if (opts.from !== undefined && !ISO_DATE.test(opts.from)) {
    stderr.write(`error: --from must be ISO 8601 date (YYYY-MM-DD), got "${opts.from}"\n`);
    return 2;
  }
  if (opts.to !== undefined && !ISO_DATE.test(opts.to)) {
    stderr.write(`error: --to must be ISO 8601 date (YYYY-MM-DD), got "${opts.to}"\n`);
    return 2;
  }

  const asOf = opts.asOf ?? clock();

  // Compute or accept window
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

  // Get buffer state — if this fails, exit 1 (unrecoverable)
  const bufferStateResult = deps.buffersService.getStateAsOf(asOf);
  if (bufferStateResult.isFailure) {
    stderr.write(`error: ${bufferStateResult.error}\n`);
    return 1;
  }

  // Assemble the full report (forecast + transfer may fail; handled inline)
  const report = assembleStatusReport(opts, asOf, from, to, deps);

  // Write output
  if (opts.json) {
    stdout.write(formatStatusJson(report));
  } else {
    stdout.write(formatStatusHuman(report));
  }

  return 0;
}
