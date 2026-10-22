import assert from 'node:assert/strict';
import test from 'node:test';

import { compareResults, renderComparison } from './compare.mjs';

const results = [{
  id: 'row-1', review_type: '8A', item: { kind: 'hive', criterion: 'entrance slit' },
  render_set_sha256: 'a'.repeat(64), row_verdict: 'pass', row_p_min: 0.91
}];

test('compare table lists Jev rows, report findings, and unmatched Opus kinds', () => {
  const reports = [{
    file: '/reports/opus-8a.json',
    report: {
      review_type: '8A',
      findings: [
        { kind: 'hive', classification: 'required_match', criterion: 'entrance slit', location: 'front' },
        { kind: 'roof', classification: 'improvable', criterion: 'tile', location: 'top' }
      ]
    }
  }];
  const output = renderComparison(compareResults({ results, reports }));
  assert.match(output, /row-1 \| 8A \| hive \/ entrance slit \| pass \| 0\.91/u);
  assert.match(output, /required_match/u);
  assert.match(output, /roof/u);
  assert.match(output, /Unmatched Opus kinds/u);
  assert.match(output, /opus-8a\.json/u);
});

test('ledger template carries one unadjudicated schema v1 line per Jev result', () => {
  const { ledgerRows } = compareResults({ results, reports: [], attempt: 2 });
  assert.deepEqual(ledgerRows, [{
    schema_version: 1,
    attempt: 2,
    row_id: 'row-1',
    review_type: '8A',
    render_set_sha256: 'a'.repeat(64),
    jev_row_verdict: 'pass',
    opus_outcome: null,
    opus_basis: null,
    parent_note: null
  }]);
});
