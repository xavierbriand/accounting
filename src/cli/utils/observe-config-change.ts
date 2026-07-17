import { ConfigChangeDetector } from '@core/config/config-change-detector.js';
import { canonicalConfigForm } from '@core/config/config-canonical-form.js';
import type { AppConfig } from '@core/config/app-config.js';
import type { ConfigStateStore } from '@core/ports/config-state-store.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';
import type { HashFn } from '@core/ports/hash-fn.js';

export interface ObserveConfigChangeDeps {
  readonly config: AppConfig;
  readonly configStateStore: ConfigStateStore;
  readonly domainEventRecorder: DomainEventRecorder;
  readonly hashFn: HashFn;
  readonly stderr: NodeJS.WritableStream;
}

function warn(stderr: NodeJS.WritableStream, detail: string): void {
  stderr.write(`[warning] config-change observation skipped: ${detail}\n`);
}

/**
 * Best-effort ambient audit observation (FR23, story-4.5a): getLast -> detect -> on a real
 * change, record then save; on bootstrap, save the baseline silently; on a no-op (cosmetic
 * edit), do nothing. Any internal failure warns to stderr and returns — this never blocks
 * the command it's wired into, and state is only saved on success, so the next run
 * re-detects and self-heals.
 */
export function observeConfigChange(deps: ObserveConfigChangeDeps): void {
  const { config, configStateStore, domainEventRecorder, hashFn, stderr } = deps;

  const lastResult = configStateStore.getLast();
  if (lastResult.isFailure) {
    warn(stderr, lastResult.error);
    return;
  }
  const previous = lastResult.value;

  const detector = new ConfigChangeDetector(hashFn);
  const detectResult = detector.detect(previous, config);
  if (detectResult.isFailure) {
    warn(stderr, detectResult.error);
    return;
  }
  const changed = detectResult.value;

  if (changed !== null) {
    const recordResult = domainEventRecorder.record(changed);
    if (recordResult.isFailure) {
      warn(stderr, recordResult.error);
      return;
    }
  } else if (previous !== null) {
    return; // cosmetic edit / no-op: state already matches, nothing to save
  }

  const canonical = canonicalConfigForm(config);
  const saveResult = configStateStore.save({ canonical, digest: hashFn(canonical) });
  if (saveResult.isFailure) {
    warn(stderr, saveResult.error);
  }
}
