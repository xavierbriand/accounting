export interface AutoTagRule {
  readonly pattern: RegExp;
  readonly category: string;
}

export const DEFAULT_RULES: readonly AutoTagRule[] = [];
