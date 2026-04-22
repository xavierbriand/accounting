import { randomUUID } from 'node:crypto';
import type { UuidGen } from '@core/ports/uuid-gen.js';

export const nodeUuidGen: UuidGen = (): string => randomUUID();
