import { Given, When, Then } from 'quickpickle';

// Skeleton step definitions — implemented in slice 7.
// All steps throw 'not implemented' so the acceptance scenarios fail for the right reason.

Given('a config with two split windows:', function () {
  throw new Error('not implemented');
});

When('I look up the active splits as of {string}', function () {
  throw new Error('not implemented');
});

Then('the active ratios are Alex 0.6 and Sam 0.4', function () {
  throw new Error('not implemented');
});

Then('looking up the active splits as of {string} also returns 0.6 \\/ 0.4 (start-inclusive)', function () {
  throw new Error('not implemented');
});

Then('looking up the active splits as of {string} returns 0.5 \\/ 0.5 (end-exclusive)', function () {
  throw new Error('not implemented');
});

Then('looking up the active splits as of {string} returns Result.fail with {string}', function () {
  throw new Error('not implemented');
});

Given('a config has two split windows both starting on {string}', function () {
  throw new Error('not implemented');
});

When('the configuration is loaded', function () {
  throw new Error('not implemented');
});

Then('loading fails with an error citing the duplicate validFrom by index', function () {
  throw new Error('not implemented');
});

Then('the error message contains no stack trace and no Zod-internal type name', function () {
  throw new Error('not implemented');
});

Given('a config where window 0 has partners {string}', function () {
  throw new Error('not implemented');
});

Given('window 1 has partners {string}', function () {
  throw new Error('not implemented');
});

Then('loading fails with an error citing the offending window by index', function () {
  throw new Error('not implemented');
});

Then('the error message does NOT echo any partner name verbatim', function () {
  throw new Error('not implemented');
});
