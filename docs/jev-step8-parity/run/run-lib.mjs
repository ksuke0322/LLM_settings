import { classify, toVerdict } from '../lib/classify.mjs';

const verdictKeys = ['pass', 'defect', 'uncertain', 'invalid'];

export const buildRequest = async (row, { image, noul, prepare, model }) => {
  const state = {};
  const images = [];

  for (const [key, sourcePath] of Object.entries(row.state)) {
    const prepared = await prepare(sourcePath);
    state[key] = await image(prepared.path);
    images.push({
      key,
      sourcePath: prepared.sourcePath ?? sourcePath,
      sentPath: prepared.path,
      width: prepared.width,
      height: prepared.height,
      resized: prepared.resized
    });
  }

  if (row.notes !== null && typeof row.notes === 'object' && !Array.isArray(row.notes)) {
    for (const [key, value] of Object.entries(row.notes)) {
      if (typeof value === 'string') state[key] = value;
    }
  }

  const questionKeys = Object.keys(row.questions);
  const request = {
    ...(typeof model === 'string' && model.length > 0 ? { model } : {}),
    state,
    questions: Object.fromEntries(questionKeys.map(questionKey => [
      questionKey,
      row.questions[questionKey].criteria !== null
        && typeof row.questions[questionKey].criteria === 'object'
        && !Array.isArray(row.questions[questionKey].criteria)
        ? noul(`${row.context} ${row.questions[questionKey].instructions}`, row.questions[questionKey].criteria)
        : noul(`${row.context} ${row.questions[questionKey].instructions}`)
    ]))
  };

  return {
    id: row.id,
    request,
    options: { headers: { 'TypeSafe-Danger-Zone-Images': 'true' } },
    images
  };
};

const errorMessage = error => error instanceof Error ? error.message : String(error);

const answerRecord = (row, response, error, questionKey) => {
  const { polarity } = row.questions[questionKey];
  const value = response?.answers?.[questionKey]?.noul;
  const p = value ?? null;
  let classification = 'invalid';
  let verdict = 'invalid';

  if (error === null && p !== null) {
    classification = classify(p);
    if (classification !== 'invalid') {
      try {
        verdict = toVerdict(p, polarity);
      } catch {
        classification = 'invalid';
        verdict = 'invalid';
      }
    }
  }

  return { p, polarity, classification, verdict };
};

export const toRecord = (row, built, response, error, requestedModel = built?.request?.model) => {
  const normalizedError = error === null || error === undefined ? null : errorMessage(error);
  const normalizedRequestedModel = typeof requestedModel === 'string' && requestedModel.length > 0
    ? requestedModel
    : null;
  const questionKeys = Object.keys(row.questions);
  const record = {
    id: row.id,
    review_type: row.review_type,
    category: row.category,
    images: built?.images ?? [],
    model: response?.model ?? null,
    requested_model: normalizedRequestedModel,
    usage: response?.usage ?? null,
    error: normalizedError,
    answers: Object.fromEntries(questionKeys.map(questionKey => [
      questionKey,
      answerRecord(row, response, normalizedError, questionKey)
    ]))
  };

  if (row.aggregation === 'all_pass') {
    const answers = Object.values(record.answers);
    const verdicts = answers.map(answer => answer.verdict);
    const probabilities = answers.map(answer => answer.p);
    record.row_verdict = verdicts.includes('invalid')
      ? 'invalid'
      : verdicts.includes('defect')
        ? 'defect'
        : verdicts.includes('uncertain')
          ? 'uncertain'
          : 'pass';
    record.row_p_min = probabilities.length > 0 && probabilities.every(p => typeof p === 'number')
      ? Math.min(...probabilities)
      : null;
  }

  return record;
};

const emptyVerdicts = () => Object.fromEntries(verdictKeys.map(verdict => [verdict, 0]));

const tokenCount = (usage, snakeCaseKey, camelCaseKey) => {
  const value = usage?.[snakeCaseKey] ?? usage?.[camelCaseKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

export const summarize = records => {
  const rows = Array.isArray(records) ? records : [];
  const questionKeys = [...new Set(rows.flatMap(record => Object.keys(record?.answers ?? {})))];
  const byVerdict = Object.fromEntries(questionKeys.map(questionKey => [questionKey, emptyVerdicts()]));
  const hasRowVerdicts = rows.some(record => record?.row_verdict !== undefined);
  const byRowVerdict = emptyVerdicts();
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (const record of rows) {
    for (const questionKey of Object.keys(record?.answers ?? {})) {
      const verdict = record?.answers?.[questionKey]?.verdict;
      if (verdictKeys.includes(verdict)) byVerdict[questionKey][verdict] += 1;
    }

    usage.inputTokens += tokenCount(record?.usage, 'input_tokens', 'inputTokens');
    usage.outputTokens += tokenCount(record?.usage, 'output_tokens', 'outputTokens');
  }

  if (hasRowVerdicts) {
    for (const record of rows) {
      if (verdictKeys.includes(record?.row_verdict)) byRowVerdict[record.row_verdict] += 1;
    }
  }

  return {
    rows: rows.length,
    errors: rows.filter(record => record?.error !== null && record?.error !== undefined).length,
    byVerdict,
    ...(hasRowVerdicts ? { byRowVerdict } : {}),
    usage
  };
};
