export interface AutoTagRule {
  readonly pattern: RegExp;
  readonly category: string;
}

export const DEFAULT_RULES: readonly AutoTagRule[] = [
  { pattern: /uber|bolt|taxi|freenow/i, category: 'Transport' },
  { pattern: /carrefour|monoprix|auchan|intermarche|biocoop|leclerc/i, category: 'Groceries' },
  { pattern: /total|shell|bp|esso|station service/i, category: 'Fuel' },
  { pattern: /restaurant|cafe|bar|brasserie|snack/i, category: 'Restaurant' },
  { pattern: /edf|engie|veolia|orange|sfr|free|bouygues/i, category: 'Utilities' },
  { pattern: /cotisation|frais bancaires|agios/i, category: 'BankingFees' },
  { pattern: /assurance|mutuelle/i, category: 'Insurance' },
  { pattern: /netflix|spotify|prime|disney|apple\.com|abonnement/i, category: 'Subscriptions' },
];
