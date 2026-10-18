import { statSync as defaultStatSync } from 'node:fs';
import { readFile as defaultReadFile } from 'node:fs/promises';

const imageOptions = () => ({ headers: { 'TypeSafe-Danger-Zone-Images': 'true' } });

const imageQuestions = [
  {
    pair: 'A',
    yesJa: '`photo` に木製の巣箱が写っていますか。',
    noJa: '`photo` に自動車が写っていますか。',
    yesEn: 'Is there a wooden beehive in `photo`?',
    noEn: 'Is there a car in `photo`?'
  },
  {
    pair: 'B',
    yesJa: '`photo` に木製の荷車が写っていますか。',
    noJa: '`photo` に巣箱が写っていますか。',
    yesEn: 'Is there a wooden cart in `photo`?',
    noEn: 'Is there a beehive in `photo`?'
  }
];

const answerCase = async ({ id, check, imagePath, instructions, expect, image, noul }) => ({
  id,
  check,
  request: {
    state: { photo: await image(imagePath) },
    questions: { answer: noul(instructions) }
  },
  options: imageOptions(),
  expect
});

const errorText = error => error instanceof Error ? error.message : String(error);

const resultError = result => result?.error === undefined || result?.error === null
  ? null
  : errorText(result.error);

const probability = result => {
  if (!result || resultError(result)) return undefined;
  const value = result.response?.answers?.[result.expect?.answerId ?? 'answer']?.noul;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const getResult = (results, check, predicate) => results.find(result =>
  result?.check === check && predicate(result.expect ?? {})
);

const describeProbability = (result, value) => {
  const error = resultError(result);
  if (error) return `error: ${error}`;
  return value === undefined ? 'missing response probability' : value.toFixed(3);
};

export const buildCases = async ({
  questionsPath,
  imagePaths,
  image,
  noul,
  readFile = defaultReadFile,
  statSync = defaultStatSync
}) => {
  if (typeof image !== 'function' || typeof noul !== 'function') {
    throw new TypeError('buildCases requires image() and noul() factories');
  }

  const questionsText = await readFile(questionsPath, 'utf8');
  const rows = questionsText
    .split(/\r?\n/u)
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line));

  const sizeRow = rows.reduce((largest, row) => {
    const bytes = Object.values(row.state).reduce((total, imagePath) => total + statSync(imagePath).size, 0);
    return !largest || bytes > largest.bytes ? { row, bytes } : largest;
  }, null)?.row;

  if (!sizeRow) throw new Error('questions.jsonl has no rows');

  const cases = [];

  for (const question of imageQuestions) {
    const imagePath = imagePaths[question.pair];

    for (const [polarity, instructions] of [['yes', question.yesJa], ['no', question.noJa]]) {
      cases.push(await answerCase({
        id: `content-${question.pair}-${polarity}`,
        check: 'content',
        imagePath,
        instructions,
        image,
        noul,
        expect: { pair: question.pair, polarity, answerId: 'answer' }
      }));
    }
  }

  for (const question of imageQuestions) {
    cases.push({
      id: `no-image-${question.pair}-yes`,
      check: 'no-image',
      request: {
        state: { photo: '(no image provided)' },
        questions: { answer: noul(question.yesJa) }
      },
      options: {},
      expect: { pair: question.pair, polarity: 'yes', answerId: 'answer' }
    });
  }

  for (const question of imageQuestions) {
    const imagePath = imagePaths[question.pair];

    for (const [polarity, instructions] of [['yes', question.yesEn], ['no', question.noEn]]) {
      cases.push(await answerCase({
        id: `language-${question.pair}-${polarity}`,
        check: 'language',
        imagePath,
        instructions,
        image,
        noul,
        expect: { pair: question.pair, polarity, answerId: 'answer' }
      }));
    }
  }

  const sizeState = Object.fromEntries(await Promise.all(
    Object.entries(sizeRow.state).map(async ([key, imagePath]) => [key, await image(imagePath)])
  ));
  cases.push({
    id: `size-${sizeRow.id}`,
    check: 'size',
    request: {
      state: sizeState,
      questions: {
        specific: noul(`${sizeRow.context} ${sizeRow.questions.specific.instructions}`),
        generic: noul(`${sizeRow.context} ${sizeRow.questions.generic.instructions}`)
      }
    },
    options: imageOptions(),
    expect: { answerIds: ['specific', 'generic'] }
  });

  const firstContentCase = cases.find(item => item.check === 'content');
  for (const repeat of [1, 2, 3]) {
    cases.push({
      ...firstContentCase,
      id: `repeat-${repeat}`,
      check: 'repeat',
      expect: { ...firstContentCase.expect }
    });
  }

  return cases;
};

