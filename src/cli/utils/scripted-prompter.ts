/**
 * Test-only prompter that consumes a JSON-encoded script of canned answers.
 *
 * Used by the R4 subprocess integration tests where @inquirer/prompts' raw-mode
 * TTY requirement makes stdin-driven scripted input unworkable. The
 * `--scripted-prompts <json>` CLI flag (gated by NODE_ENV=test in program.ts)
 * parses the JSON into Script[] and constructs this prompter instead of
 * inquirerPrompter.
 *
 * Each prompter method consumes the next script entry of the matching `type`
 * and returns its canned answer. Throws if the script is exhausted or if the
 * next entry's type doesn't match. The `__forceMtimeRace__` entry is consumed
 * by program.ts (NOT this class) before constructing YamlConfigWriter.
 */

import type {
  InteractivePrompter,
  SelectCategoryResult,
  RememberRuleResult,
} from './interactive.js';

export type Script =
  | { type: 'selectCategory'; action: 'keep' }
  | { type: 'selectCategory'; action: 'change'; category: string }
  | { type: 'selectCategory'; action: 'abort' }
  | { type: 'confirmBatch'; confirm: boolean }
  | { type: 'confirmRememberRule'; action: 'skip' }
  | { type: 'confirmRememberRule'; action: 'remember'; pattern: string }
  | { type: '__forceMtimeRace__' };

export class ScriptedPrompter implements InteractivePrompter {
  private cursor = 0;

  constructor(private readonly script: readonly Script[]) {}

  private nextOf<T extends Script['type']>(expectedType: T): Extract<Script, { type: T }> {
    while (this.cursor < this.script.length) {
      const entry = this.script[this.cursor];
      this.cursor += 1;
      if (entry.type === '__forceMtimeRace__') {
        // Side-channel marker consumed by program.ts; skip in the prompter loop.
        continue;
      }
      if (entry.type !== expectedType) {
        throw new Error(
          `ScriptedPrompter: expected next entry of type '${expectedType}', got '${entry.type}' at script index ${this.cursor - 1}`,
        );
      }
      return entry as Extract<Script, { type: T }>;
    }
    throw new Error(
      `ScriptedPrompter: script exhausted; expected next entry of type '${expectedType}'`,
    );
  }

  async selectCategory(): Promise<SelectCategoryResult> {
    const entry = this.nextOf('selectCategory');
    if (entry.action === 'change') return { action: 'change', category: entry.category };
    if (entry.action === 'abort') return { action: 'abort' };
    return { action: 'keep' };
  }

  async confirmBatch(): Promise<boolean> {
    const entry = this.nextOf('confirmBatch');
    return entry.confirm;
  }

  async confirmRememberRule(): Promise<RememberRuleResult> {
    const entry = this.nextOf('confirmRememberRule');
    if (entry.action === 'remember') return { action: 'remember', pattern: entry.pattern };
    return { action: 'skip' };
  }
}

/**
 * Returns true if the script contains a `__forceMtimeRace__` entry. program.ts
 * uses this to decide whether to pass BigInt(0) as the expectedMtimeNs (forcing
 * mtime mismatch on first write) instead of the real fs.statSync value.
 */
export function scriptHasForceMtimeRace(script: readonly Script[]): boolean {
  return script.some((s) => s.type === '__forceMtimeRace__');
}
