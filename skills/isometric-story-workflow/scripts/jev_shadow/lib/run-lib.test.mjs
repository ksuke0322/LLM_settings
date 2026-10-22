import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRequest, summarize, toRecord } from './run-lib.mjs';

const row = overrides => ({
  schema_version: 1,
  id: 'row-1',
  review_type: '8B',
  item: { kind: 'hive', criterion: 'entrance visible' },
  render_set_sha256: 'a'.repeat(64),
  state: { scene: '/source/scene.png' },
  notes: { notes: 'scene shows the whole scene' },
  context: 'shared context',
  aggregation: 'all_pass',
  questions: {
    sub_0: {
      type: 'noul',
      instructions: 'is the entrance visible?',
      criteria: { true: 'slit visible', false: 'slit absent' },
      polarity: 'yes_is_pass'
    }
  },
  ...overrides
});

const build = async current => buildRequest(current, {
  prepare: async sourcePath => ({ path: `/cache/${sourcePath.split('/').at(-1)}`, width: 640, height: 480, resized: false }),
  image: async imagePath => ({ imagePath }),
  noul: (...args) => ({ args }),
  model: 'jev-1.14.0'
});

test('buildRequest forwards notes, criteria, model, and the required header', async () => {
  const built = await build(row());
  assert.equal(built.request.model, 'jev-1.14.0');
  assert.deepEqual(built.request.state.notes, 'scene shows the whole scene');
  assert.deepEqual(built.request.questions.sub_0.args, [
    'shared context is the entrance visible?',
    { true: 'slit visible', false: 'slit absent' }
  ]);
  assert.deepEqual(built.options, { headers: { 'TypeSafe-Danger-Zone-Images': 'true' } });
});

test('toRecord applies invalid, defect, uncertain, pass precedence and records row metadata', async () => {
  const current = row({
    questions: Object.fromEntries(['sub_0', 'sub_1', 'sub_2'].map(key => [key, {
      type: 'noul', instructions: key, criteria: { true: 'yes', false: 'no' }, polarity: 'yes_is_pass'
    }]))
  });
  const built = await build(current);
  const make = probabilities => toRecord(current, built, {
    answers: Object.fromEntries(probabilities.map((p, index) => [`sub_${index}`, { noul: p }])),
    model: 'actual-model',
    usage: { input_tokens: 12, output_tokens: 3 }
  }, null, 'jev-1.14.0');

  assert.equal(make([0.9, 0.1, 0.5]).row_verdict, 'defect');
  assert.equal(make([0.9, 0.9, 0.5]).row_verdict, 'uncertain');
  assert.equal(make([0.9, 0.9, 0.9]).row_verdict, 'pass');
  assert.equal(make([0.9, null, 0.1]).row_verdict, 'invalid');
  const record = make([0.91, 0.62, 0.78]);
  assert.equal(record.row_p_min, 0.62);
  assert.equal(record.requested_model, 'jev-1.14.0');
  assert.equal(record.model, 'actual-model');
  assert.equal(record.review_type, current.review_type);
  assert.equal(record.render_set_sha256, current.render_set_sha256);
  assert.deepEqual(record.item, current.item);
});

test('toRecord turns a request error into an invalid row and keeps a safe error string', async () => {
  const current = row();
  const built = await build(current);
  const record = toRecord(current, built, null, new Error('request failed'), 'jev-1.14.0');
  assert.equal(record.error, 'request failed');
  assert.equal(record.row_verdict, 'invalid');
  assert.equal(record.row_p_min, null);
});

test('summarize counts only the last record for each id after a resumed run', () => {
  const summary = summarize([
    { id: 'row-1', error: 'timeout', row_verdict: 'invalid', usage: { input_tokens: 8, output_tokens: 2 } },
    { id: 'row-2', error: null, row_verdict: 'pass', usage: { input_tokens: 5, output_tokens: 1 } },
    { id: 'row-1', error: null, row_verdict: 'defect', usage: { input_tokens: 3, output_tokens: 1 } }
  ]);
  assert.equal(summary.rows, 2);
  assert.equal(summary.errors, 0);
  assert.deepEqual(summary.byRowVerdict, { pass: 1, defect: 1, uncertain: 0, invalid: 0 });
  assert.deepEqual(summary.usage, { inputTokens: 8, outputTokens: 2 });
});
