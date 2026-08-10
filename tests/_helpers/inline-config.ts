import fs from 'fs';
import path from 'path';
import type { AccountConfig } from '@core/config/app-config.js';

export interface AutoTagRuleOverride {
  readonly category: string;
  readonly patterns: string[];
}

export interface InlineConfigOverrides {
  readonly dbPath?: string;
  readonly defaultCurrency?: string;
  readonly timezone?: string;
  readonly accountId?: string;
  readonly filenamePrefix?: string;
  readonly splitValidFrom?: string;
  readonly partner1?: string;
  readonly partner2?: string;
  readonly autoTagRules?: readonly AutoTagRuleOverride[];
  readonly additionalAccounts?: readonly AccountConfig[];
  readonly additionalAutoTagRules?: readonly AutoTagRuleOverride[];
}

/**
 * Writes an accounting.yaml stub to `tmpDir`.
 * The single-arg form uses sensible defaults: EUR, Europe/Paris, one BPCE
 * bank account matching "bpce-valid_" prefix, two-partner 50/50 split, no buffers.
 * Partner names use fictional non-PII values ("Alice" and "Bob").
 * Pass autoTagRules to emit a YAML autoTagRules section; omit for empty rules (default []).
 * Pass additionalAccounts to append extra account entries after the primary one
 * (e.g. a second bank account matching a different filenamePrefix).
 * Pass additionalAutoTagRules to append extra rules on top of autoTagRules, rather
 * than replacing the list — useful when a caller wants to layer scenario-specific
 * rules onto a shared base set.
 */
export function writeStubYaml(tmpDir: string, overrides?: InlineConfigOverrides): void {
  const cfg = {
    dbPath: overrides?.dbPath ?? './test.db',
    defaultCurrency: overrides?.defaultCurrency ?? 'EUR',
    timezone: overrides?.timezone ?? 'Europe/Paris',
    accountId: overrides?.accountId ?? 'bpce-valid-account',
    filenamePrefix: overrides?.filenamePrefix ?? 'bpce-valid_',
    splitValidFrom: overrides?.splitValidFrom ?? '2024-01-01',
    partner1: overrides?.partner1 ?? 'Alice',
    partner2: overrides?.partner2 ?? 'Bob',
  };

  const allAutoTagRules = [...(overrides?.autoTagRules ?? []), ...(overrides?.additionalAutoTagRules ?? [])];

  let autoTagRulesYaml = '';
  if (allAutoTagRules.length > 0) {
    const lines = ['autoTagRules:'];
    for (const rule of allAutoTagRules) {
      lines.push(`  - category: ${rule.category}`);
      lines.push('    patterns:');
      for (const pattern of rule.patterns) {
        lines.push(`      - "${pattern}"`);
      }
    }
    autoTagRulesYaml = '\n' + lines.join('\n') + '\n';
  }

  let additionalAccountsYaml = '';
  if (overrides?.additionalAccounts !== undefined && overrides.additionalAccounts.length > 0) {
    const lines: string[] = [];
    for (const account of overrides.additionalAccounts) {
      lines.push(`  - id: ${account.id}`);
      lines.push(`    type: ${account.type}`);
      lines.push(`    filenamePrefix: "${account.filenamePrefix}"`);
      if (account.cardSuffix !== undefined) {
        lines.push(`    cardSuffix: "${account.cardSuffix}"`);
      }
    }
    additionalAccountsYaml = lines.join('\n') + '\n';
  }

  const yaml = `\
dbPath: ${cfg.dbPath}
defaultCurrency: ${cfg.defaultCurrency}
timezone: ${cfg.timezone}
accounts:
  - id: ${cfg.accountId}
    type: bank
    filenamePrefix: "${cfg.filenamePrefix}"
${additionalAccountsYaml}splits:
  - validFrom: "${cfg.splitValidFrom}"
    rules:
      - { partner: ${cfg.partner1}, ratio: 0.5 }
      - { partner: ${cfg.partner2}, ratio: 0.5 }
buffers: []${autoTagRulesYaml}`;

  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}
