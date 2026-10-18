import assert from 'node:assert/strict';
import test from 'node:test';

import { classify, toVerdict, UNCERTAIN_HIGH, UNCERTAIN_LOW } from './classify.mjs';

test('classify exports the inclusive uncertain range', () => {
  assert.equal(UNCERTAIN_LOW, 0.2);
  assert.equal(UNCERTAIN_HIGH, 0.8);
  assert.equal(classify(0.2), 'uncertain');
  assert.equal(classify(0.8), 'uncertain');
});

test('classify separates yes, no, and uncertain probabilities', () => {
  assert.equal(classify(0), 'no');
  assert.equal(classify(0.1999), 'no');
  assert.equal(classify(0.2001), 'uncertain');
  assert.equal(classify(0.7999), 'uncertain');
  assert.equal(classify(0.8001), 'yes');
  assert.equal(classify(1), 'yes');
});

test('classify marks invalid probabilities', () => {
  for (const probability of [undefined, null, '0.5', NaN, Infinity, -Infinity, -0.01, 1.01]) {
    assert.equal(classify(probability), 'invalid');
  }
});

test('toVerdict maps yes and no according to polarity', () => {
  assert.equal(toVerdict(0.9, 'yes_is_pass'), 'pass');
  assert.equal(toVerdict(0.1, 'yes_is_pass'), 'defect');
  assert.equal(toVerdict(0.9, 'yes_is_defect'), 'defect');
  assert.equal(toVerdict(0.1, 'yes_is_defect'), 'pass');
});

test('toVerdict preserves uncertain and invalid classifications', () => {
  assert.equal(toVerdict(0.2, 'yes_is_pass'), 'uncertain');
  assert.equal(toVerdict(0.8, 'yes_is_defect'), 'uncertain');
  assert.equal(toVerdict(NaN, 'yes_is_pass'), 'invalid');
});

test('toVerdict rejects unknown polarities', () => {
  assert.throws(() => toVerdict(0.9, 'unknown'), TypeError);
});
