export const PROCESS_ARTIFACT_PREFIXES = ['docs/plans/', 'docs/retrospectives/', 'docs/status.d/'];

export function isProcessArtifactPath(p: string): boolean {
  return PROCESS_ARTIFACT_PREFIXES.some((prefix) => p.startsWith(prefix));
}

export function sumShippedDiffLoc(numstatOutput: string): number {
  let total = 0;
  for (const line of numstatOutput.split('\n')) {
    if (line.trim().length === 0) continue;
    const [added, deleted, filePath] = line.split('\t');
    if (isProcessArtifactPath(filePath)) continue;
    const addedNum = Number.parseInt(added, 10);
    const deletedNum = Number.parseInt(deleted, 10);
    if (Number.isFinite(addedNum)) total += addedNum;
    if (Number.isFinite(deletedNum)) total += deletedNum;
  }
  return total;
}
