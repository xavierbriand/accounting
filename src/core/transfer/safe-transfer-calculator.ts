import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { SplitRulesService } from '@core/splits/split-rules-service.js';
import type { BufferStateService } from '@core/buffers/buffer-state-service.js';
import type { RecurringForecastService } from '@core/recurring/recurring-forecast-service.js';
import type { SafeTransferCalculation } from './safe-transfer-calculation.js';
import type { LineItem } from './line-item.js';
import type { BufferState } from '@core/buffers/buffer-state.js';
import type { ForecastOccurrence } from '@core/recurring/forecast-occurrence.js';
import { enumerateMonthStarts, dayBefore } from './date-arithmetic.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function lineItemSortKey(item: LineItem): string {
  const kind = item.kind === 'buffer-topup' ? '0' : '1';
  return `${item.date}|${kind}|${item.category}|${item.description}`;
}

function buildForecastLineItems(
  occurrences: readonly ForecastOccurrence[],
  splitsService: SplitRulesService,
): Result<LineItem[]> {
  const lineItems: LineItem[] = [];
  for (const occ of occurrences) {
    const splitsResult = splitsService.getSplitsAsOf(occ.expectedDate);
    if (splitsResult.isFailure) return Result.fail(splitsResult.error);
    const ratios = splitsResult.value.map(r => r.ratio);

    const allocResult = occ.amount.allocate(ratios);
    if (allocResult.isFailure) return Result.fail(allocResult.error);

    const perPartnerSplit = new Map<string, Money>();
    for (let i = 0; i < splitsResult.value.length; i++) {
      perPartnerSplit.set(splitsResult.value[i].partner, allocResult.value[i]);
    }

    lineItems.push({
      kind: 'forecast',
      date: occ.expectedDate,
      category: occ.category,
      description: occ.name,
      gross: occ.amount,
      perPartnerSplit,
    });
  }
  return Result.ok(lineItems);
}

function buildBufferTopupLineItems(
  state: BufferState,
  asOf: string,
  from: string,
  to: string,
  splitsService: SplitRulesService,
): Result<LineItem[]> {
  if (asOf >= state.targetDate) {
    return Result.fail(
      `buffer "${state.name}" is below target and its targetDate (${state.targetDate}) has passed — set a new targetDate`,
    );
  }

  const allFillSlots = enumerateMonthStarts(asOf, dayBefore(state.targetDate));
  const monthsRemaining = allFillSlots.length;

  if (monthsRemaining === 0) {
    return Result.fail(
      `buffer "${state.name}" targetDate (${state.targetDate}) leaves no full month for monthly contributions — extend targetDate or accept the shortfall`,
    );
  }

  const shortfallResult = state.target.subtract(state.balance);
  if (shortfallResult.isFailure) return Result.fail(shortfallResult.error);

  const monthlyFillsResult = shortfallResult.value.allocate(Array(monthsRemaining).fill(1));
  if (monthlyFillsResult.isFailure) return Result.fail(monthlyFillsResult.error);
  const monthlyFills = monthlyFillsResult.value;

  const indexByMonth = new Map(allFillSlots.map((m, i) => [m, i]));

  const lineItems: LineItem[] = [];
  for (const m of enumerateMonthStarts(from, to)) {
    const i = indexByMonth.get(m);
    if (i === undefined) continue;

    const gross = monthlyFills[i];
    const splitsResult = splitsService.getSplitsAsOf(m);
    if (splitsResult.isFailure) return Result.fail(splitsResult.error);
    const ratios = splitsResult.value.map(r => r.ratio);

    const allocResult = gross.allocate(ratios);
    if (allocResult.isFailure) return Result.fail(allocResult.error);

    const perPartnerSplit = new Map<string, Money>();
    for (let j = 0; j < splitsResult.value.length; j++) {
      perPartnerSplit.set(splitsResult.value[j].partner, allocResult.value[j]);
    }

    lineItems.push({
      kind: 'buffer-topup',
      date: m,
      category: state.name,
      description: `${state.name} top-up`,
      gross,
      perPartnerSplit,
    });
  }
  return Result.ok(lineItems);
}

export class SafeTransferCalculator {
  constructor(
    private readonly splitsService: SplitRulesService,
    private readonly buffersService: BufferStateService,
    private readonly forecastService: RecurringForecastService,
    private readonly defaultCurrency: string,
  ) {}

  calculateForWindow(
    asOf: string,
    from: string,
    to: string,
  ): Result<SafeTransferCalculation> {
    if (!ISO_DATE.test(asOf) || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      return Result.fail(
        `asOf, from, and to must be ISO 8601 dates (YYYY-MM-DD): got asOf="${asOf}", from="${from}", to="${to}"`,
      );
    }
    if (from > to) {
      return Result.fail(`from must be <= to: got from="${from}", to="${to}"`);
    }

    const rosterResult = this.splitsService.getSplitsAsOf(asOf);
    if (rosterResult.isFailure) return Result.fail(rosterResult.error);
    const partners = rosterResult.value.map(r => r.partner);

    const forecastResult = this.forecastService.forecastBetween(from, to);
    if (forecastResult.isFailure) return Result.fail(forecastResult.error);

    const forecastItemsResult = buildForecastLineItems(forecastResult.value, this.splitsService);
    if (forecastItemsResult.isFailure) return Result.fail(forecastItemsResult.error);

    const lineItems: LineItem[] = [...forecastItemsResult.value];

    const bufferStateResult = this.buffersService.getStateAsOf(asOf);
    if (bufferStateResult.isFailure) return Result.fail(bufferStateResult.error);

    for (const state of bufferStateResult.value) {
      if (state.status !== 'below') continue;

      const topupItemsResult = buildBufferTopupLineItems(state, asOf, from, to, this.splitsService);
      if (topupItemsResult.isFailure) return Result.fail(topupItemsResult.error);
      lineItems.push(...topupItemsResult.value);
    }

    lineItems.sort((a, b) => {
      const ka = lineItemSortKey(a);
      const kb = lineItemSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    const zeroResult = Money.fromCents(0, this.defaultCurrency);
    if (zeroResult.isFailure) return Result.fail(zeroResult.error);
    const zero = zeroResult.value;

    let totalRequired = zero;
    const perPartner = new Map<string, Money>(partners.map(p => [p, zero]));

    for (const item of lineItems) {
      const addTotal = totalRequired.add(item.gross);
      if (addTotal.isFailure) return Result.fail(addTotal.error);
      totalRequired = addTotal.value;

      for (const [partner, share] of item.perPartnerSplit) {
        const current = perPartner.get(partner) ?? zero;
        const addPartner = current.add(share);
        if (addPartner.isFailure) return Result.fail(addPartner.error);
        perPartner.set(partner, addPartner.value);
      }
    }

    return Result.ok({ totalRequired, perPartner, lineItems });
  }
}
