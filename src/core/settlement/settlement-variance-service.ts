import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { LineItem } from '@core/transfer/line-item.js';
import type { SafeTransferCalculation } from '@core/transfer/safe-transfer-calculation.js';
import type { ContributionsInWindow } from '@core/ports/contribution-query.js';
import { LineItemKey } from './line-item-key.js';
import type { VarianceLine } from './variance-line.js';
import type { FollowThrough, PartnerFollowThrough } from './follow-through.js';
import type { SettlementVariance } from './settlement-variance.js';

interface KeyedItem {
  readonly key: LineItemKey;
  readonly item: LineItem;
}

function indexByKey(items: readonly LineItem[], monthLabel: string): Result<Map<string, KeyedItem>> {
  const map = new Map<string, KeyedItem>();
  for (const item of items) {
    const key = LineItemKey.of(item);
    const keyStr = key.toString();
    if (map.has(keyStr)) {
      return Result.fail(`duplicate line-item key within ${monthLabel} month's window: ${keyStr}`);
    }
    map.set(keyStr, { key, item });
  }
  return Result.ok(map);
}

function buildPerPartnerDelta(
  thisShares: ReadonlyMap<string, Money>,
  lastShares: ReadonlyMap<string, Money>,
  zero: Money,
): Result<ReadonlyMap<string, Money>> {
  const partners = new Set([...thisShares.keys(), ...lastShares.keys()]);
  const deltas = new Map<string, Money>();
  for (const partner of partners) {
    const thisShare = thisShares.get(partner) ?? zero;
    const lastShare = lastShares.get(partner) ?? zero;
    const deltaResult = thisShare.subtract(lastShare);
    if (deltaResult.isFailure) return Result.fail(deltaResult.error);
    deltas.set(partner, deltaResult.value);
  }
  return Result.ok(deltas);
}

const EMPTY_SHARES: ReadonlyMap<string, Money> = new Map();

function buildVarianceLine(
  thisEntry: KeyedItem | undefined,
  lastEntry: KeyedItem | undefined,
  zero: Money,
): Result<VarianceLine> {
  if (thisEntry && lastEntry) {
    const totalDeltaResult = thisEntry.item.gross.subtract(lastEntry.item.gross);
    if (totalDeltaResult.isFailure) return Result.fail(totalDeltaResult.error);
    const perPartnerDeltaResult = buildPerPartnerDelta(thisEntry.item.perPartnerSplit, lastEntry.item.perPartnerSplit, zero);
    if (perPartnerDeltaResult.isFailure) return Result.fail(perPartnerDeltaResult.error);
    return Result.ok({
      key: thisEntry.key,
      presence: 'both',
      totalDelta: totalDeltaResult.value,
      perPartnerDelta: perPartnerDeltaResult.value,
    });
  }

  if (thisEntry) {
    const perPartnerDeltaResult = buildPerPartnerDelta(thisEntry.item.perPartnerSplit, EMPTY_SHARES, zero);
    if (perPartnerDeltaResult.isFailure) return Result.fail(perPartnerDeltaResult.error);
    return Result.ok({
      key: thisEntry.key,
      presence: 'this-only',
      totalDelta: thisEntry.item.gross,
      perPartnerDelta: perPartnerDeltaResult.value,
    });
  }

  const negatedResult = zero.subtract(lastEntry!.item.gross);
  if (negatedResult.isFailure) return Result.fail(negatedResult.error);
  const perPartnerDeltaResult = buildPerPartnerDelta(EMPTY_SHARES, lastEntry!.item.perPartnerSplit, zero);
  if (perPartnerDeltaResult.isFailure) return Result.fail(perPartnerDeltaResult.error);
  return Result.ok({
    key: lastEntry!.key,
    presence: 'last-only',
    totalDelta: negatedResult.value,
    perPartnerDelta: perPartnerDeltaResult.value,
  });
}

