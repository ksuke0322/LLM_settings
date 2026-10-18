import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCases, evaluate } from './smoke-lib.mjs';

const fixtureRow = {
  id: 'largest-row',
  context: '確認用の文脈。',
  state: {
    scene: '/fixture/scene.png',
    closeup_0: '/fixture/detail.png'
  },
  questions: {
    specific: { type: 'noul', instructions: '具体質問です。', polarity: 'yes_is_pass' },
    generic: { type: 'noul', instructions: '一般質問です。', polarity: 'yes_is_defect' }
  }
};

const smallerRow = {
  ...fixtureRow,
  id: 'smaller-row',
  state: { scene: '/fixture/small.png' },
  context: '小さい行の文脈。'
};

const dependencies = {
  image: imagePath => ({ type: 'image', imagePath }),
  noul: instructions => ({ type: 'noul', instructions }),
  readFile: async () => `${JSON.stringify(smallerRow)}\n${JSON.stringify(fixtureRow)}\n`,
  statSync: imagePath => ({ size: imagePath.endsWith('detail.png') ? 200 : imagePath.endsWith('small.png') ? 10 : 100 })
};

const imagePaths = {
  A: '/fixture/beehive.png',
  B: '/fixture/cart.png'
};

const makeCases = () => buildCases({
  questionsPath: '/fixture/questions.jsonl',
  imagePaths,
  ...dependencies
});

const makeIdealResults = cases => cases.map(item => {
  const { check, expect, id } = item;
  let answers;

  if (check === 'size') {
    answers = {
      specific: { noul: 0.5 },
      generic: { noul: 0.5 }
    };
  } else {
    const noul = check === 'no-image'
      ? 0.6
      : check === 'repeat'
        ? ({ 'repeat-1': 0.4, 'repeat-2': 0.5, 'repeat-3': 0.45 }[id])
        : expect.polarity === 'yes'
          ? 0.9
          : 0.1;
    answers = { [expect.answerId]: { noul } };
  }

  return {
    id,
    check,
    expect,
    response: {
      answers,
      model: 'fake-model',
      usage: { input_tokens: 10, output_tokens: 2 }
    },
    error: null
  };
});

test('buildCases creates the five groups with expected counts, requests, and image headers', async () => {
  const cases = await makeCases();
  const grouped = Object.groupBy(cases, item => item.check);

  assert.deepEqual(Object.fromEntries(Object.entries(grouped).map(([key, items]) => [key, items.length])), {
    content: 4,
    'no-image': 2,
    language: 4,
    size: 1,
    repeat: 3
  });

  for (const item of cases.filter(({ check }) => check !== 'no-image')) {
    assert.deepEqual(item.options, { headers: { 'TypeSafe-Danger-Zone-Images': 'true' } });
  }

  for (const item of grouped['no-image']) {
    assert.deepEqual(item.options, {});
    assert.deepEqual(item.request.state, { photo: '(no image provided)' });
  }

  assert.equal(grouped.content.find(({ id }) => id === 'content-A-yes').request.questions.answer.instructions,
    '`photo` に木製の巣箱が写っていますか。');
  assert.equal(grouped.content.find(({ id }) => id === 'content-A-no').request.questions.answer.instructions,
    '`photo` に自動車が写っていますか。');
  assert.equal(grouped.content.find(({ id }) => id === 'content-B-yes').request.questions.answer.instructions,
    '`photo` に木製の荷車が写っていますか。');
  assert.equal(grouped.content.find(({ id }) => id === 'content-B-no').request.questions.answer.instructions,
    '`photo` に巣箱が写っていますか。');
  assert.deepEqual(grouped.content[0].request.state, {
    photo: { type: 'image', imagePath: imagePaths.A }
  });
  assert.equal(grouped.language.find(({ id }) => id === 'language-A-yes').request.questions.answer.instructions,
    'Is there a wooden beehive in `photo`?');
  assert.equal(grouped.language.find(({ id }) => id === 'language-A-no').request.questions.answer.instructions,
    'Is there a car in `photo`?');
  assert.equal(grouped.language.find(({ id }) => id === 'language-B-yes').request.questions.answer.instructions,
    'Is there a wooden cart in `photo`?');
  assert.equal(grouped.language.find(({ id }) => id === 'language-B-no').request.questions.answer.instructions,
    'Is there a beehive in `photo`?');
  assert.equal(grouped.size[0].id, `size-${fixtureRow.id}`);
  assert.equal(grouped.size[0].request.questions.specific.instructions,
    `${fixtureRow.context} ${fixtureRow.questions.specific.instructions}`);
  assert.equal(grouped.size[0].request.questions.generic.instructions,
    `${fixtureRow.context} ${fixtureRow.questions.generic.instructions}`);
  assert.deepEqual(grouped.size[0].request.state, {
    scene: { type: 'image', imagePath: fixtureRow.state.scene },
    closeup_0: { type: 'image', imagePath: fixtureRow.state.closeup_0 }
  });
  assert.deepEqual(grouped.repeat.map(({ id }) => id), ['repeat-1', 'repeat-2', 'repeat-3']);
  assert.deepEqual(grouped.repeat.map(({ request }) => request), grouped.repeat.map(() => grouped.content[0].request));
});

test('evaluate passes at the inclusive thresholds and sums usage', async () => {
  const results = makeIdealResults(await makeCases());
  const evaluation = evaluate(results);

  assert.equal(evaluation.pass, true);
  assert.deepEqual(evaluation.usage, { inputTokens: 140, outputTokens: 28, calls: 14 });
  assert.equal(evaluation.checks.every(({ pass }) => pass), true);
});

test('evaluate fails each named check independently when its threshold is breached', async () => {
  const baseline = makeIdealResults(await makeCases());
  const names = evaluate(baseline).checks.map(({ name }) => name);

  for (const name of names) {
    const results = structuredClone(baseline);
    const pair = name.endsWith(' B') ? 'B' : 'A';

    if (name.startsWith('content ')) {
      const item = results.find(result => result.id === `content-${pair}-no`);
      item.response.answers.answer.noul = 0.11;
    } else if (name.startsWith('image/no-image ')) {
      const item = results.find(result => result.id === `no-image-${pair}-yes`);
      item.response.answers.answer.noul = 0.9;
    } else if (name.startsWith('language ')) {
      const item = results.find(result => result.id === `language-${pair}-yes`);
      item.response.answers.answer.noul = 0.1;
    } else if (name === 'size') {
      results.find(result => result.check === 'size').error = 'request failed';
    } else if (name === 'repeat') {
      results.find(result => result.id === 'repeat-3').response.answers.answer.noul = 0.7;
    }

    const evaluation = evaluate(results);
    assert.equal(evaluation.checks.find(check => check.name === name).pass, false, name);
    assert.equal(evaluation.checks.filter(check => !check.pass).length, 1, name);
  }
});

test('evaluate captures case errors as failed checks without throwing', async () => {
  const results = makeIdealResults(await makeCases());
  results.find(result => result.check === 'size').error = 'payload too large';

  assert.doesNotThrow(() => evaluate(results));
  const evaluation = evaluate(results);
  assert.equal(evaluation.checks.find(({ name }) => name === 'size').pass, false);
  assert.match(evaluation.checks.find(({ name }) => name === 'size').detail, /payload too large/);
});
