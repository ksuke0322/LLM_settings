const supportedReviewTypes = ['8A', '8B', '8C'];

// Kind matching is exact across the supplied Jev rows; reports never produce an Opus outcome.
export const compareResults = ({ results = [], reports = [], attempt } = {}) => {
  const jevKinds = new Set(results.map(result => result?.item?.kind).filter(kind => typeof kind === 'string'));
  const opusFindings = [];

  for (const { file, report } of reports) {
    if (!supportedReviewTypes.includes(report?.review_type)) continue;
    const reviewType = report.review_type;
    const entries = reviewType === '8C'
      ? (Array.isArray(report.kinds) ? report.kinds : []).map(kind => ({ kind: kind.kind, details: [
        `signature_realization=${kind.signature_realization ?? ''}`,
        `class_readable=${kind.class_readable ?? ''}`,
        `existence_reason_readable=${kind.existence_reason_readable ?? ''}`
      ].join('; ') }))
      : (Array.isArray(report.findings) ? report.findings : []).map(finding => ({
        kind: finding.kind,
        details: reviewType === '8A'
          ? `${finding.classification ?? ''}; criterion=${finding.criterion ?? ''}; location=${finding.location ?? ''}`
          : `${finding.severity ?? ''}; criterion=${finding.criterion ?? ''}; location=${finding.location ?? ''}`
      }));

    for (const entry of entries) {
      if (typeof entry.kind !== 'string' || entry.kind.length === 0) continue;
      opusFindings.push({
        reviewType,
        kind: entry.kind,
        details: entry.details,
        file,
        matched: jevKinds.has(entry.kind)
      });
    }
  }

  const ledgerRows = Number.isSafeInteger(attempt) && attempt > 0
    ? results.map(result => ({
      schema_version: 1,
      attempt,
      row_id: result.id,
      review_type: result.review_type,
      render_set_sha256: result.render_set_sha256,
      jev_row_verdict: result.row_verdict,
      opus_outcome: null,
      opus_basis: null,
      parent_note: null
    }))
    : [];

  return { results, opusFindings, ledgerRows };
};

const escapeCell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');

export const renderComparison = ({ results = [], opusFindings = [] } = {}) => {
  const lines = [
    '| id | review_type | kind / criterion | row_verdict | row_p_min |',
    '| --- | --- | --- | --- | ---: |'
  ];

  for (const result of results) {
    lines.push(`| ${escapeCell(result.id)} | ${escapeCell(result.review_type)} | ${escapeCell(`${result.item?.kind ?? ''} / ${result.item?.criterion ?? ''}`)} | ${escapeCell(result.row_verdict)} | ${escapeCell(result.row_p_min)} |`);
  }

  lines.push('', '## Opus findings by review_type and kind', '');
  if (opusFindings.length === 0) lines.push('No Opus findings were supplied.', '');
  for (const finding of opusFindings) {
    lines.push(`- **${escapeCell(finding.reviewType)} / ${escapeCell(finding.kind)}** — ${escapeCell(finding.details)} — ${escapeCell(finding.file)}`);
  }

  const unmatched = opusFindings.filter(finding => !finding.matched);
  lines.push('', '## Unmatched Opus kinds', '');
  if (unmatched.length === 0) lines.push('None.', '');
  for (const finding of unmatched) {
    lines.push(`- ${escapeCell(finding.reviewType)} / ${escapeCell(finding.kind)} — ${escapeCell(finding.file)}`);
  }

  return lines.join('\n');
};
