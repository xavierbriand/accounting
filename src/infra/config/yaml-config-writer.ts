import fs from 'fs';
import crypto from 'crypto';
import { parseDocument, YAMLMap, YAMLSeq } from 'yaml';
import type { ConfigWriter, ConfigWriterError } from '@core/ports/config-writer.js';
import { Result } from '@core/shared/result.js';
import { sanitizeFsError } from '../fs/sanitize-fs-error.js';

export class YamlConfigWriter implements ConfigWriter {
  constructor(
    private readonly yamlPath: string,
    private readonly expectedMtimeNs: bigint,
  ) {}

  async appendAutoTagRules(
    rules: ReadonlyArray<{ category: string; pattern: string }>,
  ): Promise<Result<void, ConfigWriterError>> {
    // Step 1: stat-mtime-check
    let stat: fs.BigIntStats;
    try {
      stat = fs.statSync(this.yamlPath, { bigint: true });
    } catch (err) {
      return Result.fail({ kind: 'io', message: sanitizeFsError(err, '<config>') });
    }

    if (stat.mtimeNs !== this.expectedMtimeNs) {
      return Result.fail({ kind: 'mtime-race' });
    }

    // Step 2: parseDocument
    let content: string;
    try {
      content = fs.readFileSync(this.yamlPath, 'utf8');
    } catch (err) {
      return Result.fail({ kind: 'io', message: sanitizeFsError(err, '<config>') });
    }

    const doc = parseDocument(content);

    // Step 3: Build a per-rule plan
    // Get or create the autoTagRules sequence from the document
    let rulesSeq = doc.getIn(['autoTagRules']) as YAMLSeq | null | undefined;

    // Build a lookup of existing pattern → category
    const existingPatternToCategory = new Map<string, string>();
    if (rulesSeq instanceof YAMLSeq) {
      for (const group of rulesSeq.items as YAMLMap[]) {
        if (!(group instanceof YAMLMap)) continue;
        const cat = group.get('category') as string;
        const patterns = group.getIn(['patterns']) as YAMLSeq;
        if (patterns instanceof YAMLSeq) {
          for (const item of patterns.items as Array<{ value: string }>) {
            existingPatternToCategory.set(item.value, cat);
          }
        }
      }
    }

    // Classify each rule: 'skip', 'conflict', or 'append'
    type RulePlan =
      | { action: 'skip' }
      | { action: 'conflict'; existingCategory: string; pattern: string }
      | { action: 'append'; category: string; pattern: string };

    const plan: RulePlan[] = [];
    for (const rule of rules) {
      const existing = existingPatternToCategory.get(rule.pattern);
      if (existing === rule.category) {
        plan.push({ action: 'skip' });
      } else if (existing !== undefined) {
        plan.push({ action: 'conflict', existingCategory: existing, pattern: rule.pattern });
      } else {
        plan.push({ action: 'append', category: rule.category, pattern: rule.pattern });
      }
    }

    // Check for conflicts before any mutation
    for (const p of plan) {
      if (p.action === 'conflict') {
        return Result.fail({ kind: 'conflict', existingCategory: p.existingCategory, pattern: p.pattern });
      }
    }

    // Step 4: Mutate the Document
    const toAppend = plan.filter((p): p is { action: 'append'; category: string; pattern: string } =>
      p.action === 'append',
    );

    if (toAppend.length === 0) {
      // All rules were skips — no write needed
      return Result.ok();
    }

    // Ensure autoTagRules seq exists
    if (!(rulesSeq instanceof YAMLSeq)) {
      rulesSeq = new YAMLSeq();
      doc.add({ key: 'autoTagRules', value: rulesSeq });
    }

    for (const { category, pattern } of toAppend) {
      // Find existing group for this category
      let found = false;
      for (const group of rulesSeq.items as YAMLMap[]) {
        if (!(group instanceof YAMLMap)) continue;
        if (group.get('category') === category) {
          const patterns = group.getIn(['patterns']) as YAMLSeq;
          if (patterns instanceof YAMLSeq) {
            patterns.add(pattern);
          }
          found = true;
          break;
        }
      }

      if (!found) {
        // Create new group
        const newGroup = new YAMLMap();
        newGroup.add({ key: 'category', value: category });
        const newPatternsSeq = new YAMLSeq();
        newPatternsSeq.add(pattern);
        newGroup.add({ key: 'patterns', value: newPatternsSeq });
        rulesSeq.add(newGroup);
      }
    }

    // Step 5: Serialize
    const newContent = doc.toString();

    // Step 6: Atomic write — tmp + rename (mirrors node-sqlite-snapshot-service.ts)
    const tmpPath = `${this.yamlPath}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}`;
    try {
      fs.writeFileSync(tmpPath, newContent, { encoding: 'utf8', mode: 0o600 });
      if (process.platform !== 'win32') {
        fs.chmodSync(tmpPath, 0o600);
      }
      fs.renameSync(tmpPath, this.yamlPath);
      return Result.ok();
    } catch (err) {
      // Clean up tmp on failure
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      }
      return Result.fail({ kind: 'io', message: sanitizeFsError(err, '<config>') });
    }
  }
}
