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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function buildSuggestedAction(error: string): string {
  const match = /buffer "([^"]+)"/.exec(error);
  if (match) {
    const bucketName = match[1];
    return `Update ${bucketName}'s targetDate in accounting.yaml (buffers[].targetDate) to a future date.`;
  }
  return 'Check the accounting.yaml buffers configuration.';
}

function zeroMoney(currency: string): Money {
  return Money.fromCents(0, currency).value;
}

function emptyContributions(currency: string): ContributionsInWindow {
  return { attributed: [], totalActual: zeroMoney(currency) };
}

function emptyCalculation(currency: string): SafeTransferCalculation {
  return { totalRequired: zeroMoney(currency), perPartner: new Map(), lineItems: [] };
}

function buildVarianceSection(
  thisCalcResult: Result<SafeTransferCalculation>,
  lastCalcResult: Result<SafeTransferCalculation>,
  contributions: ContributionsInWindow | undefined,
): ExplainReport['variance'] {
  if (thisCalcResult.isFailure) {
    return { ok: false, error: thisCalcResult.error, suggestedAction: buildSuggestedAction(thisCalcResult.error) };
  }
  if (lastCalcResult.isFailure) {
    return { ok: false, error: lastCalcResult.error, suggestedAction: buildSuggestedAction(lastCalcResult.error) };
  }

  const currency = thisCalcResult.value.totalRequired.currency;
  const effectiveContributions = contributions ?? emptyContributions(currency);
  const varianceResult = explainSettlementVariance(thisCalcResult.value, lastCalcResult.value, effectiveContributions);
  if (varianceResult.isFailure) {
    return {
      ok: false,
      error: varianceResult.error,
      suggestedAction: 'Check the settlement configuration and ledger data for this window.',
    };
  }

  return {
    ok: true,
    value: {
      lines: varianceResult.value.lines,
      totalDelta: varianceResult.value.totalDelta,
      perPartnerDelta: varianceResult.value.perPartnerDelta,
    },
  };
}

function buildFollowThroughSection(
  thisCalcResult: Result<SafeTransferCalculation>,
  contributions: ContributionsInWindow | undefined,
  settlementConfigured: boolean,
): ExplainReport['followThrough'] {
  if (!settlementConfigured) {
    return { ok: false, notConfigured: true };
  }
  if (thisCalcResult.isFailure) {
    return { ok: false, error: thisCalcResult.error, suggestedAction: buildSuggestedAction(thisCalcResult.error) };
  }

  const currency = thisCalcResult.value.totalRequired.currency;
  const effectiveContributions = contributions ?? emptyContributions(currency);
  // buildFollowThrough (private to the domain service) reads only thisMonth + contributions —
  // never lastMonth — so a synthetic empty "last month" is a safe stand-in when the real
  // last-month calculation failed (variance section already reports that failure separately).
  const result = explainSettlementVariance(thisCalcResult.value, emptyCalculation(currency), effectiveContributions);
  if (result.isFailure) {
    return {
      ok: false,
      error: result.error,
      suggestedAction: 'Check the settlement configuration and ledger data for this window.',
    };
  }
  return { ok: true, value: result.value.followThrough };
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
  return {
    asOf,
    thisWindow,
    lastWindow,
    variance: buildVarianceSection(thisCalcResult, lastCalcResult, contributions),
    followThrough: buildFollowThroughSection(thisCalcResult, contributions, settlementConfigured),
  };
}

export async function runExplainCommand(
  opts: ExplainCommandOptions,
  deps: ExplainCommandDeps,
): Promise<number> {
  const { stdout, stderr, clock } = deps;

  if (opts.asOf !== undefined && !ISO_DATE.test(opts.asOf)) {
    stderr.write(`error: --as-of must be ISO 8601 date (YYYY-MM-DD), got "${opts.asOf}"\n`);
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
