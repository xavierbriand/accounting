import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { Result } from '@core/shared/result.js';
import { sanitizeFsError } from '../fs/sanitize-fs-error.js';
import { ManifestSchema, sha256OfBytes } from './manifest.js';

export interface BundleEvent {
  readonly seq: number;
  readonly type: string;
  readonly recordedAt: string;
}

export interface VerifiedBundle {
  readonly manifestHash: string;
  readonly counts: {
    readonly transactions: number;
    readonly events: number;
  };
  readonly lastEvent: BundleEvent | null;
}

// Requires exactly seq/type/recordedAt and passes every other field through —
// a strict per-event-type discriminated union would break verification of
// older bundles once a future story adds a new event type; staleness only
// ever needs seq/type (story-4.5c plan § Production-code surface).
const BundleEventSchema = z
  .object({
    seq: z.number(),
    type: z.string(),
    recordedAt: z.string(),
  })
  .passthrough();

const MANIFEST_JSON = 'manifest.json';
const DOMAIN_EVENTS_JSON = 'domain-events.json';

export async function verifyBundle(bundleDir: string): Promise<Result<VerifiedBundle>> {
  if (!fs.existsSync(bundleDir) || !fs.statSync(bundleDir).isDirectory()) {
    return Result.fail('bundle directory not found');
  }

  const manifestPath = path.join(bundleDir, MANIFEST_JSON);
  if (!fs.existsSync(manifestPath)) {
    return Result.fail(`missing ${MANIFEST_JSON} in bundle — not a valid export bundle`);
  }

  let manifestBytes: Buffer;
  try {
    manifestBytes = fs.readFileSync(manifestPath);
  } catch (err) {
    return Result.fail(`could not read ${MANIFEST_JSON}: ${sanitizeFsError(err, '<bundle>')}`);
  }

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    return Result.fail(`${MANIFEST_JSON} is not valid JSON — bundle may be corrupted`);
  }

  const manifestParsed = ManifestSchema.safeParse(manifestRaw);
  if (!manifestParsed.success) {
    return Result.fail(`${MANIFEST_JSON} does not match the expected shape — bundle may be corrupted or from an incompatible version`);
  }
  const manifest = manifestParsed.data;

  for (const entry of manifest.files) {
    const filePath = path.join(bundleDir, entry.name);
    let fileBytes: Buffer;
    try {
      fileBytes = fs.readFileSync(filePath);
    } catch (err) {
      return Result.fail(`bundle file '${entry.name}' listed in the manifest is missing or unreadable: ${sanitizeFsError(err, '<bundle>')}`);
    }
    if (sha256OfBytes(fileBytes) !== entry.sha256) {
      return Result.fail(`bundle verification failed: '${entry.name}' does not match its manifest checksum (the bundle has been modified since export)`);
    }
  }

  const manifestHash = sha256OfBytes(manifestBytes);

  let lastEvent: BundleEvent | null = null;
  const eventsPath = path.join(bundleDir, DOMAIN_EVENTS_JSON);
  if (fs.existsSync(eventsPath)) {
    let eventsRaw: unknown;
    try {
      eventsRaw = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
    } catch {
      return Result.fail(`${DOMAIN_EVENTS_JSON} is not valid JSON — bundle may be corrupted`);
    }
    const eventsParsed = z.array(BundleEventSchema).safeParse(eventsRaw);
    if (!eventsParsed.success) {
      return Result.fail(`${DOMAIN_EVENTS_JSON} does not match the expected shape — bundle may be corrupted or from an incompatible version`);
    }
    const events = eventsParsed.data;
    lastEvent = events.length > 0 ? events[events.length - 1] : null;
  }

  return Result.ok({ manifestHash, counts: manifest.counts, lastEvent });
}
