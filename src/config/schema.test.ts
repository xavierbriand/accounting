import { describe, expect, it } from 'vitest';
import { ConfigError, envelopeIndex, parseConfig, peopleMatching } from './schema.ts';
import { configToml, EXAMPLE_TOML } from './__fixtures__/build.ts';

const parse = (parts: Parameters<typeof configToml>[0] = {}) =>
  parseConfig(configToml(parts), 'sluice.toml');

describe('parseConfig — a config that is right', () => {
  it('reads the minimal file', () => {
    const config = parse();
    expect(config.exportsDirectory).toBe('./exports');
    expect(config.bufferTarget).toBe(250000);
    expect(config.fundingCutoffDay).toBe(25);
    expect(config.people).toHaveLength(1);
    expect(config.envelopes).toHaveLength(0);
  });

  it('reads amounts as whole cents, never as floats', () => {
    const config = parse({ buffer: '[buffer]\ntarget = "2500.10"\n' });
    expect(config.bufferTarget).toBe(250010);
    expect(Number.isInteger(config.bufferTarget)).toBe(true);
  });

  it('keeps a monthly and an annual income source apart', () => {
    const config = parse({
      people: `
[people.alice]
name = "Alice"
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"
[[people.alice.income]]
label = "Bonus"
annual = "4800.00"
`,
    });
    expect(config.people[0]?.income).toEqual([
      { cadence: 'monthly', label: 'Salary', net: 320000 },
      { cadence: 'annual', label: 'Bonus', net: 480000 },
    ]);
  });

  it('gives a person with no declared labels an empty list, not a missing one', () => {
    const config = parse({
      people: `
[people.alice]
name = "Alice"
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"
`,
    });
    expect(config.people[0]?.transferLabels).toEqual([]);
  });

  it('reads a whole-category matcher and a single-pair one as different claims', () => {
    const config = parse({
      envelopes: `
[envelopes.leisure]
name = "Leisure"
matches = [{ category = "Leisure" }]
estimate = "1000.00"
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = "1000.00"
`,
    });
    expect(config.envelopes[0]?.matches[0]).toEqual({ kind: 'category', category: 'Leisure' });
    expect(config.envelopes[1]?.matches[0]).toEqual({
      kind: 'sub-category',
      category: 'Food',
      subCategory: 'Supermarket',
    });
  });

  it('takes an estimate without a goal, for an envelope nobody is optimising', () => {
    const config = parse({
      envelopes: `
[envelopes.leisure]
name = "Leisure"
matches = [{ category = "Leisure" }]
estimate = "2400.00"
`,
    });
    expect(config.envelopes[0]?.estimate).toBe(240000);
    expect(config.envelopes[0]?.goal).toBeNull();
    expect(config.envelopes[0]?.seasonal).toBeNull();
  });

  it('keeps the estimate as written rather than deriving it', () => {
    // The estimate is a commitment, not a derivation. One that re-derived itself
    // from last year's actuals would agree with reality by construction, and the
    // drift this product exists to catch would never show: spending could grow
    // every year with the plan silently growing to match.
    const config = parse({
      envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = "7800.00"
goal = "7200.00"
`,
    });
    expect(config.envelopes[0]?.estimate).toBe(780000);
    expect(config.envelopes[0]?.goal).toBe(720000);
  });

  it('expands the months shorthand into twelve weights', () => {
    const config = parse({
      envelopes: `
[envelopes.insurance]
name = "Insurance"
matches = [{ category = "Home", sub_category = "Insurance" }]
seasonal = { months = [6] }
estimate = "1000.00"
`,
    });
    expect(config.envelopes[0]?.seasonal).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('takes twelve relative weights as written, without normalising them', () => {
    // Relative on purpose: normalising here would force a rounding rule into the
    // parser, and the allocation that needs one belongs where the pot is split.
    const config = parse({
      envelopes: `
[envelopes.heating]
name = "Heating"
matches = [{ category = "Home", sub_category = "Energy" }]
seasonal = { weights = [3, 3, 2, 1, 1, 1, 1, 1, 1, 2, 3, 3] }
estimate = "1000.00"
`,
    });
    expect(config.envelopes[0]?.seasonal).toEqual([3, 3, 2, 1, 1, 1, 1, 1, 1, 2, 3, 3]);
  });

  it('parses the example that documents the format', () => {
    // The example is a fixture so the documentation and the parser cannot drift.
    const config = parseConfig(EXAMPLE_TOML, 'sluice.toml');
    expect(config.people).toHaveLength(2);
    expect(config.envelopes).toHaveLength(4);
  });
});

describe('parseConfig — refusals that would otherwise be a wrong number', () => {
  it('refuses a key it does not know, rather than ignoring it', () => {
    // The highest-value check here: a misspelling leaves the key it was meant to
    // set at its default, so the figure that comes out is wrong, not missing.
    const bad = () => parse({ funding: '[funding]\ncuttoff_day = 25\n' });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/not a key sluice knows/);
  });

  it('refuses an amount written as a number rather than a quoted string', () => {
    const bad = () => parse({ buffer: '[buffer]\ntarget = 2500.10\n' });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/binary float/);
  });

  it('refuses a bare TOML date anywhere', () => {
    const bad = () => parse({ people: '[people.alice]\nname = 2026-01-01\n' });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/Nothing in sluice\.toml is a date/);
  });

  it('refuses a goal above its estimate', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = "7200.00"
goal = "7800.00"
`,
      });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/optimised plan asks for more money/);
  });

  it('refuses two envelopes claiming the same pair', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = "1000.00"
[envelopes.food]
name = "Food"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = "1000.00"
`,
      });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/count it twice/);
  });

  it('refuses a category matcher that swallows another envelope’s sub-category', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.all_food]
name = "All food"
matches = [{ category = "Food" }]
estimate = "1000.00"
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = "1000.00"
`,
      });
    expect(bad).toThrow(/count it twice/);
  });

  it('refuses an envelope claiming the card settlement sub-category', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.cards]