export const evaluate = inputResults => {
  const results = Array.isArray(inputResults) ? inputResults : [];
  const checks = [];

  for (const pair of ['A', 'B']) {
    const yesResult = getResult(results, 'content', expect => expect.pair === pair && expect.polarity === 'yes');
    const noResult = getResult(results, 'content', expect => expect.pair === pair && expect.polarity === 'no');
    const yes = probability(yesResult);
    const no = probability(noResult);
    const pass = yes !== undefined && no !== undefined && yes >= 0.9 && no <= 0.1;
    checks.push({
      name: `content ${pair}`,
      pass,
      detail: `yes=${describeProbability(yesResult, yes)} (>= 0.900), no=${describeProbability(noResult, no)} (<= 0.100)`
    });
  }

  for (const pair of ['A', 'B']) {
    const imageYes = getResult(results, 'content', expect => expect.pair === pair && expect.polarity === 'yes');
    const noImageYes = getResult(results, 'no-image', expect => expect.pair === pair && expect.polarity === 'yes');
    const imageProbability = probability(imageYes);
    const noImageProbability = probability(noImageYes);
    const difference = imageProbability === undefined || noImageProbability === undefined
      ? undefined
      : Math.abs(imageProbability - noImageProbability);
    const pass = difference !== undefined && difference >= 0.3;
    checks.push({
      name: `image/no-image ${pair}`,
      pass,
      detail: `image=${describeProbability(imageYes, imageProbability)}, no-image=${describeProbability(noImageYes, noImageProbability)}, difference=${difference?.toFixed(3) ?? 'unavailable'} (>= 0.300)`
    });
  }

  for (const pair of ['A', 'B']) {
    const differences = [];

    for (const polarity of ['yes', 'no']) {
      const ja = getResult(results, 'content', expect => expect.pair === pair && expect.polarity === polarity);
      const en = getResult(results, 'language', expect => expect.pair === pair && expect.polarity === polarity);
      const jaProbability = probability(ja);
      const enProbability = probability(en);
      if (jaProbability === undefined || enProbability === undefined) {
        differences.push(`${polarity}: missing/error`);
      } else {
        const jaYes = jaProbability >= 0.5;
        const enYes = enProbability >= 0.5;
        differences.push(`${polarity}: JA=${jaYes ? 'yes' : 'no'}, EN=${enYes ? 'yes' : 'no'}`);
      }
    }

    const pairChecks = ['yes', 'no'].every(polarity => {
      const ja = getResult(results, 'content', expect => expect.pair === pair && expect.polarity === polarity);
      const en = getResult(results, 'language', expect => expect.pair === pair && expect.polarity === polarity);
      const jaProbability = probability(ja);
      const enProbability = probability(en);
      return jaProbability !== undefined && enProbability !== undefined
        && (jaProbability >= 0.5) === (enProbability >= 0.5);
    });

    checks.push({ name: `language ${pair}`, pass: pairChecks, detail: differences.join('; ') });
  }

  const sizeResult = results.find(result => result?.check === 'size');
  const sizeError = resultError(sizeResult);
  const sizePass = Boolean(sizeResult?.response) && sizeError === null;
  checks.push({
    name: 'size',
    pass: sizePass,
    detail: sizeError ? `error: ${sizeError}` : sizePass ? 'size request returned without error' : 'size response missing'
  });

  const repeatResults = results
    .filter(result => result?.check === 'repeat')
    .sort((left, right) => left.id.localeCompare(right.id));
  const repeatValues = repeatResults.map(probability);
  const repeatError = repeatResults.map(resultError).find(Boolean);
  const spread = repeatValues.length === 3 && repeatValues.every(value => value !== undefined)
    ? Math.max(...repeatValues) - Math.min(...repeatValues)
    : undefined;
  const repeatPass = repeatResults.length === 3 && !repeatError && spread !== undefined && spread <= 0.1;
  checks.push({
    name: 'repeat',
    pass: repeatPass,
    detail: repeatError
      ? `error: ${repeatError}`
      : `probabilities=${repeatValues.map(value => value?.toFixed(3) ?? 'missing').join(', ')}, spread=${spread?.toFixed(3) ?? 'unavailable'} (<= 0.100)`
  });

  const usage = results.reduce((total, result) => {
    total.inputTokens += Number(result?.response?.usage?.input_tokens) || 0;
    total.outputTokens += Number(result?.response?.usage?.output_tokens) || 0;
    return total;
  }, { inputTokens: 0, outputTokens: 0, calls: results.length });

  return { checks, usage, pass: checks.every(({ pass }) => pass) };
};
