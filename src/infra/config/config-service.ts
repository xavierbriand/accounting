import fs from 'fs';
import path from 'path';
import { parse as yamlParse } from 'yaml';
import type { ConfigService } from '@core/ports/config-service.js';
import type { AppConfig } from '@core/config/app-config.js';
import { Result } from '@core/shared/result.js';
import { parseRawConfig } from './config-schema.js';

interface FileConfigServiceOptions {
  projectDir: string;
  xdgConfigHome?: string;
  homeDir?: string;
}

export class FileConfigService implements ConfigService {
  private readonly opts: FileConfigServiceOptions;

  constructor(opts: FileConfigServiceOptions) {
    this.opts = opts;
  }

  public load(): Result<AppConfig> {
    const projectPath = path.join(this.opts.projectDir, 'accounting.yaml');

    // XDG_CONFIG_HOME is read lazily at load time so tests can swap env easily
    const xdgHome =
      this.opts.xdgConfigHome ??
      process.env['XDG_CONFIG_HOME'] ??
      path.join(this.opts.homeDir ?? process.env['HOME'] ?? '/tmp', '.config');

    const xdgPath = path.join(xdgHome, 'accounting', 'config.yaml');

    let rawContent: string | undefined;

    if (fs.existsSync(projectPath)) {
      rawContent = fs.readFileSync(projectPath, 'utf8');
    } else if (fs.existsSync(xdgPath)) {
      rawContent = fs.readFileSync(xdgPath, 'utf8');
    } else {
      return Result.fail(
        `No config file found. Searched:\n  - ${projectPath}\n  - ${xdgPath}\n` +
          `Copy accounting.example.yaml to accounting.yaml and edit it.`,
      );
    }

    let raw: unknown;
    try {
      raw = yamlParse(rawContent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Result.fail(`Malformed YAML: ${msg}`);
    }

    return parseRawConfig(raw);
  }
}
