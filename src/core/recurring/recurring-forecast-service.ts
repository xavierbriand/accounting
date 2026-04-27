import { Result } from '@core/shared/result.js';
import type { RecurringRule } from '@core/config/app-config.js';
import type { ForecastOccurrence } from './forecast-occurrence.js';
import { enumerateOccurrences } from './cadence.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function selectAmount(rule: RecurringRule, occurrenceDate: string): RecurringRule['amount'] {
  let selected = rule.amount;
  for (const amendment of rule.amendments) {
    if (amendment.validFrom <= occurrenceDate) {
      selected = amendment.amount;
    } else {
      break;
    }
  }
  return selected;
}

export class RecurringForecastService {
  constructor(private readonly rules: readonly RecurringRule[]) {}

  forecastBetween(from: string, to: string): Result<readonly ForecastOccurrence[]> {
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      return Result.fail('from and to must be ISO 8601 dates (YYYY-MM-DD)');
    }
    if (from > to) {
      return Result.fail(`from must be <= to: got from="${from}", to="${to}"`);
    }

    const occurrences: Array<{ occurrence: ForecastOccurrence; ruleIndex: number }> = [];

    for (let ruleIndex = 0; ruleIndex < this.rules.length; ruleIndex++) {
      const rule = this.rules[ruleIndex];
      const dates = enumerateOccurrences(rule.validFrom, rule.validTo, rule.cadence, from, to);
      for (const date of dates) {
        occurrences.push({
          occurrence: {
            name: rule.name,
            category: rule.category,
            expectedDate: date,
            amount: selectAmount(rule, date),
          },
          ruleIndex,
        });
      }
    }

    occurrences.sort((a, b) => {
      if (a.occurrence.expectedDate < b.occurrence.expectedDate) return -1;
      if (a.occurrence.expectedDate > b.occurrence.expectedDate) return 1;
      return a.ruleIndex - b.ruleIndex;
    });

    return Result.ok(occurrences.map(o => o.occurrence));
  }
}
