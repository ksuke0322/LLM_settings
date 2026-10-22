import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeShadow, validateLedgerLine } from './summary.mjs';

const ledger = overrides => ({
  schema_version: 1,
  attempt: 1,
  row_id: 'row-1',
  review_type: '8A',
  render_set_sha256: 'a'.repeat(64),
  jev_row_verdict: 'pass',
  opus_outcome: 'pass',
  opus_basis: 'majority_not_confirmed',
  parent_note: null,
  ...overrides
});

test('summarizeShadow computes per-type and overall metrics and unique result tokens', () => {
  const rows = [
    { file: 'a.jsonl', line: 1, value: ledger({ row_id: 'pass-pass', jev_row_verdict: 'pass', opus_outcome: 'pass' }) },
    { file: 'a.jsonl', line: 2, value: ledger({ row_id: 'miss', jev_row_verdict: 'pass', opus_outcome: 'defect', opus_basis: 'majority_confirmed' }) },
    { file: 'a.jsonl', line: 3, value: ledger({ row_id: 'caught', jev_row_verdict: 'defect', opus_outcome: 'defect', opus_basis: 'majority_confirmed' }) },
    { file: 'a.jsonl', line: 4, value: ledger({ row_id: 'false', jev_row_verdict: 'defect', opus_outcome: 'pass' }) },
    { file: 'a.jsonl', line: 5, value: ledger({ row_id: 'uncertain', jev_row_verdict: 'uncertain', opus_outcome: 'pass' }) },
    { file: 'a.jsonl', line: 6, value: ledger({ row_id: 'pending', opus_outcome: null, opus_basis: null }) },
    { file: 'b.jsonl', line: 1, value: ledger({ row_id: 'invalid', review_type: '8B', jev_row_verdict: 'invalid', opus_outcome: 'defect', opus_basis: 'majority_confirmed' }) }
  ];
  const resultsByFile = [
    { file: 'run.jsonl', records: [
      { id: 'x', review_type: '8A', usage: { input_tokens: 10, output_tokens: 2 } },
      { id: 'x', review_type: '8A', usage: { input_tokens: 4, output_tokens: 1 } },
      { id: 'y', review_type: '8B', usage: { inputTokens: 3, outputTokens: 5 } }
    ] }
  ];

  const summary = summarizeShadow({ ledgerRows: rows, resultsByFile });
  assert.equal(summary.overall.rows, 7);
  assert.equal(summary.overall.adjudicated, 6);
  assert.equal(summary.overall.actual_defects, 3);
  assert.equal(summary.overall.misses, 1);
  assert.equal(summary.overall.caught, 1);
  assert.equal(summary.overall.false_defects, 1);
  assert.equal(summary.overall.jev_pass_on_pass, 1);
  assert.equal(summary.overall.uncertain, 1);
  assert.equal(summary.overall.invalid, 1);
  assert.equal(summary.overall.decided_rate, 4 / 6);
  assert.deepEqual(summary.overall.tokens, { input: 7, output: 6 });
  assert.match(summary.note, /actual_defects >= 30/u);
});

test('validateLedgerLine rejects invalid enum values and requires a row id', () => {
  assert.deepEqual(validateLedgerLine(ledger()), []);
  for (const record of [
    ledger({ schema_version: 2 }),
    ledger({ opus_outcome: 'maybe' }),
    ledger({ opus_basis: 'unknown' }),
    ledger({ jev_row_verdict: 'maybe' }),
    ledger({ row_id: ' ' })
  ]) assert.ok(validateLedgerLine(record).length > 0);
});

test('summarizeShadow reports malformed lines with file and line and skips them', () => {
  const summary = summarizeShadow({
    ledgerRows: [
      { file: 'cool1.jsonl', line: 2, value: '{bad json', parseError: 'Unexpected token' },
      { file: 'cool1.jsonl', line: 4, value: ledger({ schema_version: 9 }) },
      { file: 'cool1.jsonl', line: 5, value: ledger({ row_id: 'ok' }) }
    ],
    resultsByFile: []
  });
  assert.equal(summary.overall.rows, 1);
  assert.equal(summary.errors.length, 2);
  assert.match(summary.errors[0], /cool1\.jsonl:2/u);
  assert.match(summary.errors[1], /cool1\.jsonl:4/u);
});
