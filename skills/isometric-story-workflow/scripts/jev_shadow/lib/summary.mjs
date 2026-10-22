import { readFile } from 'node:fs/promises';

const reviewTypes = ['8A', '8B', '8C'];
const opusOutcomes = ['defect', 'pass', 'not_judged'];
const opusBases = ['majority_confirmed', 'majority_not_confirmed', 'measured_true', 'measured_false', 'not_reviewed'];
const jevVerdicts = ['pass', 'defect', 'uncertain', 'invalid'];

// Null outcome/basis is the compare template's unadjudicated state; empty rates are null.
export const validateLedgerLine = value => {
  const errors = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['ledger line must be a JSON object.'];
  }
  if (value.schema_version !== 1) errors.push('schema_version must be 1.');
  if (!reviewTypes.includes(value.review_type)) errors.push('review_type must be 8A, 8B, or 8C.');
  if (value.opus_outcome !== null && !opusOutcomes.includes(value.opus_outcome)) {
    errors.push('opus_outcome must be defect, pass, not_judged, or null.');
  }
  if (!opusBases.includes(value.opus_basis)
    && !(value.opus_outcome === null && value.opus_basis === null)) {
    errors.push('opus_basis must be one of the specified ledger values.');
  }
  if (!jevVerdicts.includes(value.jev_row_verdict)) errors.push('jev_row_verdict must be pass, defect, uncertain, or invalid.');
  if (typeof value.row_id !== 'string' || value.row_id.trim().length === 0) errors.push('row_id must be a non-empty string.');
  return errors;
};

const parseJsonlFile = async file => {
  const content = await readFile(file, 'utf8');
  return content.split(/\r?\n/u).flatMap((line, index) => {
    if (line.trim().length === 0) return [];
    try {
      return [{ file, line: index + 1, value: JSON.parse(line) }];
    } catch (error) {
      return [{ file, line: index + 1, value: null, parseError: error instanceof Error ? error.message : String(error) }];
    }
  });
};

export const summarizeShadow = ({ ledgerRows = [], resultsByFile = [] } = {}) => {
  const totalsFor = () => ({
    rows: 0,
    adjudicated: 0,
    actual_defects: 0,
    misses: 0,
    caught: 0,
    false_defects: 0,
    jev_pass_on_pass: 0,
    uncertain: 0,
    invalid: 0,
    decided_rate: null,
    tokens: { input: 0, output: 0 }
  });
  const byReviewType = Object.fromEntries(reviewTypes.map(reviewType => [reviewType, totalsFor()]));
  const overall = totalsFor();
  const errors = [];
  const decidedByType = Object.fromEntries(reviewTypes.map(reviewType => [reviewType, 0]));
  let overallDecided = 0;

  for (const entry of ledgerRows) {
    if (entry.parseError) {
      errors.push(`${entry.file}:${entry.line}: invalid JSON: ${entry.parseError}`);
      continue;
    }
    const messages = validateLedgerLine(entry.value);
    if (messages.length > 0) {
      errors.push(...messages.map(message => `${entry.file}:${entry.line}: ${message}`));
      continue;
    }

    const row = entry.value;
    const typeTotals = byReviewType[row.review_type];
    overall.rows += 1;
    typeTotals.rows += 1;
    if (row.opus_outcome !== 'pass' && row.opus_outcome !== 'defect') continue;

    overall.adjudicated += 1;
    typeTotals.adjudicated += 1;
    if (row.jev_row_verdict === 'pass' || row.jev_row_verdict === 'defect') {
      overallDecided += 1;
      decidedByType[row.review_type] += 1;
    }
    if (row.opus_outcome === 'defect') {
      overall.actual_defects += 1;
      typeTotals.actual_defects += 1;
    }
    if (row.opus_outcome === 'defect' && row.jev_row_verdict === 'pass') {
      overall.misses += 1;
      typeTotals.misses += 1;
    }
    if (row.opus_outcome === 'defect' && row.jev_row_verdict === 'defect') {
      overall.caught += 1;
      typeTotals.caught += 1;
    }
    if (row.opus_outcome === 'pass' && row.jev_row_verdict === 'defect') {
      overall.false_defects += 1;
      typeTotals.false_defects += 1;
    }
    if (row.opus_outcome === 'pass' && row.jev_row_verdict === 'pass') {
      overall.jev_pass_on_pass += 1;
      typeTotals.jev_pass_on_pass += 1;
    }
    if (row.jev_row_verdict === 'uncertain') {
      overall.uncertain += 1;
      typeTotals.uncertain += 1;
    }
    if (row.jev_row_verdict === 'invalid') {
      overall.invalid += 1;
      typeTotals.invalid += 1;
    }
  }

  for (const { records = [] } of resultsByFile) {
    const unique = new Map();
    let anonymous = 0;
    for (const record of records) {
      const key = typeof record?.id === 'string' && record.id.length > 0 ? record.id : Symbol(`anonymous-${anonymous++}`);
      unique.delete(key);
      unique.set(key, record);
    }
    for (const record of unique.values()) {
      const usage = record?.usage;
      const input = usage?.input_tokens ?? usage?.inputTokens;
      const output = usage?.output_tokens ?? usage?.outputTokens;
      const inputTokens = typeof input === 'number' && Number.isFinite(input) ? input : 0;
      const outputTokens = typeof output === 'number' && Number.isFinite(output) ? output : 0;
      overall.tokens.input += inputTokens;
      overall.tokens.output += outputTokens;
      if (byReviewType[record?.review_type]) {
        byReviewType[record.review_type].tokens.input += inputTokens;
        byReviewType[record.review_type].tokens.output += outputTokens;
      }
    }
  }

  overall.decided_rate = overall.adjudicated === 0 ? null : overallDecided / overall.adjudicated;
  for (const reviewType of reviewTypes) {
    const totals = byReviewType[reviewType];
    totals.decided_rate = totals.adjudicated === 0 ? null : decidedByType[reviewType] / totals.adjudicated;
  }

  return {
    by_review_type: byReviewType,
    overall,
    note: 'Miss rates are reference-only until actual_defects >= 30.',
    errors
  };
};

export const summarizeFiles = async ({ ledgerFiles = [], resultFiles = [] } = {}) => {
  const ledgerRows = (await Promise.all(ledgerFiles.map(parseJsonlFile))).flat();
  const resultsByFile = await Promise.all(resultFiles.map(async file => {
    const entries = await parseJsonlFile(file);
    return { file, records: entries.filter(entry => !entry.parseError).map(entry => entry.value) };
  }));
  return summarizeShadow({ ledgerRows, resultsByFile });
};
