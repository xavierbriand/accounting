import type { Result } from '@core/shared/result.js';
import type { AppConfig } from '@core/config/app-config.js';

export interface ConfigService {
  load(): Result<AppConfig>;
}
