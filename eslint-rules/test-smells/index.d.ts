import type { Rule } from 'eslint';

declare const testSmellRules: { rules: Record<string, Rule.RuleModule> };
export default testSmellRules;
