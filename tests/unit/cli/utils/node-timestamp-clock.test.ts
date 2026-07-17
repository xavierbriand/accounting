/**
 * Unit tests for nodeTimestampClock — a seconds-resolution stamp for export
 * bundle names (story-4.5b, plan finding #5). The existing nodeClock is
 * date-only and would collide on same-day exports.
 *
 * fails if: the stamp omits time-of-day (would collide within a day), or
 *   contains a colon or slash (archiveLocation must carry no path separators
 *   and directory names on some filesystems reject colons).
 */
import { describe, it, expect } from 'vitest';
import { nodeTimestampClock } from '../../../../src/cli/utils/node-timestamp-clock.js';

describe('nodeTimestampClock', () => {
  it('returns a YYYY-MM-DDTHH-mm-ss shaped stamp (seconds resolution, hyphen-separated)', () => {
    const stamp = nodeTimestampClock('Europe/Paris');
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it('contains no colon or path separator (safe as a directory-name component)', () => {
    const stamp = nodeTimestampClock('Europe/Paris');
    expect(stamp).not.toMatch(/[:/\\]/);
  });

  it('defaults the timezone when none is given', () => {
    const stamp = nodeTimestampClock();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });
});
