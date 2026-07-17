/**
 * Unit tests for observeConfigChange — the CLI boundary helper that wires
 * ConfigChangeDetector into every ledger-opening command (story-4.5a).
 *
 * Gherkin coverage: none directly (boundary orchestration unit) — exercised end-to-end by
 *   tests/features/config-change.feature via program.ts wiring.
 *
 * fails if: a bootstrap run (no prior state) does not save a baseline, a real change is
 *   not recorded before the new state is saved, a no-op (cosmetic edit) writes anything at
 *   all, or any internal failure (getLast/detect/record/save) throws instead of warning to
 *   stderr and letting the command proceed.
 */
import { describe, it, expect, vi } from 'vitest';
import { observeConfigChange } from '../../../../src/cli/utils/observe-config-change.js';
import type { AppConfig } from '../../../../src/core/config/app-config.js';
import type { ConfigStateStore, StoredConfigState } from '../../../../src/core/ports/config-state-store.js';
import type { DomainEventRecorder } from '../../../../src/core/ports/domain-event-recorder.js';
import type { HashFn } from '../../../../src/core/ports/hash-fn.js';
import { Result } from '@core/shared/result.js';
import { canonicalConfigForm } from '@core/config/config-canonical-form.js';

const identityHashFn: HashFn = (canonical: string) => canonical;

function baseConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    dbPath: './test.db',
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alice', ratio: 0.5 }, { partner: 'Bob', ratio: 0.5 }] }],
    buffers: [],
    accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: 'main_' }],
    recurring: [],
    autoTagRules: [],
    ...overrides,
  };
}

function makeCaptureStream(): { stream: NodeJS.WritableStream; getText: () => string } {
  const chunks: string[] = [];
  const stream = { write(chunk: string) { chunks.push(chunk); return true; } } as unknown as NodeJS.WritableStream;
  return { stream, getText: () => chunks.join('') };
}

function stateFor(config: AppConfig): StoredConfigState {
  const canonical = canonicalConfigForm(config);
  return { canonical, digest: identityHashFn(canonical) };
}

describe('observeConfigChange — bootstrap', () => {
  it('saves a baseline and records nothing when there is no prior state', () => {
    const config = baseConfig();
    const save = vi.fn<ConfigStateStore['save']>(() => Result.ok());
    const configStateStore: ConfigStateStore = { getLast: () => Result.ok(null), save };
    const record = vi.fn<DomainEventRecorder['record']>(() => Result.ok());
    const domainEventRecorder: DomainEventRecorder = { record };
    const { stream } = makeCaptureStream();

    observeConfigChange({ config, configStateStore, domainEventRecorder, hashFn: identityHashFn, stderr: stream });

    expect(record).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual(stateFor(config));
  });
});

describe('observeConfigChange — no-op (cosmetic edit)', () => {
  it('records nothing and saves nothing when the digest already matches', () => {
    const config = baseConfig();
    const save = vi.fn<ConfigStateStore['save']>(() => Result.ok());
    const configStateStore: ConfigStateStore = { getLast: () => Result.ok(stateFor(config)), save };
    const record = vi.fn<DomainEventRecorder['record']>(() => Result.ok());
    const domainEventRecorder: DomainEventRecorder = { record };
    const { stream } = makeCaptureStream();

    observeConfigChange({ config, configStateStore, domainEventRecorder, hashFn: identityHashFn, stderr: stream });

    expect(record).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('observeConfigChange — real change', () => {
  it('records the ConfigChanged event, then saves the new state (record-before-save ordering)', () => {
    const previous = baseConfig({ timezone: 'Europe/Paris' });
    const current = baseConfig({ timezone: 'Europe/Berlin' });
    const previousState = stateFor(previous);
    const callOrder: string[] = [];
    const save = vi.fn<ConfigStateStore['save']>(() => {
      callOrder.push('save');
      return Result.ok();
    });
    const configStateStore: ConfigStateStore = { getLast: () => Result.ok(previousState), save };
    const record = vi.fn<DomainEventRecorder['record']>((event) => {
      callOrder.push('record');
      expect(event.type).toBe('ConfigChanged');
      return Result.ok();
    });
    const domainEventRecorder: DomainEventRecorder = { record };
    const { stream } = makeCaptureStream();

    observeConfigChange({ config: current, configStateStore, domainEventRecorder, hashFn: identityHashFn, stderr: stream });

    expect(record).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['record', 'save']);
    expect(save.mock.calls[0][0]).toEqual(stateFor(current));
  });
});

describe('observeConfigChange — best-effort failure handling', () => {
  it('getLast() failure warns to stderr and does not call record/save', () => {
    const record = vi.fn<DomainEventRecorder['record']>(() => Result.ok());
    const save = vi.fn<ConfigStateStore['save']>(() => Result.ok());
    const configStateStore: ConfigStateStore = { getLast: () => Result.fail('disk error'), save };
    const { stream, getText } = makeCaptureStream();

    expect(() =>
      observeConfigChange({
        config: baseConfig(),
        configStateStore,
        domainEventRecorder: { record },
        hashFn: identityHashFn,
        stderr: stream,
      }),
    ).not.toThrow();

    expect(record).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(getText()).toContain('disk error');
  });

  it('detect() failure (corrupted stored state) warns to stderr and does not call record/save', () => {
    const record = vi.fn<DomainEventRecorder['record']>(() => Result.ok());
    const save = vi.fn<ConfigStateStore['save']>(() => Result.ok());
    const configStateStore: ConfigStateStore = {
      getLast: () => Result.ok({ canonical: 'not-json{{', digest: 'stale-digest' }),
      save,
    };
    const { stream, getText } = makeCaptureStream();

    observeConfigChange({ config: baseConfig(), configStateStore, domainEventRecorder: { record }, hashFn: identityHashFn, stderr: stream });

    expect(record).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(getText()).toContain('not valid JSON');
  });

  it('record() failure warns to stderr and does not save (preserves at-least-once semantics)', () => {
    const previous = baseConfig({ timezone: 'Europe/Paris' });
    const current = baseConfig({ timezone: 'Europe/Berlin' });
    const save = vi.fn<ConfigStateStore['save']>(() => Result.ok());
    const configStateStore: ConfigStateStore = { getLast: () => Result.ok(stateFor(previous)), save };
    const record = vi.fn<DomainEventRecorder['record']>(() => Result.fail('write failed'));
    const { stream, getText } = makeCaptureStream();

    observeConfigChange({
      config: current,
      configStateStore,
      domainEventRecorder: { record },
      hashFn: identityHashFn,
      stderr: stream,
    });

    expect(save).not.toHaveBeenCalled();
    expect(getText()).toContain('write failed');
  });

  it('save() failure (bootstrap) warns to stderr without throwing', () => {
    const record = vi.fn<DomainEventRecorder['record']>(() => Result.ok());
    const configStateStore: ConfigStateStore = { getLast: () => Result.ok(null), save: () => Result.fail('disk full') };
    const { stream, getText } = makeCaptureStream();

    expect(() =>
      observeConfigChange({
        config: baseConfig(),
        configStateStore,
        domainEventRecorder: { record },
        hashFn: identityHashFn,
        stderr: stream,
      }),
    ).not.toThrow();

    expect(getText()).toContain('disk full');
  });
});
