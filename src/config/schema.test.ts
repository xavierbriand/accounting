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

describe('parseConfig — refusals the reader makes on shape alone', () => {
  // These were all removable without a single test failing. Each one is a value
  // of the wrong TOML type that would otherwise be carried into the plan.

  it('refuses text where an amount belongs', () => {
    expect(() => parse({ buffer: '[buffer]\ntarget = "twelve"\n' })).toThrow(/not an amount/);
  });

  it('refuses an empty amount rather than reading it as zero', () => {
    // `parseAmount` reads "" as zero for the bank's CSV, where debit and credit
    // share a row. On a hand-edited file that turns a half-finished edit into a
    // confident zero — and a blank income gives that person a zero share.
    const bad = () => parse({ buffer: '[buffer]\ntarget = ""\n' });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/would be read as zero euros/);
    expect(() =>
      parse({
        people: `
[people.alice]
name = "Alice"
[[people.alice.income]]
label = "Salary"
monthly = "   "
`,
      }),
    ).toThrow(/would be read as zero euros/);
  });

  it('refuses a number where text belongs', () => {
    expect(() =>
      parse({
        people: `
[people.alice]
name = 5
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"
`,
      }),
    ).toThrow(/must be text/);
  });

  it('refuses a non-string amount', () => {
    expect(() => parse({ buffer: '[buffer]\ntarget = true\n' })).toThrow(/must be an amount/);
  });

  it('refuses a fractional whole number', () => {
    expect(() => parse({ funding: '[funding]\ncutoff_day = 25.5\n' })).toThrow(
      /must be a whole number/,
    );
  });

  it('refuses a non-integer in a list of whole numbers', () => {
    expect(() =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries" }]
estimate = "1200.00"
seasonal = { months = ["6"] }
`,
      }),
    ).toThrow(/must be a list of whole numbers/);
  });

  it('refuses a non-string in a list of labels', () => {
    expect(() =>
      parse({
        people: `
[people.alice]
name = "Alice"
transfer_labels = [5]
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"
`,
      }),
    ).toThrow(/must be a list of quoted strings/);
  });

  it('refuses a value where a section belongs', () => {
    // Reachable only through the root fragment: a bare key placed after a table
    // would land inside it, and the test would pass on a different rule.
    expect(() => parse({ root: 'envelopes = 5\n', envelopes: '' })).toThrow(/must be a section/);
    expect(() => parse({ root: 'people = 5\n', people: '' })).toThrow(/must be a section/);
  });

  it('refuses a value where a list of sections belongs', () => {
    expect(() =>
      parse({
        people: `
[people.alice]
name = "Alice"
income = 5
`,
      }),
    ).toThrow(/must be a list of sections/);
  });
});

describe('parseConfig — refusals on amounts that would reverse a figure', () => {
  it('refuses a negative envelope estimate', () => {
    expect(() =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries" }]
estimate = "-1200.00"
`,
      }),
    ).toThrow(/estimate of/);
  });

  it('refuses a negative goal, which "not above the estimate" lets through', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries" }]
estimate = "1200.00"
goal = "-500.00"
`,
      });
    expect(bad).toThrow(ConfigError);
    expect(bad).toThrow(/goal cannot be negative/);
  });

  it('refuses negative income', () => {
    expect(() =>
      parse({
        people: `
[people.alice]
name = "Alice"
[[people.alice.income]]
label = "Salary"
monthly = "-3200.00"
`,
      }),
    ).toThrow(/Income cannot be negative/);
  });
});

describe('parseConfig — seasonal shapes', () => {
  const withSeasonal = (seasonal: string) =>
    parse({
      envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries" }]
estimate = "1200.00"
${seasonal}
`,
    });

  it('names a misspelt key rather than advising the table be deleted', () => {
    // Arriving at "you gave neither form" almost always means a key was
    // misspelt. Advising removal sends the user to throw away the thing they
    // got nearly right.
    const bad = () => withSeasonal('seasonal = { month = [1, 2] }');
    expect(bad).toThrow(/seasonal\.month" is not a key sluice knows/);
    expect(bad).not.toThrow(/gives neither/);
  });

  it('gives both forms exactly one complaint, not one plus "months"/"weights" unknown', () => {
    // readSeasonal marks "months" and "weights" read with r.skip() before
    // r.done() runs, specifically so a legitimate key does not also get
    // flagged as unrecognised just because this branch chose not to use it.
    // Without that, "gives both" would arrive alongside two spurious "is not
    // a key sluice knows" complaints about the very keys that triggered it.
    let message = '';
    try {
      withSeasonal('seasonal = { months = [6], weights = [1,1,1,1,1,1,1,1,1,1,1,1] }');
    } catch (error) {
      message = (error as ConfigError).message;
    }
    expect(message).toMatch(/gives both/);
    expect(message).toMatch(/has 1 problem:/);
  });

  it('reports an unknown key alongside giving both forms', () => {
    const bad = () =>
      withSeasonal('seasonal = { months = [6], weights = [1,1,1,1,1,1,1,1,1,1,1,1], bogus = 1 }');
    expect(bad).toThrow(/seasonal\.bogus" is not a key sluice knows/);
    expect(bad).toThrow(/gives both/);
  });

  it('refuses a seasonal table giving neither form', () => {
    expect(() => withSeasonal('seasonal = { }')).toThrow(/gives neither/);
  });

  it('refuses an empty month list, which the all-zero rule would not catch', () => {
    // The months branch builds its own twelve zeros and returns before the
    // all-zero check, which guards only the weights branch.
    expect(() => withSeasonal('seasonal = { months = [] }')).toThrow(/List the months/);
  });
});

