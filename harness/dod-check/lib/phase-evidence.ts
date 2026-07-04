import { extractSectionRegion } from './todo-tbd.js';

export type PhaseEvidenceFinding = {
  kind: 'phase-evidence-missing';
  claim: string;
};

const TICKED_PHASE_4_BOX = /^\s*[-*] \[[xX]\][^\n]*\bphase[- ]?4\b[^\n]*$/im;
const SUGGESTION_LOG_P4_ROW = /^\s*\|\s*P4\b/im;

export function checkPhaseEvidence(body: string): PhaseEvidenceFinding[] {
  const checklistRegion = extractSectionRegion(body, '10');
  if (checklistRegion === null) {
    return [];
  }
  const claimMatch = TICKED_PHASE_4_BOX.exec(checklistRegion);
  if (claimMatch === null) {
    return [];
  }

  const suggestionLogRegion = extractSectionRegion(body, '7');
  if (suggestionLogRegion !== null && SUGGESTION_LOG_P4_ROW.test(suggestionLogRegion)) {
    return [];
  }

  return [{ kind: 'phase-evidence-missing', claim: claimMatch[0].trim() }];
}
