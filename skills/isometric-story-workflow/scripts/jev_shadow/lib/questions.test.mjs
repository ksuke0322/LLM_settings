import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRows } from './questions.mjs';

const validRow = overrides => ({
  schema_version: 1,
  id: 'row-1',
  review_type: '8A',
  item: { kind: 'hive', criterion: 'visible entrance' },
  render_set_sha256: '0'.repeat(64),
  state: { scene: '/images/scene.PNG', closeup_0: '/images/detail.jpg' },
  notes: { notes: 'scene is full view' },
  context: 'Check the visible result in `scene`; details are in `notes`.',
  aggregation: 'all_pass',
  questions: {
    sub_0: {
      type: 'noul',
      instructions: '`closeup_0` shows an entrance slit.',
      criteria: { true: 'A slit is visible.', false: 'No slit is visible.' },
      polarity: 'yes_is_pass'
    }
  },
  ...overrides
});

const validOptions = { fileExists: path => ['/images/scene.PNG', '/images/detail.jpg'].includes(path) };
const messages = row => validateRows([row], validOptions).map(error => error.message);
const baseQuestion = validRow().questions.sub_0;

test('validateRows accepts a valid question row and reports its physical line', () => {
  const errors = validateRows([{ ...validRow(), __line: 7 }], validOptions);
  assert.deepEqual(errors, []);
});

test('validateRows rejects each top-level schema and item rule', () => {
  const invalidRows = [
    validRow({ schema_version: 2 }),
    validRow({ id: '  ' }),
    validRow({ review_type: '8D' }),
    validRow({ item: { kind: '', criterion: 'criterion' } }),
    validRow({ item: { kind: 'hive', criterion: '' } }),
    validRow({ render_set_sha256: 'A'.repeat(64) }),
    validRow({ state: {} }),
    validRow({ state: { ...validRow().state, other: '/images/scene.PNG' } }),
    validRow({ state: { scene: 'relative.png' } }),
    validRow({ state: { scene: '/images/missing.png' } }),
    validRow({ state: { scene: '/images/scene.gif' } }),
    validRow({ notes: [] }),
    validRow({ notes: { notes: ' ' } }),
    validRow({ context: '' }),
    validRow({ aggregation: 'any_pass' })
  ];

  for (const row of invalidRows) assert.ok(messages(row).length > 0, JSON.stringify(row));
});

test('validateRows checks image file existence through the injected predicate', () => {
  const errors = validateRows([validRow()], { fileExists: () => false });
  assert.ok(errors.some(error => error.message.includes('does not exist')));
});

test('validateRows rejects duplicate identifiers and mixed render sets', () => {
  const first = validRow({ __line: 3 });
  const second = validRow({ render_set_sha256: '1'.repeat(64), __line: 9 });
  const errors = validateRows([first, second], validOptions);
  assert.ok(errors.some(error => error.line === 9 && error.message.includes('duplicate')));
  assert.ok(errors.some(error => error.line === 9 && error.message.includes('render_set_sha256')));
});

test('validateRows rejects every question shape rule including more than three sub-questions', () => {
  const badQuestions = [
    {},
    { bad_key: baseQuestion },
    { sub_0: { ...baseQuestion, type: 'text' } },
    { sub_0: { ...baseQuestion, instructions: '  ' } },
    { sub_0: { ...baseQuestion, criteria: { true: 'yes', false: '' } } },
    { sub_0: { ...baseQuestion, criteria: { true: '', false: 'no' } } },
    { sub_0: { ...baseQuestion, polarity: 'yes_is_defect' } },
    { sub_0: baseQuestion, sub_1: baseQuestion, sub_2: baseQuestion, sub_3: baseQuestion }
  ];
  for (const questions of badQuestions) {
    assert.ok(messages(validRow({ questions })).length > 0, JSON.stringify(questions));
  }
});

test('validateRows rejects backticked tokens that are not notes or state keys', () => {
  const row = validRow({
    context: 'Inspect `camera` and `notes`.',
    questions: {
      sub_0: { ...baseQuestion, instructions: 'Look at `closeup_7`.' }
    }
  });
  assert.ok(messages(row).some(message => message.includes('backticked')));
});

test('validateRows requires a non-empty row array of valid objects', () => {
  const errors = validateRows([null, 'not-a-row'], validOptions);
  assert.equal(errors.length, 2);
  assert.ok(errors.every(error => Number.isInteger(error.line) && typeof error.message === 'string'));
});
