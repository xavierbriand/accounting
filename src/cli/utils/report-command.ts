// Shared conventions for the window-scoped report commands (status, explain).

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildSuggestedAction(error: string): string {
  const match = /buffer "([^"]+)"/.exec(error);
  if (match) {
    const bucketName = match[1];
    return `Update ${bucketName}'s targetDate in accounting.yaml (buffers[].targetDate) to a future date.`;
  }
  return 'Check the accounting.yaml buffers configuration.';
}