describe('parseConfig — a good first field does not excuse a bad later one', () => {
  // Six readers share one idiom: `if (X === null || problems.count !== before)
  // return null;`. It looks redundant — X becomes null only via a `fail()` call
  // that has already bumped `problems.count` — but every one of the six also
  // calls `r.done()`, or reads a later field, or reads a nested table, between
  // capturing `before` and this check. Any of those can add a problem while X
  // itself parsed fine, and the `|| problems.count !== before` half is what
  // catches that case. None of the six had a test where X succeeds and
  // something else in the same table fails, so that half of the guard had
  // never been exercised.

  it("refuses a seasonal months table with an extra key, even though months itself is fine", () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries" }]
estimate = "1200.00"
seasonal = { months = [6], bogus = 1 }
`,
      });
    expect(bad).toThrow(/seasonal\.bogus" is not a key sluice knows/);
  });

  it('refuses a bad weights shape, which nothing had exercised', () => {
    expect(() =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries" }]
estimate = "1200.00"
seasonal = { weights = "not a list" }
`,
      }),
    ).toThrow(/must be a list of whole numbers/);
  });

  it('refuses a seasonal weights table with an extra key, even though weights itself is fine', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries" }]
estimate = "1200.00"
seasonal = { weights = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], bogus = 1 }
`,
      });
    expect(bad).toThrow(/seasonal\.bogus" is not a key sluice knows/);
  });

  it('refuses a matcher with a bad category type, which nothing had exercised', () => {
    expect(() =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = 5 }]
estimate = "1200.00"
`,
      }),
    ).toThrow(/must be text/);
  });

  it('refuses a matcher with an extra key, even though category itself is fine', () => {
    // If readMatcher's guard is bypassed despite the bogus key, it returns a
    // usable matcher instead of null — this is the envelope's ONLY matcher,
    // so "claims nothing" would never fire, and that second complaint is
    // what actually distinguishes a bypassed guard from a working one; the
    // bogus-key message alone is reported either way.
    const bad = () =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries", bogus = 1 }]
estimate = "1200.00"
`,
      });
    expect(bad).toThrow(/matches\[0\]\.bogus" is not a key sluice knows/);
  });

  it('refuses an envelope with no matches key at all, not just an empty one', () => {
    // Absent and empty are different refusals with different messages — "matches
    // is empty" already had a test; a wholly absent key had not, and it is the
    // one that would crash instead of refusing gracefully if the fallback that
    // guards against it were ever removed.
    const bad = () =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
estimate = "1200.00"
`,
      });
    expect(bad).toThrow(/"envelopes\.food\.matches" is missing/);
  });

  it('refuses an envelope with a good name but a malformed estimate', () => {
    const bad = () =>
      parse({
        envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries" }]
estimate = "not an amount"
`,
      });
    expect(bad).toThrow(/not an amount/);
  });

  it('refuses an income source with a good label but a malformed amount', () => {
    const bad = () =>
      parse({
        people: `
[people.alice]
name = "Alice"
[[people.alice.income]]
label = "Salary"
monthly = "not an amount"
`,
      });
    expect(bad).toThrow(/not an amount/);
  });

  it('refuses an income source with a bad label type, which nothing had exercised', () => {
    expect(() =>
      parse({
        people: `
[people.alice]
name = "Alice"
[[people.alice.income]]
label = 5
monthly = "3200.00"
`,
      }),
    ).toThrow(/must be text/);
  });

  it("refuses a person with a good name whose income entry is itself malformed", () => {
    // Not the same case as the income-source test above, even though the
    // fixture looks similar: that one exercises readIncome's own guard from
    // inside readIncome. This one exercises readPerson's guard, catching a
    // problem a NESTED reader added to the shared `problems` object while
    // the person's own `name` parsed fine — a different call site, a
    // different survivor, and the malformed amount has to be on a field
    // readPerson itself never touches directly, or the name check alone
    // could coincidentally cover it. `annual` on a second income entry does
    // that: the first entry is fine, so income.length > 0 by the time
    // readPerson's guard runs, isolating the failure to the second entry's
    // own readIncome call rather than to anything readPerson reads itself.
    const bad = () =>
      parse({
        people: `
[people.alice]
name = "Alice"
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"
[[people.alice.income]]
label = "Bonus"
annual = "not an amount"
`,
      });
    expect(bad).toThrow(/not an amount/);
  });
});

describe('parseConfig — reporting', () => {
  it('carries the problems as a list, not only as one joined message', () => {
    // The page renders one problem per row. Without the list its only route is
    // splitting the message back apart on its bullet characters.
    let caught: ConfigError | undefined;
    try {
      parse({ buffer: '[buffer]\ntarget = 2500\n', funding: '[funding]\ncutoff_day = 30\n' });
    } catch (error) {
      caught = error as ConfigError;
    }
    expect(caught?.problems).toHaveLength(2);
    expect(caught?.problems[0]).toMatch(/binary float/);
    expect(caught?.problems[1]).toMatch(/between 1 and 28/);
  });

  it('complains once about a fault under a named-table parent', () => {
    // `namedTables` was the one accessor without the already-refused guard, so
    // one date here produced the date complaint, then "must be a section", then
    // a third line claiming no people were declared.
    let caught: ConfigError | undefined;
    try {
      parse({ people: '[people]\nbruno = 2024-01-01\n' });
    } catch (error) {
      caught = error as ConfigError;
    }
    expect(caught?.problems.filter((p) => /people\.bruno/.test(p))).toHaveLength(1);
    expect(caught?.problems.join('\n')).not.toMatch(/must be a section/);
  });

  it('reports a symmetric label collision once, not once per direction', () => {
    let caught: ConfigError | undefined;
    try {
      parse({
        people: `
[people.alice]
name = "Alice"
transfer_labels = ["ALICE"]
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[people.bruno]
name = "Bruno"
transfer_labels = ["alice"]
[[people.bruno.income]]
label = "Salary"
monthly = "2450.00"
`,
      });
    } catch (error) {
      caught = error as ConfigError;
    }
    expect(caught?.problems).toHaveLength(1);
  });

  it('still catches a collision whichever way round the labels are declared', () => {
    for (const [first, second] of [
      ['"ALICE"', '"ALICE MARTIN"'],
      ['"ALICE MARTIN"', '"ALICE"'],
    ]) {
      expect(() =>
        parse({
          people: `
[people.alice]
name = "Alice"
transfer_labels = [${first}]
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[people.bruno]
name = "Bruno"
transfer_labels = [${second}]
[[people.bruno.income]]
label = "Salary"
monthly = "2450.00"
`,
        }),
      ).toThrow(/credited to neither/);
    }
  });

  it('does not treat a sub-category named after a built-in as reserved', () => {
    // A plain-object lookup walks the prototype chain, so "constructor" was
    // refused with a stringified function as the explanation.
    const config = parse({
      envelopes: `
[envelopes.food]
name = "Food"
matches = [{ category = "Groceries", sub_category = "constructor" }]
estimate = "1200.00"
`,
    });
    expect(config.envelopes[0]?.matches[0]).toEqual({
      kind: 'sub-category',
      category: 'Groceries',
      subCategory: 'constructor',
    });
  });
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

  it('returns both people when a transfer matches two, rather than picking one', () => {
    // The whole reason this returns an array. Validation cannot rule the case
    // out: "ALICE" and "MARTIN" contain neither, so the config is accepted, and
    // a transfer naming both matches both. A caller taking the first would move
    // real money between two people's totals.
    const ambiguous = parse({
      people: `
[people.alice]
name = "Alice"
transfer_labels = ["ALICE"]
[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[people.bruno]
name = "Bruno"
transfer_labels = ["MARTIN"]
[[people.bruno.income]]
label = "Salary"
monthly = "2450.00"
`,
    });
    expect(peopleMatching(ambiguous, 'VIR RECU ALICE MARTIN').map((p) => p.id)).toEqual([
      'alice',
      'bruno',
    ]);
  });
});
