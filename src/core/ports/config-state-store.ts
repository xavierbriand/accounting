import type { Result } from '@core/shared/result.js';

export interface StoredConfigState {
  readonly canonical: string;
  readonly digest: string;
}

export interface ConfigStateStore {
  getLast(): Result<StoredConfigState | null>;
  save(state: StoredConfigState): Result<void>;
}
