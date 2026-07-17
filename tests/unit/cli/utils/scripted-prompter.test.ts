/**
 * Unit tests for the ScriptedPrompter helper used by the R4 subprocess test.
 *
 * fails if:
 *   - nextOf does not skip __forceMtimeRace__ side-channel entries (would cause
 *     a spurious type-mismatch error mid-script).
 *   - script-exhausted error is not raised (would silently return undefined and
 *     the prompter's contract would break opaquely).
 *   - out-of-order type-mismatch error is not raised (silent script drift would
 *     hide R4-test-side bugs like the one fixed in slice 10).
 *   - scriptHasForceMtimeRace returns the wrong boolean (program.ts uses it to
 *     decide whether to pass BigInt(0) as expectedMtimeNs).
 */
import { describe, it, expect } from 'vitest';
import { ScriptedPrompter, scriptHasForceMtimeRace, type Script } from '../../../../src/cli/utils/scripted-prompter.js';

describe('ScriptedPrompter', () => {
  it('returns the canned answer for selectCategory in script order', async () => {
    const script: Script[] = [
      { type: 'selectCategory', action: 'change', category: 'AutoInsurance' },
    ];
    const prompter = new ScriptedPrompter(script);
    const result = await prompter.selectCategory();
    expect(result).toEqual({ action: 'change', category: 'AutoInsurance' });
  });

  it('returns the canned answer for confirmBatch', async () => {
    const script: Script[] = [{ type: 'confirmBatch', confirm: true }];
    const prompter = new ScriptedPrompter(script);
    const result = await prompter.confirmBatch();
    expect(result).toBe(true);
  });

  it('returns the canned answer for confirmRememberRule', async () => {
    const script: Script[] = [
      { type: 'confirmRememberRule', action: 'remember', pattern: 'altima' },
    ];
    const prompter = new ScriptedPrompter(script);
    const result = await prompter.confirmRememberRule();
    expect(result).toEqual({ action: 'remember', pattern: 'altima' });
  });

  it('skips __forceMtimeRace__ side-channel entries (consumed by program.ts, not the prompter)', async () => {
    const script: Script[] = [
      { type: '__forceMtimeRace__' },
      { type: 'selectCategory', action: 'keep' },
    ];
    const prompter = new ScriptedPrompter(script);
    const result = await prompter.selectCategory();
    expect(result).toEqual({ action: 'keep' });
  });

  it('throws when the script is exhausted', async () => {
    const prompter = new ScriptedPrompter([]);
    await expect(prompter.selectCategory()).rejects.toThrow(/script exhausted/);
  });

  it('throws when the next entry type does not match the called method', async () => {
    const script: Script[] = [{ type: 'confirmBatch', confirm: true }];
    const prompter = new ScriptedPrompter(script);
    await expect(prompter.selectCategory()).rejects.toThrow(
      /expected next entry of type 'selectCategory', got 'confirmBatch'/,
    );
  });

  it('preserves cursor across method calls (consumes scripts in order)', async () => {
    const script: Script[] = [
      { type: 'selectCategory', action: 'change', category: 'AutoInsurance' },
      { type: 'confirmRememberRule', action: 'skip' },
      { type: 'confirmBatch', confirm: true },
    ];
    const prompter = new ScriptedPrompter(script);
    expect(await prompter.selectCategory()).toEqual({ action: 'change', category: 'AutoInsurance' });
    expect(await prompter.confirmRememberRule()).toEqual({ action: 'skip' });
    expect(await prompter.confirmBatch()).toBe(true);
  });

  it('returns the canned answer for confirmDissolution (story-4.5c)', async () => {
    const script: Script[] = [{ type: 'confirmDissolution', confirm: true }];
    const prompter = new ScriptedPrompter(script);
    const result = await prompter.confirmDissolution();
    expect(result).toBe(true);
  });

  it('returns false when the script cans a declined confirmDissolution', async () => {
    const script: Script[] = [{ type: 'confirmDissolution', confirm: false }];
    const prompter = new ScriptedPrompter(script);
    const result = await prompter.confirmDissolution();
    expect(result).toBe(false);
  });
});

describe('scriptHasForceMtimeRace', () => {
  it('returns true when the script contains __forceMtimeRace__', () => {
    const script: Script[] = [
      { type: 'selectCategory', action: 'keep' },
      { type: '__forceMtimeRace__' },
    ];
    expect(scriptHasForceMtimeRace(script)).toBe(true);
  });

  it('returns false when the script does not contain __forceMtimeRace__', () => {
    const script: Script[] = [
      { type: 'selectCategory', action: 'keep' },
      { type: 'confirmBatch', confirm: true },
    ];
    expect(scriptHasForceMtimeRace(script)).toBe(false);
  });

  it('returns false for an empty script', () => {
    expect(scriptHasForceMtimeRace([])).toBe(false);
  });
});
