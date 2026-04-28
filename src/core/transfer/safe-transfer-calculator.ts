import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { SplitRulesService } from '@core/splits/split-rules-service.js';
import type { BufferStateService } from '@core/buffers/buffer-state-service.js';
import type { RecurringForecastService } from '@core/recurring/recurring-forecast-service.js';
import type { SafeTransferCalculation } from './safe-transfer-calculation.js';
import type { LineItem } from './line-item.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function lineItemSortKey(item: LineItem): string {
  const kind = item.kind === 'buffer-topup' ? '0' : '1';
  return `${item.date}|${kind}|${item.category}|${item.description}`;
}

export class SafeTransferCalculator {
  constructor(
    private readonly splitsService: SplitRulesService,
    private readonly buffersService: BufferStateService,
    private readonly forecastService: RecurringForecastService,
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

    // Derive partner roster from asOf split window
    const rosterResult = this.splitsService.getSplitsAsOf(asOf);
    if (rosterResult.isFailure) return Result.fail(rosterResult.error);
    const partners = rosterResult.value.map(r => r.partner);

    // Collect forecast line items
    const forecastResult = this.forecastService.forecastBetween(from, to);
    if (forecastResult.isFailure) return Result.fail(forecastResult.error);

    const lineItems: LineItem[] = [];

    for (const occ of forecastResult.value) {
      const splitsResult = this.splitsService.getSplitsAsOf(occ.expectedDate);
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

    // Collect buffer top-up line items — implemented in slice 7
    const bufferStateResult = this.buffersService.getStateAsOf(asOf);
    if (bufferStateResult.isFailure) return Result.fail(bufferStateResult.error);

    // Sort line items: ascending by (date, kind, category, description)
    lineItems.sort((a, b) => {
      const ka = lineItemSortKey(a);
      const kb = lineItemSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    // Aggregate totals
    const zeroResult = Money.fromCents(0, 'EUR');
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

    return Result.ok({
      totalRequired,
      perPartner,
      lineItems,
    });
  }
}