name = "Cards"
matches = [{ category = "Transaction exclue", sub_category = "Transaction differee" }]
estimate = "1000.00"
`,
      });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/already itemised on the card exports/);
  });

  it('refuses an envelope claiming the internal transfer sub-category', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.moves]
name = "Moves"
matches = [{ category = "Transaction exclue", sub_category = "Virement interne" }]
estimate = "1000.00"
`,
      });
    expect(bad).toThrow(/not spending/);
  });

  it('refuses a person with no income', () => {
    const bad = () => parse({ people: '[people.alice]\nname = "Alice"\nincome = []\n' });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/asked to fund the whole household/);
  });

  it('refuses an income entry giving both monthly and annual', () => {
    const bad = () =>
      parse({
        people: `
[people.alice]
name = "Alice"
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"
annual = "38400.00"
`,
      });
    expect(bad).toThrow(/counted twice/);
  });

  it('refuses an income entry giving neither', () => {
    const bad = () =>
      parse({
        people: `
[people.alice]
name = "Alice"
[[people.alice.income]]
label = "Salary"
`,
      });
    expect(bad).toThrow(/multiplied by twelve/);
  });

  it('refuses a funding cutoff that does not exist in every month', () => {
    const bad = () => parse({ funding: '[funding]\ncutoff_day = 30\n' });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/between 1 and 28/);
  });

  it('refuses a seasonal shape that is not twelve months long', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.heating]
name = "Heating"
matches = [{ category = "Home", sub_category = "Energy" }]
seasonal = { weights = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
estimate = "1000.00"
`,
      });
    expect(bad).toThrow(/stops setting money aside for/);
  });

  it('refuses an all-zero seasonal shape', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.heating]
name = "Heating"
matches = [{ category = "Home", sub_category = "Energy" }]
seasonal = { weights = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
estimate = "1000.00"
`,
      });
    expect(bad).toThrow(/no total to divide by/);
  });

  it('refuses a negative seasonal weight', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.heating]