function buildPerPartnerFollowThrough(
  thisMonth: SafeTransferCalculation,
  contributions: ContributionsInWindow,
  zero: Money,
): Result<ReadonlyMap<string, PartnerFollowThrough>> {
  const actualByPartner = new Map(contributions.attributed.map(c => [c.partner, c.amount]));
  const partners = new Set([...thisMonth.perPartner.keys(), ...actualByPartner.keys()]);
  const perPartner = new Map<string, PartnerFollowThrough>();
  for (const partner of partners) {
    const suggested = thisMonth.perPartner.get(partner) ?? zero;
    const actual = actualByPartner.get(partner) ?? zero;
    const deltaResult = suggested.subtract(actual);
    if (deltaResult.isFailure) return Result.fail(deltaResult.error);
    perPartner.set(partner, { suggested, actual, delta: deltaResult.value });
  }
  return Result.ok(perPartner);
}

function buildFollowThrough(
  thisMonth: SafeTransferCalculation,
  contributions: ContributionsInWindow,
  currency: string,
  zero: Money,
): Result<FollowThrough> {
  if (contributions.totalActual.currency !== currency) {
    return Result.fail(
      `currency mismatch: this month is ${currency}, contributions are ${contributions.totalActual.currency}`,
    );
  }

  const totalDeltaResult = thisMonth.totalRequired.subtract(contributions.totalActual);
  if (totalDeltaResult.isFailure) return Result.fail(totalDeltaResult.error);

  const isFullyAttributed = contributions.unattributed.equals(zero);
  if (!isFullyAttributed) {
    return Result.ok({
      totalSuggested: thisMonth.totalRequired,
      totalActual: contributions.totalActual,
      totalDelta: totalDeltaResult.value,
      attribution: 'totals-only',
    });
  }

  const perPartnerResult = buildPerPartnerFollowThrough(thisMonth, contributions, zero);
  if (perPartnerResult.isFailure) return Result.fail(perPartnerResult.error);

  return Result.ok({
    perPartner: perPartnerResult.value,
    totalSuggested: thisMonth.totalRequired,
    totalActual: contributions.totalActual,
    totalDelta: totalDeltaResult.value,
    attribution: 'per-partner',
  });
}

export function explainSettlementVariance(
  thisMonth: SafeTransferCalculation,
  lastMonth: SafeTransferCalculation,
  contributions: ContributionsInWindow,
): Result<SettlementVariance> {
  const currency = thisMonth.totalRequired.currency;
  if (lastMonth.totalRequired.currency !== currency) {
    return Result.fail(
      `currency mismatch: this month is ${currency}, last month is ${lastMonth.totalRequired.currency}`,
    );
  }

  const zeroResult = Money.fromCents(0, currency);
  if (zeroResult.isFailure) return Result.fail(zeroResult.error);
  const zero = zeroResult.value;

  const thisByKeyResult = indexByKey(thisMonth.lineItems, 'this');
  if (thisByKeyResult.isFailure) return Result.fail(thisByKeyResult.error);
  const lastByKeyResult = indexByKey(lastMonth.lineItems, 'last');
  if (lastByKeyResult.isFailure) return Result.fail(lastByKeyResult.error);
  const thisByKey = thisByKeyResult.value;
  const lastByKey = lastByKeyResult.value;

  const allKeyStrs = new Set([...thisByKey.keys(), ...lastByKey.keys()]);
  const lines: VarianceLine[] = [];
  for (const keyStr of allKeyStrs) {
    const lineResult = buildVarianceLine(thisByKey.get(keyStr), lastByKey.get(keyStr), zero);
    if (lineResult.isFailure) return Result.fail(lineResult.error);
    lines.push(lineResult.value);
  }
  lines.sort((a, b) => a.key.compare(b.key));

  const totalDeltaResult = thisMonth.totalRequired.subtract(lastMonth.totalRequired);
  if (totalDeltaResult.isFailure) return Result.fail(totalDeltaResult.error);

  const perPartnerDeltaResult = buildPerPartnerDelta(thisMonth.perPartner, lastMonth.perPartner, zero);
  if (perPartnerDeltaResult.isFailure) return Result.fail(perPartnerDeltaResult.error);

  const followThroughResult = buildFollowThrough(thisMonth, contributions, currency, zero);
  if (followThroughResult.isFailure) return Result.fail(followThroughResult.error);

  return Result.ok({
    lines,
    totalDelta: totalDeltaResult.value,
    perPartnerDelta: perPartnerDeltaResult.value,
    followThrough: followThroughResult.value,
  });
}
