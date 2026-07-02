import { describe, it, expect } from 'vitest';
import {
  parseFeatureScenarios,
  parseStepDefinitions,
  checkGherkinMap,
  type StepDefinitionSource,
} from '../lib/gherkin-map.js';

describe('parseFeatureScenarios', () => {
  // fails if: scenario names or step texts are mis-extracted from the
  // Gherkin AST — every downstream check depends on this being accurate.
  it('extracts scenario names and step texts from a feature file', () => {
    const content = [
      'Feature: widget',
      '',
      '  Scenario: first scenario',
      '    Given a precondition',
      '    When an action happens',
      '    Then an outcome is observed',
      '',
      '  Scenario: second scenario',
      '    Given another precondition',
    ].join('\n');
    const scenarios = parseFeatureScenarios(content, 'widget.feature');
    expect(scenarios).toEqual([
      {
        name: 'first scenario',
        file: 'widget.feature',
        steps: ['a precondition', 'an action happens', 'an outcome is observed'],
      },
      {
        name: 'second scenario',
        file: 'widget.feature',
        steps: ['another precondition'],
      },
    ]);
  });
});

describe('parseStepDefinitions', () => {
  // fails if: a string cucumber-expression step def is not extracted —
  // guards the primary step-def convention used throughout tests/features/steps.
  it('extracts a string cucumber-expression step definition', () => {
    const source = "Given('a precondition with {int} items', function (state) {});\n";
    const defs = parseStepDefinitions(source, 'widget.steps.ts');
    expect(defs).toEqual([
      { pattern: 'a precondition with {int} items', kind: 'expression', file: 'widget.steps.ts' },
    ]);
  });

  // fails if: a regex-literal step def is not extracted — guards the
  // "regex step-defs match directly" alternative form named in the plan.
  it('extracts a regex-literal step definition', () => {
    const source = 'When(/^an action happens$/, function (state) {});\n';
    const defs = parseStepDefinitions(source, 'widget.steps.ts');
    expect(defs).toEqual([
      { pattern: '^an action happens$', kind: 'regex', file: 'widget.steps.ts' },
    ]);
  });

  it('extracts multiple step defs across Given/When/Then and multi-line calls', () => {
    const source = [
      "Given(",
      "  'a config with three buffers:',",
      '  function (state, table) {},',
      ');',
      "Then('exit code is {int}', function (state, code) {});",
    ].join('\n');
    const defs = parseStepDefinitions(source, 'x.ts');
    expect(defs).toEqual([
      { pattern: 'a config with three buffers:', kind: 'expression', file: 'x.ts' },
      { pattern: 'exit code is {int}', kind: 'expression', file: 'x.ts' },
    ]);
  });
});

describe('checkGherkinMap', () => {
  const STEP_DEFS: StepDefinitionSource[] = [
    { pattern: 'a precondition', kind: 'expression', file: 'widget.steps.ts' },
    { pattern: 'an outcome is observed', kind: 'expression', file: 'widget.steps.ts' },
  ];

  // fails if: a feature step with no matching step definition is silently
  // passed — guards Scenario C's core "unmapped step" invariant.
  it('reports unmapped-scenario when a step has no matching step definition', () => {
    const scenarios = [
      {
        name: 'first scenario',
        file: 'widget.feature',
        steps: ['a precondition', 'an action with no def', 'an outcome is observed'],
      },
    ];
    const result = checkGherkinMap(scenarios, STEP_DEFS, []);
    expect(result.findings).toContainEqual({
      kind: 'unmapped-scenario',
      scenario: 'first scenario',
      file: 'widget.feature',
      reason: 'step "an action with no def" has no matching step definition',
    });
  });

  // fails if: a scenario whose steps all resolve is falsely flagged —
  // guards against over-reporting.
  it('does not flag a scenario whose steps all resolve', () => {
    const scenarios = [
      { name: 'clean scenario', file: 'widget.feature', steps: ['a precondition', 'an outcome is observed'] },
    ];
    const result = checkGherkinMap(scenarios, STEP_DEFS, []);
    expect(result.findings).toEqual([]);
  });

  // fails if: a plan-declared scenario name absent from the feature files
  // is not reported — guards Scenario C's "plan-only scenario" invariant.
  it('reports unmapped-scenario for a plan-declared scenario absent from feature files', () => {
    const scenarios = [
      { name: 'clean scenario', file: 'widget.feature', steps: ['a precondition'] },
    ];
    const result = checkGherkinMap(scenarios, STEP_DEFS, ['a plan-only scenario name']);
    expect(result.findings).toContainEqual({
      kind: 'unmapped-scenario',
      scenario: 'a plan-only scenario name',
      file: null,
      reason: 'scenario declared in plan but absent from feature files',
    });
  });

  // fails if: cucumber-expression parameter types ({int}/{string}/{float})
  // aren't compiled into a matcher, so a step using a live value never
  // resolves against its parameterized def.
  it('resolves a step against a {int}/{string}/{float} parameterized step definition', () => {
    const defs: StepDefinitionSource[] = [
      { pattern: 'exit code is {int}', kind: 'expression', file: 'x.steps.ts' },
      { pattern: '{string} has balance {float} EUR and status {string}', kind: 'expression', file: 'x.steps.ts' },
    ];
    const scenarios = [
      {
        name: 'param scenario',
        file: 'x.feature',
        steps: ['exit code is 0', '"Vacation" has balance 600.5 EUR and status "below"'],
      },
    ];
    const result = checkGherkinMap(scenarios, defs, []);
    expect(result.findings).toEqual([]);
  });

  // fails if: a regex-literal step definition is not matched directly
  // against feature step text — guards the regex-form step-def path.
  it('resolves a step against a regex-literal step definition', () => {
    const defs: StepDefinitionSource[] = [
      { pattern: '^an action happens$', kind: 'regex', file: 'x.steps.ts' },
    ];
    const scenarios = [
      { name: 'regex scenario', file: 'x.feature', steps: ['an action happens'] },
    ];
    const result = checkGherkinMap(scenarios, defs, []);
    expect(result.findings).toEqual([]);
  });
});
