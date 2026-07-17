import crypto from 'crypto';
import { z } from 'zod';

export interface ManifestFileEntry {
  readonly name: string;
  readonly sha256: string;
}

export interface ExportManifest {
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly counts: {
    readonly transactions: number;
    readonly events: number;
  };
  readonly files: readonly ManifestFileEntry[];
}

// Read-back schema for manifest.json (story-4.5c bundle-verifier's boundary —
// FsDataExporter authors this file itself and does not need to re-validate its
// own output through Zod).
export const ManifestSchema = z.object({
  schemaVersion: z.number(),
  createdAt: z.string(),
  counts: z.object({
    transactions: z.number(),
    events: z.number(),
  }),
  files: z.array(
    z.object({
      name: z.string(),
      sha256: z.string(),
    }),
  ),
});

// Byte-based hashing shared by both the writer (fs-data-exporter.ts) and the
// verifier (bundle-verifier.ts, story-4.5c) — one implementation hashes the
// exact bytes written/read, never a re-serialized reconstruction, so the two
// call sites can never drift apart (the "proof drift" risk named in the
// story-4.5c plan).
export function sha256OfBytes(data: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else {
    hash.update(data);
  }
  return hash.digest('hex');
}
