import { createHash } from 'node:crypto';
import type { HashFn } from '@core/ports/hash-fn.js';

export const nodeHashFn: HashFn = (canonical: string): string =>
  createHash('sha256').update(canonical, 'utf8').digest('hex');
