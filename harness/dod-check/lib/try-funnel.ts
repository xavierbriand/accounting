export type TryUnfunneledFinding = {
  kind: 'try-unfunneled';
  bullet: string;
};

const TRY_HEADING = /^## Try\s*$/m;
const NEXT_HEADING = /^## /m;

export function extractTrySection(retroContent: string): string | null {
  const headingMatch = TRY_HEADING.exec(retroContent);
  if (headingMatch === null) {
    return null;
  }
  const regionStart = headingMatch.index + headingMatch[0].length;
  const rest = retroContent.slice(regionStart);
  const nextHeadingMatch = NEXT_HEADING.exec(rest);
  return nextHeadingMatch === null ? rest : rest.slice(0, nextHeadingMatch.index);
}

const BULLET_LINE = /^-\s+(.*)$/;

export function extractTryBullets(trySection: string): string[] {
  const bullets: string[] = [];
  let current: string[] | null = null;
  for (const line of trySection.split('\n')) {
    const bulletMatch = BULLET_LINE.exec(line);
    if (bulletMatch) {
      if (current !== null) {
        bullets.push(current.join(' ').trim());
      }
      current = [bulletMatch[1]];
    } else if (line.trim() === '') {
      if (current !== null) {
        bullets.push(current.join(' ').trim());
        current = null;
      }
    } else if (current !== null) {
      current.push(line.trim());
    }
  }
  if (current !== null) {
    bullets.push(current.join(' ').trim());
  }
  return bullets;
}

const FILE_CITATION_PATTERN = /`[^`]+`|\[[^\]]+\]\([^)]+\)/;
const ISSUE_REF_PATTERN = /#\d+/;
const NO_RULE_MINTED_PATTERN = /\bno new\b[\s\S]{0,40}\brule minted\b/i;

export function checkTryFunnel(bullets: string[]): TryUnfunneledFinding[] {
  const findings: TryUnfunneledFinding[] = [];
  for (const bullet of bullets) {
    if (NO_RULE_MINTED_PATTERN.test(bullet)) {
      continue;
    }
    const hasFileCitation = FILE_CITATION_PATTERN.test(bullet);
    const hasIssueRef = ISSUE_REF_PATTERN.test(bullet);
    if (!hasFileCitation && !hasIssueRef) {
      findings.push({ kind: 'try-unfunneled', bullet });
    }
  }
  return findings;
}
