/**
 * Unit tests for nodeUuidGen adapter.
 *
 * fails if: nodeUuidGen returns something that isn't a string, isn't unique across calls,
 *   or doesn't match UUID v4 format.
 */
import { describe, it, expect } from 'vitest';
import { nodeUuidGen } from '../../../../src/infra/crypto/node-uuid-gen.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('nodeUuidGen', () => {
  it('returns a string', () => {
    // fails if nodeUuidGen does not return a string
    expect(typeof nodeUuidGen()).toBe('string');
  });

  it('returns a UUID v4 formatted string', () => {
    // fails if the underlying randomUUID call is swapped for a non-v4 generator
    expect(nodeUuidGen()).toMatch(UUID_V4);
  });

  it('returns distinct values on successive calls', () => {
    // fails if: a cached UUID is returned (idGen called once and reused)
    const ids = Array.from({ length: 10 }, () => nodeUuidGen());
    expect(new Set(ids).size).toBe(10);
  });
});
