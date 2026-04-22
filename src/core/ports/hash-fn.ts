// Cannot fail — input is already validated by canonicalize().
// Returns a 64-hex-char SHA-256 digest.
export type HashFn = (canonical: string) => string;
