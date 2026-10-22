import assert from 'node:assert/strict';
import test from 'node:test';

import { classify, toVerdict, UNCERTAIN_HIGH, UNCERTAIN_LOW } from './classify.mjs';

test('classify uses strict thresholds outside the inclusive uncertain range', () => {
  assert.equal(UNCERTAIN_LOW, 0.2);
  assert.equal(UNCERTAIN_HIGH, 0.8);
  assert.equal(classify(0), 'no');
  assert.equal(classify(0.1999), 'no');
  assert.equal(classify(0.2), 'uncertain');
  assert.equal(classify(0.8), 'uncertain');
  assert.equal(classify(0.8001), 'yes');
  assert.equal(classify(1), 'yes');
});

test('classify marks non-finite, non-numeric, and out-of-range values invalid', () => {
  for (const value of [undefined, null, '0.5', NaN, Infinity, -Infinity, -0.01, 1.01]) {
    assert.equal(classify(value), 'invalid');
  }
});

test('toVerdict maps yes and no according to polarity and preserves uncertain values', () => {
  assert.equal(toVerdict(0.9, 'yes_is_pass'), 'pass');
  assert.equal(toVerdict(0.1, 'yes_is_pass'), 'defect');
  assert.equal(toVerdict(0.9, 'yes_is_defect'), 'defect');
  assert.equal(toVerdict(0.1, 'yes_is_defect'), 'pass');
  assert.equal(toVerdict(0.2, 'yes_is_pass'), 'uncertain');
  assert.equal(toVerdict(NaN, 'yes_is_pass'), 'invalid');
  assert.throws(() => toVerdict(0.9, 'unknown'), TypeError);
});
