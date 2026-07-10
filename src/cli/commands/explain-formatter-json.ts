import type { Money } from '@core/shared/money.js';
import type { VarianceLine } from '@core/settlement/variance-line.js';
import type { ExplainReport } from './explain-report.js';
import { formatJsonSuccess } from '../utils/json-envelope.js';

function perPartnerToObject(map: ReadonlyMap<string, Money>): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [partner, money] of map) {
    obj[partner] = money.toString();
  }
  return obj;
}

function lineToJson(line: VarianceLine): Record<string, unknown> {
  return {
    kind: line.key.kind,
    category: line.key.category,
    description: line.key.description,
    presence: line.presence,
    totalDelta: line.totalDelta.toString(),
    perPartnerDelta: perPartnerToObject(line.perPartnerDelta),
  };
}

export function formatExplainJson(report: ExplainReport): string {
  let varianceJson: Record<string, unknown>;
  if (report.variance.ok) {
    const v = report.variance.value;
    varianceJson = {
      lines: v.lines.map(lineToJson),
      totalDelta: v.totalDelta.toString(),
      perPartnerDelta: perPartnerToObject(v.perPartnerDelta),
    };
  } else {
    varianceJson = { error: report.variance.error, suggestedAction: report.variance.suggestedAction };
  }

  let followThroughJson: Record<string, unknown>;
  if (report.followThrough.ok) {
    const ft = report.followThrough.value;
    const perPartner: Record<string, { suggested: string; actual: string; delta: string }> = {};
    for (const [partner, pf] of ft.perPartner) {
      perPartner[partner] = {
        suggested: pf.suggested.toString(),
        actual: pf.actual.toString(),
        delta: pf.delta.toString(),
      };
    }
    followThroughJson = {
      perPartner,
      totalSuggested: ft.totalSuggested.toString(),
      totalActual: ft.totalActual.toString(),
      totalDelta: ft.totalDelta.toString(),
    };
  } else if ('notConfigured' in report.followThrough) {
    followThroughJson = { notConfigured: true };
  } else {
    followThroughJson = { error: report.followThrough.error, suggestedAction: report.followThrough.suggestedAction };
  }

  const doc = {
    asOf: report.asOf,
    thisWindow: report.thisWindow,
    lastWindow: report.lastWindow,
    variance: varianceJson,
    followThrough: followThroughJson,
  };

  return formatJsonSuccess('explain', doc);
}
