import { Money } from '@core/shared/money.js';
import { Result } from '@core/shared/result.js';
import type { SafeTransferCalculator } from '@core/transfer/safe-transfer-calculator.js';
import type { SafeTransferCalculation } from '@core/transfer/safe-transfer-calculation.js';
import type { ContributionQuery, ContributionsInWindow } from '@core/ports/contribution-query.js';
import { explainSettlementVariance } from '@core/settlement/settlement-variance-service.js';
import type { ExplainReport, ExplainWindow } from './explain-report.js';
import { formatExplainJson } from './explain-formatter-json.js';
import { formatExplainHuman } from './explain-formatter-human.js';
import { nextCalendarMonth, previousSettleWindow } from '../utils/settle-window.js';
import { ISO_DATE, buildSuggestedAction } from '../utils/report-command.js';
import { writeJsonErrorIf } from '../utils/json-envelope.js';

export interface ExplainCommandDeps {
  readonly transferCalculator: SafeTransferCalculator;
  readonly contributionQuery: ContributionQuery;
  readonly settlementConfigured: boolean;
  readonly clock: () => string;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

export interface ExplainCommandOptions {
  readonly asOf?: string;
  readonly json: boolean;
}

const DATA_CHECK_ACTION = 'Check the settlement configuration and ledger data for this window.';

function zeroMoney(currency: string): Money {
  return Money.fromCents(0, currency).value;
}

function emptyContributions(currency: string): ContributionsInWindow {
  return { attributed: [], totalActual: zeroMoney(currency) };
}

function emptyCalculation(currency: string): SafeTransferCalculation {
  return { totalRequired: zeroMoney(currency), perPartner: new Map(), lineItems: [] };
}

const NOT_CONFIGURED: ExplainReport['followThrough'] = { ok: false, notConfigured: true };

interface ReportSections {
  readonly variance: ExplainReport['variance'];
  readonly followThrough: ExplainReport['followThrough'];
}

// Fallback for when the full variance computation is unavailable (last-month calc
// failed, or the domain call itself failed): buildFollowThrough (private to the
// domain service) reads only thisMonth + contributions — never lastMonth — so a
// synthetic empty "last month" is a safe stand-in; the variance section reports
// the underlying failure separately.
function followThroughViaEmptyLastMonth(
  thisCalc: SafeTransferCalculation,
  contributions: ContributionsInWindow,
): ExplainReport['followThrough'] {
  const result = explainSettlementVariance(thisCalc, emptyCalculation(thisCalc.totalRequired.currency), contributions);
  if (result.isFailure) {
    return { ok: false, error: result.error, suggestedAction: DATA_CHECK_ACTION };
  }
  return { ok: true, value: result.value.followThrough };
}

function buildReportSections(
  thisCalcResult: Result<SafeTransferCalculation>,
  lastCalcResult: Result<SafeTransferCalculation>,
  contributions: ContributionsInWindow | undefined,
  settlementConfigured: boolean,
): ReportSections {
  if (thisCalcResult.isFailure) {
    const failure = {
      ok: false as const,
      error: thisCalcResult.error,
      suggestedAction: buildSuggestedAction(thisCalcResult.error),
    };
    return { variance: failure, followThrough: settlementConfigured ? failure : NOT_CONFIGURED };
  }

  const thisCalc = thisCalcResult.value;
  const effectiveContributions = contributions ?? emptyContributions(thisCalc.totalRequired.currency);

  if (lastCalcResult.isFailure) {
    return {
      variance: { ok: false, error: lastCalcResult.error, suggestedAction: buildSuggestedAction(lastCalcResult.error) },
      followThrough: settlementConfigured
        ? followThroughViaEmptyLastMonth(thisCalc, effectiveContributions)
        : NOT_CONFIGURED,
    };
  }

  const varianceResult = explainSettlementVariance(thisCalc, lastCalcResult.value, effectiveContributions);
  if (varianceResult.isFailure) {
    return {
      variance: { ok: false, error: varianceResult.error, suggestedAction: DATA_CHECK_ACTION },
      followThrough: settlementConfigured
        ? followThroughViaEmptyLastMonth(thisCalc, effectiveContributions)
        : NOT_CONFIGURED,
    };
  }

  return {
    variance: {
      ok: true,
      value: {
        lines: varianceResult.value.lines,
        totalDelta: varianceResult.value.totalDelta,
        perPartnerDelta: varianceResult.value.perPartnerDelta,
      },
    },
    followThrough: settlementConfigured
      ? { ok: true, value: varianceResult.value.followThrough }
      : NOT_CONFIGURED,
  };
}

export function assembleExplainReport(
  asOf: string,
  thisWindow: ExplainWindow,
  lastWindow: ExplainWindow,
  thisCalcResult: Result<SafeTransferCalculation>,
  lastCalcResult: Result<SafeTransferCalculation>,
  contributions: ContributionsInWindow | undefined,
  settlementConfigured: boolean,
): ExplainReport {
  const sections = buildReportSections(thisCalcResult, lastCalcResult, contributions, settlementConfigured);
  return { asOf, thisWindow, lastWindow, ...sections };
}

export async function runExplainCommand(
  opts: ExplainCommandOptions,
  deps: ExplainCommandDeps,
): Promise<number> {
  const { stdout, stderr, clock } = deps;

  if (opts.asOf !== undefined && !ISO_DATE.test(opts.asOf)) {
    const message = `--as-of must be ISO 8601 date (YYYY-MM-DD), got "${opts.asOf}"`;
    stderr.write(`error: ${message}\n`);
    writeJsonErrorIf(stderr, opts.json, 'explain', { code: 'INVALID_ARGUMENT', message });
    return 2;
  }

  const asOf = opts.asOf ?? clock();
  const thisWindow = nextCalendarMonth(asOf);
  const { asOfLast, from: lastFrom, to: lastTo } = previousSettleWindow(asOf);
  const lastWindow: ExplainWindow = { from: lastFrom, to: lastTo };

  const thisCalcResult = deps.transferCalculator.calculateForWindow(asOf, thisWindow.from, thisWindow.to);
  const lastCalcResult = deps.transferCalculator.calculateForWindow(asOfLast, lastWindow.from, lastWindow.to);

  let contributions: ContributionsInWindow | undefined;
  if (thisCalcResult.isSuccess && deps.settlementConfigured) {
    const currency = thisCalcResult.value.totalRequired.currency;
    const contributionsResult = deps.contributionQuery.contributionsInWindow(currency, lastWindow.from, lastWindow.to);
    if (contributionsResult.isFailure) {
      stderr.write(`error: ${contributionsResult.error}\n`);
      writeJsonErrorIf(stderr, opts.json, 'explain', { code: 'QUERY_FAILURE', message: contributionsResult.error });
      return 1;
    }
    contributions = contributionsResult.value;
  }

  const report = assembleExplainReport(
    asOf,
    thisWindow,
    lastWindow,
    thisCalcResult,
    lastCalcResult,
    contributions,
    deps.settlementConfigured,
  );

  if (opts.json) {
    stdout.write(formatExplainJson(report));
  } else {
    stdout.write(formatExplainHuman(report));
  }

  return 0;
}
