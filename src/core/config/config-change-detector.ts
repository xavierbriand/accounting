import type { HashFn } from '@core/ports/hash-fn.js';
import type { StoredConfigState } from '@core/ports/config-state-store.js';
import type { AppConfig } from '@core/config/app-config.js';
import type { ConfigChanged } from '@core/events/domain-event.js';
import { Result } from '@core/shared/result.js';
import {
  parseCanonicalConfigForm,
  toCanonicalAppConfig,
  type CanonicalAppConfig,
} from './config-canonical-form.js';
import { diffConfigs } from './config-diff.js';

export class ConfigChangeDetector {
  constructor(private readonly hashFn: HashFn) {}

  detect(previous: StoredConfigState | null, current: AppConfig): Result<ConfigChanged | null> {
    const currentCanonicalObj = toCanonicalAppConfig(current);
    const currentCanonical = JSON.stringify(currentCanonicalObj);
    const currentDigest = this.hashFn(currentCanonical);

    if (previous === null || previous.digest === currentDigest) {
      return Result.ok(null);
    }

    let previousCanonical: CanonicalAppConfig;
    try {
      previousCanonical = parseCanonicalConfigForm(previous.canonical);
    } catch (err) {
      return Result.fail(
        `ConfigChangeDetector: stored config state is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const changedSections = diffConfigs(previousCanonical, currentCanonicalObj);

    return Result.ok({
      type: 'ConfigChanged',
      origin: 'external',
      changedSections,
      previousDigest: previous.digest,
      currentDigest,
    });
  }
}