name = "Heating"
matches = [{ category = "Home", sub_category = "Energy" }]
seasonal = { weights = [1, 1, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1] }
estimate = "1000.00"
`,
      });
    expect(bad).toThrow(/take money back out of a month/);
  });

  it('refuses a seasonal shape giving both forms', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.heating]
name = "Heating"
matches = [{ category = "Home", sub_category = "Energy" }]
seasonal = { months = [6], weights = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
estimate = "1000.00"
`,
      });
    expect(bad).toThrow(/Give one/);
  });

  it('refuses a month outside the year', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.insurance]
name = "Insurance"
matches = [{ category = "Home", sub_category = "Insurance" }]
seasonal = { months = [13] }
estimate = "1000.00"
`,
      });
    expect(bad).toThrow(/Months are 1 to 12/);
  });

  it('refuses an envelope that claims nothing', () => {
    const bad = () =>
      parse({
        envelopes: '[envelopes.groceries]\nname = "Groceries"\nmatches = []\nestimate = "1000.00"\n',
      });
    expect(bad).toThrow(/budgeted for spending that is also counted/);
  });

  it('refuses a declared envelope with no estimate', () => {
    // Declaring an envelope is an act of planning. Without a figure there is
    // nothing for the year's actuals to be compared against, so the envelope
    // could drift indefinitely and never register as drifting.
    const bad = () =>
      parse({
        envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Food", sub_category = "Supermarket" }]
goal = "7200.00"
`,
      });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/estimate" is missing/);
  });

  it('refuses an empty transfer label', () => {
    const bad = () =>
      parse({
        people: `
[people.alice]
name = "Alice"
transfer_labels = ["  "]
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"
`,
      });
    expect(bad).toThrow(/credit every inbound transfer/);
  });

  it('refuses one person’s label containing another’s', () => {
    const bad = () =>
      parse({
        people: `
[people.alice]
name = "Alice"
transfer_labels = ["MARTIN"]
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[people.bruno]
name = "Bruno"
transfer_labels = ["MARTIN BRUNO"]
[[people.bruno.income]]
label = "Salary"
monthly = "2450.00"
`,
      });
    expect(bad).toThrow(/credited to neither/);
  });

  it('refuses a negative buffer', () => {
    const bad = () => parse({ buffer: '[buffer]\ntarget = "-500.00"\n' });
    expect(bad).toThrow(/reduce every contribution/);
  });

  it('refuses a file declaring no people', () => {
    const bad = () => parseConfig(configToml({ people: '[people]\n' }), 'sluice.toml');
    expect(bad).toThrow(/nobody to compute it for/);
  });

  it('refuses a file with no exports directory', () => {
    const bad = () => parse({ exports: '[exports]\n' });
    expect(bad).toThrow(/exports\.directory/);
  });

  it('refuses TOML it cannot parse, naming the file and keeping the cause', () => {
    let caught: unknown;
    try {
      parseConfig('[exports\ndirectory = "x"', 'sluice.toml');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as ConfigError).message).toMatch(/not valid TOML/);
    expect((caught as ConfigError).cause).toBeDefined();
  });
});

