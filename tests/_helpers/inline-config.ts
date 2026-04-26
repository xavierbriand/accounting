import fs from 'fs';
import path from 'path';

export interface InlineConfigOverrides {
  readonly dbPath?: string;
  readonly defaultCurrency?: string;
  readonly timezone?: string;
  readonly accountId?: string;
  readonly filenamePrefix?: string;
  readonly splitValidFrom?: string;
  readonly partner1?: string;
  readonly partner2?: string;
}

/**
 * Writes an accounting.yaml stub to `tmpDir`.
 * The single-arg form uses sensible defaults: EUR, Europe/Paris, one BPCE
 * bank account matching "bpce-valid_" prefix, two-partner 50/50 split, no buffers.
 * Partner names use fictional non-PII values ("Alice" and "Bob").
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

  const yaml = `\
dbPath: ${cfg.dbPath}
defaultCurrency: ${cfg.defaultCurrency}
timezone: ${cfg.timezone}
accounts:
  - id: ${cfg.accountId}
    type: bank
    filenamePrefix: "${cfg.filenamePrefix}"
splits:
  - validFrom: "${cfg.splitValidFrom}"
    rules:
      - { partner: ${cfg.partner1}, ratio: 0.5 }
      - { partner: ${cfg.partner2}, ratio: 0.5 }
buffers: []
`;

  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}
