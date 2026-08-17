'use client';

/**
 * `ConfigNotFoundError`, `ConfigError`, `ExportsNotFoundError`, and every
 * other error `loadConfig`/`loadLedger` can throw already carry a good,
 * actionable message — that was the whole point of steps 1 and 2. This
 * renders `error.message` directly rather than a generic "something broke,"
 * so none of that work goes to waste the one time it's actually needed.
 *
 * Next's App Router requires this to be a client component even though
 * nothing here is interactive.
 */
export default function Error({ error }: { readonly error: Error & { digest?: string } }) {
  return (
    <div className="error-panel">
      <h1>Couldn’t render the plan</h1>
      <pre>{error.message}</pre>
    </div>
  );
}
