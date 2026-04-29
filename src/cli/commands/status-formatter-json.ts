import type { StatusReport } from './status-report.js';

export function formatStatusJson(report: StatusReport): string {
  const buffersJson = report.buffers.map(b => ({
    name: b.name,
    balance: b.balance.toString(),
    target: b.target.toString(),
    cap: b.cap !== undefined ? b.cap.toString() : null,
    status: b.status,
    targetDate: b.targetDate,
  }));

  let transferJson: Record<string, unknown>;
  if (report.transfer.ok) {
    const calc = report.transfer.value;
    const perPartner: Record<string, string> = {};
    for (const [partner, money] of calc.perPartner) {
      perPartner[partner] = money.toString();
    }
    const lineItems = calc.lineItems.map(item => {
      const perPartnerSplit: Record<string, string> = {};
      for (const [partner, money] of item.perPartnerSplit) {
        perPartnerSplit[partner] = money.toString();
      }
      return {
        kind: item.kind,
        date: item.date,
        category: item.category,
        description: item.description,
        gross: item.gross.toString(),
        perPartnerSplit,
      };
    });
    transferJson = {
      totalRequired: calc.totalRequired.toString(),
      perPartner,
      lineItems,
    };
  } else {
    transferJson = {
      error: report.transfer.error,
      suggestedAction: report.transfer.suggestedAction,
    };
  }

  let forecastJson: unknown;
  if (report.forecast.ok) {
    forecastJson = report.forecast.value.map(occ => ({
      date: occ.expectedDate,
      name: occ.name,
      category: occ.category,
      amount: occ.amount.toString(),
    }));
  } else {
    forecastJson = { error: report.forecast.error };
  }

  const doc = {
    asOf: report.asOf,
    window: { from: report.window.from, to: report.window.to },
    buffers: buffersJson,
    transfer: transferJson,
    forecast: forecastJson,
  };

  return JSON.stringify(doc, null, 2) + '\n';
}
