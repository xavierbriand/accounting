import type { Result } from '@core/shared/result.js';

export interface StoreReset {
  wipe(): Promise<Result<readonly string[]>>;
}
