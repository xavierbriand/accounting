import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { CucumberExpression, RegularExpression, ParameterTypeRegistry } from '@cucumber/cucumber-expressions';

export type FeatureScenario = {
  name: string;
  file: string;
  steps: string[];
};

export type StepDefinitionSource = {
  pattern: string;
  kind: 'expression' | 'regex';
  file: string;
};

export type UnmappedScenarioFinding = {
  kind: 'unmapped-scenario';
  scenario: string;
  file: string | null;
  reason: string;
};

export type OrphanStepFinding = {
  kind: 'orphan-step';
  pattern: string;
  file: string;
};

export type GherkinMapFinding = UnmappedScenarioFinding | OrphanStepFinding;

export type GherkinMapResult = {
  findings: GherkinMapFinding[];
};

export function parseFeatureScenarios(content: string, file: string): FeatureScenario[] {
  const builder = new AstBuilder(IdGenerator.uuid());
  const matcher = new GherkinClassicTokenMatcher();
  const parser = new Parser(builder, matcher);
  const document = parser.parse(content);

  const scenarios: FeatureScenario[] = [];
  for (const child of document.feature?.children ?? []) {
    if (child.scenario === undefined) continue;
    scenarios.push({
      name: child.scenario.name,
      file,
      steps: child.scenario.steps.map((step) => step.text),
    });
  }
  return scenarios;
}

const STEP_CALL_PATTERN = /\b(?:Given|When|Then)\(\s*(\/(?:[^\\/]|\\.)*\/|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;

function unescapeStringLiteral(body: string): string {
  return body.replace(/\\(.)/g, (_, ch: string) => (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch));
}

function unquote(literal: string): { pattern: string; kind: 'expression' | 'regex' } {
  if (literal.startsWith('/')) {
    return { pattern: literal.slice(1, -1), kind: 'regex' };
  }
  return { pattern: unescapeStringLiteral(literal.slice(1, -1)), kind: 'expression' };
}

export function parseStepDefinitions(source: string, file: string): StepDefinitionSource[] {
  const defs: StepDefinitionSource[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(STEP_CALL_PATTERN.source, 'g');
  while ((match = pattern.exec(source)) !== null) {
    const { pattern: stepPattern, kind } = unquote(match[1]);
    defs.push({ pattern: stepPattern, kind, file });
  }
  return defs;
}

function buildMatcher(def: StepDefinitionSource, registry: ParameterTypeRegistry): (text: string) => boolean {
  try {
    if (def.kind === 'regex') {
      const expr = new RegularExpression(new RegExp(def.pattern), registry);
      return (text: string) => expr.match(text) !== null;
    }
    const expr = new CucumberExpression(def.pattern, registry);
    return (text: string) => expr.match(text) !== null;
  } catch {
    return () => false;
  }
}

export function checkGherkinMap(
  scenarios: FeatureScenario[],
  stepDefs: StepDefinitionSource[],
  planScenarioNames: string[],
): GherkinMapResult {
  const registry = new ParameterTypeRegistry();
  const matchers = stepDefs.map((def) => buildMatcher(def, registry));

  const findings: GherkinMapFinding[] = [];
  for (const scenario of scenarios) {
    for (const step of scenario.steps) {
      const resolved = matchers.some((matcher) => matcher(step));
      if (!resolved) {
        findings.push({
          kind: 'unmapped-scenario',
          scenario: scenario.name,
          file: scenario.file,
          reason: `step "${step}" has no matching step definition`,
        });
        break;
      }
    }
  }

  const featureScenarioNames = new Set(scenarios.map((s) => s.name));
  for (const planName of planScenarioNames) {
    if (!featureScenarioNames.has(planName)) {
      findings.push({
        kind: 'unmapped-scenario',
        scenario: planName,
        file: null,
        reason: 'scenario declared in plan but absent from feature files',
      });
    }
  }

  return { findings };
}
