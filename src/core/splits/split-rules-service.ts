import { Result } from '../shared/result.js';
import type { SplitRule, SplitWindow } from '../config/app-config.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SplitRulesService {
  constructor(private readonly windows: readonly SplitWindow[]) {}

  getSplitsAsOf(date: string): Result<readonly SplitRule[]> {
    if (!ISO_DATE.test(date)) {
      return Result.fail(`date must be ISO 8601 date (YYYY-MM-DD): got "${date}"`);
    }
    if (this.windows.length === 0 || date < this.windows[0].validFrom) {
      return Result.fail(`date "${date}" precedes earliest split window`);
    }
    let active = this.windows[0];
    for (const w of this.windows) {
      if (w.validFrom <= date) active = w;
      else break;
    }
    return Result.ok(active.rules);
  }
}