describe('parseConfig — reporting', () => {
  it('reports every problem in the file at once, not one per run', () => {
    // The file is hand-edited once a year. Five runs to find five typos works
    // against the reason this product exists.
    let message = '';
    try {
      parse({
        buffer: '[buffer]\ntarget = 2500\n',
        funding: '[funding]\ncutoff_day = 30\n',
      });
    } catch (error) {
      message = (error as ConfigError).message;
    }
    expect(message).toMatch(/binary float/);
    expect(message).toMatch(/between 1 and 28/);
    expect(message).toMatch(/has 2 problems/);
  });

  it('complains once about a refused value, not twice', () => {
    // A date was refused and then re-examined by the type check that followed,
    // which reported it a second time as the wrong kind of fault entirely. One
    // mistake in the file has to be one line in the report, or the report stops
    // being a list of things to fix.
    let message = '';
    try {
      parse({
        people: `
[people.alice]
name = 2026-01-01
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"
`,
      });
    } catch (error) {
      message = (error as ConfigError).message;
    }
    expect(message).toMatch(/Nothing in sluice\.toml is a date/);
    expect(message).not.toMatch(/must be text/);
    expect(message).toMatch(/has 1 problem:/);
  });

  it('reports every overlapping pair of envelopes, not only the first', () => {
    let message = '';
    try {
      parse({
        envelopes: `
[envelopes.a]
name = "A"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = "1000.00"
[envelopes.b]
name = "B"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = "1000.00"
[envelopes.c]
name = "C"
matches = [{ category = "Home", sub_category = "Energy" }]
estimate = "1000.00"
[envelopes.d]
name = "D"
matches = [{ category = "Home", sub_category = "Energy" }]
estimate = "1000.00"
`,
      });
    } catch (error) {
      message = (error as ConfigError).message;
    }
    expect(message).toMatch(/"a" and "b"/);
    expect(message).toMatch(/"c" and "d"/);
    expect(message).toMatch(/has 2 problems:/);
  });

  it('reports one overlap per pair of envelopes, not one per claim', () => {
    // A whole-category matcher overlaps every sub-category matcher beneath it,
    // so listing each would bury one mistake under a pile of lines.
    let message = '';
    try {
      parse({
        envelopes: `
[envelopes.all_food]
name = "All food"
matches = [{ category = "Food" }]
estimate = "1000.00"
[envelopes.groceries]
name = "Groceries"
matches = [
  { category = "Food", sub_category = "Supermarket" },
  { category = "Food", sub_category = "Market" },
  { category = "Food", sub_category = "Bakery" },
]
estimate = "1000.00"
`,
      });
    } catch (error) {
      message = (error as ConfigError).message;
    }
    expect(message).toMatch(/has 1 problem:/);
  });

  it('reports every colliding pair of labels, not only the first', () => {
    let message = '';
    try {
      parse({
        people: `
[people.alice]
name = "Alice"
transfer_labels = ["MARTIN", "DUPONT"]
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[people.bruno]
name = "Bruno"
transfer_labels = ["MARTIN BRUNO", "DUPONT B"]
[[people.bruno.income]]
label = "Salary"
monthly = "2450.00"
`,
      });
    } catch (error) {
      message = (error as ConfigError).message;
    }
    expect(message).toMatch(/"MARTIN"/);
    expect(message).toMatch(/"DUPONT"/);
    expect(message).toMatch(/has 2 problems:/);
  });

  it('does not complain about the meaning of a value it could not read', () => {
    // A shape problem must not cascade into a domain complaint about a figure
    // that was never parsed — that would send the reader after the wrong thing.
    let message = '';
    try {
      parse({
        envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = 7800
goal = "7200.00"
`,
      });
    } catch (error) {
      message = (error as ConfigError).message;
    }
    expect(message).toMatch(/binary float/);
    expect(message).not.toMatch(/optimised plan asks for more/);
  });
});

describe('envelopeIndex', () => {
  const config = parse({
    envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Food", sub_category = "Supermarket" }]
estimate = "7800.00"

[envelopes.leisure]
name = "Leisure"
matches = [{ category = "Leisure" }]
estimate = "2400.00"
`,
  });
  const index = envelopeIndex(config);

  it('finds the envelope claiming a pair', () => {
    expect(index.find('Food', 'Supermarket')?.id).toBe('groceries');
  });

  it('falls back to a whole-category claim', () => {
    expect(index.find('Leisure', 'Cinema')?.id).toBe('leisure');
  });

  it('returns null for a pair nobody claimed, so it gets an envelope of its own', () => {
    expect(index.find('Food', 'Restaurant')).toBeNull();
    expect(index.find('Transport', 'Fuel')).toBeNull();
  });
});

describe('peopleMatching', () => {
  const config = parse({
    people: `
[people.alice]
name = "Alice"
transfer_labels = ["ALICE MARTIN"]
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[people.bruno]
name = "Bruno"
transfer_labels = ["B DUPONT"]
[[people.bruno.income]]
label = "Salary"
monthly = "2450.00"
`,
  });

  it('credits a transfer to the person whose label catches it', () => {
    expect(peopleMatching(config, 'VIR RECU ALICE MARTIN').map((p) => p.id)).toEqual(['alice']);
  });

  it('credits nobody when no label catches it', () => {
    expect(peopleMatching(config, 'VIR VERS COMPTE CHEQUE')).toEqual([]);
  });
});
