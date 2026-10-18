import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRequest, summarize, toRecord } from './run-lib.mjs';

const sampleRow = (specificPolarity = 'yes_is_pass', genericPolarity = 'yes_is_defect') => ({
  id: 'row-1',
  review_type: '8B',
  category: 'layout_reason',
  state: {
    scene: '/source/scene.png',
    closeup_0: '/source/detail.png'
  },
  context: '共有の文脈',
  questions: {
    specific: { instructions: 'specific question', polarity: specificPolarity },
    generic: { instructions: 'generic question', polarity: genericPolarity }
  }
});

const builtFor = row => ({
  id: row.id,
  request: {
    state: { scene: { imageBytes: 'private-image-bytes' } },
    questions: {}
  },
  options: { headers: { 'TypeSafe-Danger-Zone-Images': 'true' } },
  images: [{
    key: 'scene',
    sourcePath: '/source/scene.png',
    sentPath: '/cache/scene.png',
    width: 882,
    height: 1568,
    resized: true
  }]
});

test('buildRequest prepares each state image and builds Jev questions with context', async () => {
  const row = sampleRow();
  const prepareCalls = [];
  const imageCalls = [];
  const noulCalls = [];
  const built = await buildRequest(row, {
    prepare: async sourcePath => {
      prepareCalls.push(sourcePath);
      return {
        path: `/cache/${sourcePath.split('/').at(-1)}`,
        width: 882,
        height: 1568,
        resized: true,
        sourcePath
      };
    },
    image: async imagePath => {
      imageCalls.push(imagePath);
      return { imagePath };
    },
    noul: instructions => {
      noulCalls.push(instructions);
      return { noul: instructions };
    }
  });

  assert.deepEqual(prepareCalls, ['/source/scene.png', '/source/detail.png']);
  assert.deepEqual(imageCalls, ['/cache/scene.png', '/cache/detail.png']);
  assert.deepEqual(noulCalls, [
    '共有の文脈 specific question',
    '共有の文脈 generic question'
  ]);
  assert.equal(built.id, row.id);
  assert.deepEqual(built.request, {
    state: {
      scene: { imagePath: '/cache/scene.png' },
      closeup_0: { imagePath: '/cache/detail.png' }
    },
    questions: {
      specific: { noul: '共有の文脈 specific question' },
      generic: { noul: '共有の文脈 generic question' }
    }
  });
  assert.deepEqual(built.options, {
    headers: { 'TypeSafe-Danger-Zone-Images': 'true' }
  });
  assert.deepEqual(built.images, [
    {
      key: 'scene',
      sourcePath: '/source/scene.png',
      sentPath: '/cache/scene.png',
      width: 882,
      height: 1568,
      resized: true
    },
    {
      key: 'closeup_0',
      sourcePath: '/source/detail.png',
      sentPath: '/cache/detail.png',
      width: 882,
      height: 1568,
      resized: true
    }
  ]);
});

test('buildRequest sets a non-empty requested model and omits it when not given', async () => {
  const row = sampleRow();
  const dependencies = {
    prepare: async sourcePath => ({ path: sourcePath }),
    image: async imagePath => ({ imagePath }),
    noul: instructions => ({ noul: instructions })
  };

  const pinned = await buildRequest(row, { ...dependencies, model: 'jev-1.14.0' });
  const unpinned = await buildRequest(row, dependencies);
  const emptyModel = await buildRequest(row, { ...dependencies, model: '' });

  assert.equal(pinned.request.model, 'jev-1.14.0');
  assert.equal(Object.hasOwn(unpinned.request, 'model'), false);
  assert.equal(Object.hasOwn(emptyModel.request, 'model'), false);
});

test('toRecord maps both polarities to pass and defect verdicts', () => {
  const cases = [
    { polarity: 'yes_is_pass', p: 0.95, classification: 'yes', verdict: 'pass' },
    { polarity: 'yes_is_pass', p: 0.05, classification: 'no', verdict: 'defect' },
    { polarity: 'yes_is_defect', p: 0.95, classification: 'yes', verdict: 'defect' },
    { polarity: 'yes_is_defect', p: 0.05, classification: 'no', verdict: 'pass' }
  ];

  for (const item of cases) {
    const row = sampleRow(item.polarity, item.polarity);
    const record = toRecord(row, builtFor(row), {
      answers: { specific: { noul: item.p }, generic: { noul: item.p } },
      model: 'jev-model',
      usage: { input_tokens: 12, output_tokens: 3 }
    }, null);

    for (const answer of Object.values(record.answers)) {
      assert.deepEqual(answer, {
        p: item.p,
        polarity: item.polarity,
        classification: item.classification,
        verdict: item.verdict
      });
    }
  }
});

test('toRecord marks uncertain, missing probabilities, and errored answers invalid', () => {
  const row = sampleRow();
  const uncertainRecord = toRecord(row, builtFor(row), {
    answers: { specific: { noul: 0.5 }, generic: { noul: 0.5 } }
  }, null);
  assert.deepEqual(uncertainRecord.answers, {
    specific: { p: 0.5, polarity: 'yes_is_pass', classification: 'uncertain', verdict: 'uncertain' },
    generic: { p: 0.5, polarity: 'yes_is_defect', classification: 'uncertain', verdict: 'uncertain' }
  });

  const missingRecord = toRecord(row, builtFor(row), { answers: {} }, null);
  assert.deepEqual(missingRecord.answers, {
    specific: { p: null, polarity: 'yes_is_pass', classification: 'invalid', verdict: 'invalid' },
    generic: { p: null, polarity: 'yes_is_defect', classification: 'invalid', verdict: 'invalid' }
  });

  const errorRecord = toRecord(row, builtFor(row), null, new Error('request failed'));
  assert.equal(errorRecord.error, 'request failed');
  assert.deepEqual(errorRecord.answers, {
    specific: { p: null, polarity: 'yes_is_pass', classification: 'invalid', verdict: 'invalid' },
    generic: { p: null, polarity: 'yes_is_defect', classification: 'invalid', verdict: 'invalid' }
  });
});

test('summarize counts rows, errors, verdicts, and token usage', () => {
  const records = [
    {
      error: null,
      usage: { input_tokens: 11, output_tokens: 2 },
      answers: { specific: { verdict: 'pass' }, generic: { verdict: 'defect' } }
    },
    {
      error: null,
      usage: { input_tokens: 7, output_tokens: 3 },
      answers: { specific: { verdict: 'defect' }, generic: { verdict: 'pass' } }
    },
    {
      error: null,
      usage: null,
      answers: { specific: { verdict: 'uncertain' }, generic: { verdict: 'uncertain' } }
    },
    {
      error: 'request failed',
      usage: null,
      answers: { specific: { verdict: 'invalid' }, generic: { verdict: 'invalid' } }
    }
  ];

  assert.deepEqual(summarize(records), {
    rows: 4,
    errors: 1,
    byVerdict: {
      specific: { pass: 1, defect: 1, uncertain: 1, invalid: 1 },
      generic: { pass: 1, defect: 1, uncertain: 1, invalid: 1 }
    },
    usage: { inputTokens: 18, outputTokens: 5 }
  });
});

test('toRecord contains metadata only and excludes request secrets and image bytes', () => {
  const row = sampleRow();
  const built = {
    ...builtFor(row),
    request: { state: { scene: { imageBytes: 'private-image-bytes' } } },
    options: { headers: { 'TypeSafe-Danger-Zone-Images': 'true' }, apiKey: 'secret-token' }
  };
  const record = toRecord(row, built, {
    answers: { specific: { noul: 0.9 }, generic: { noul: 0.1 } },
    model: 'jev-model',
    usage: { input_tokens: 12, output_tokens: 3 }
  }, null);
  const serialized = JSON.stringify(record);

  assert.deepEqual(Object.keys(record), [
    'id', 'review_type', 'category', 'images', 'model', 'requested_model', 'usage', 'error', 'answers'
  ]);
  assert.doesNotMatch(serialized, /secret-token|TypeSafe-Danger-Zone-Images|imageBytes|private-image-bytes/u);
});

test('toRecord records the requested model separately from the response model', () => {
  const row = sampleRow();
  const built = {
    ...builtFor(row),
    request: { ...builtFor(row).request, model: 'jev-1.14.0' }
  };
  const record = toRecord(row, built, { model: 'response-model' }, null);
  const unrequestedRecord = toRecord(row, builtFor(row), { model: 'response-model' }, null);

  assert.equal(record.model, 'response-model');
  assert.equal(record.requested_model, 'jev-1.14.0');
  assert.equal(unrequestedRecord.requested_model, null);
});

test('buildRequest adds string notes to state after images without image processing', async () => {
  const row = {
    ...sampleRow(),
    notes: { notes: '説明用テキスト', ignored: 123 }
  };
  const prepareCalls = [];
  const built = await buildRequest(row, {
    prepare: async sourcePath => {
      prepareCalls.push(sourcePath);
      return { path: `/cache/${sourcePath.split('/').at(-1)}`, sourcePath };
    },
    image: async imagePath => ({ imagePath }),
    noul: instructions => ({ noul: instructions })
  });

  assert.deepEqual(prepareCalls, ['/source/scene.png', '/source/detail.png']);
  assert.deepEqual(Object.keys(built.request.state), ['scene', 'closeup_0', 'notes']);
  assert.equal(built.request.state.notes, '説明用テキスト');
  assert.deepEqual(built.images.map(({ key }) => key), ['scene', 'closeup_0']);

  const primitiveNotes = await buildRequest({ ...sampleRow(), notes: 'not an object' }, {
    prepare: async sourcePath => ({ path: sourcePath }),
    image: async imagePath => ({ imagePath }),
    noul: instructions => ({ noul: instructions })
  });
  assert.deepEqual(Object.keys(primitiveNotes.request.state), ['scene', 'closeup_0']);
});

test('buildRequest and toRecord handle a row with only one question', async () => {
  const row = {
    ...sampleRow(),
    questions: {
      specific: { instructions: 'single question', polarity: 'yes_is_pass' }
    }
  };
  const built = await buildRequest(row, {
    prepare: async sourcePath => ({ path: sourcePath }),
    image: async imagePath => ({ imagePath }),
    noul: instructions => ({ noul: instructions })
  });
  const record = toRecord(row, built, { answers: { specific: { noul: 0.95 } } }, null);

  assert.deepEqual(built.request.questions, {
    specific: { noul: '共有の文脈 single question' }
  });
  assert.deepEqual(record.answers, {
    specific: { p: 0.95, polarity: 'yes_is_pass', classification: 'yes', verdict: 'pass' }
  });
});

test('summarize includes only question keys that appear in answers', () => {
  assert.deepEqual(summarize([{
    error: null,
    usage: null,
    answers: { specific: { verdict: 'pass' } }
  }]), {
    rows: 1,
    errors: 0,
    byVerdict: {
      specific: { pass: 1, defect: 0, uncertain: 0, invalid: 0 }
    },
    usage: { inputTokens: 0, outputTokens: 0 }
  });
});

test('buildRequest forwards criteria to noul as the second argument', async () => {
  const criteria = { true: 'present', false: 'absent' };
  const row = {
    ...sampleRow(),
    questions: {
      specific: { instructions: 'specific question', criteria, polarity: 'yes_is_pass' }
    }
  };
  const noulCalls = [];
  await buildRequest(row, {
    prepare: async sourcePath => ({ path: sourcePath }),
    image: async imagePath => ({ imagePath }),
    noul: (...args) => {
      noulCalls.push(args);
      return { args };
    }
  });

  assert.equal(noulCalls.length, 1);
  assert.equal(noulCalls[0][0], '共有の文脈 specific question');
  assert.strictEqual(noulCalls[0][1], criteria);
});

test('buildRequest calls noul with one argument when criteria are absent', async () => {
  const row = {
    ...sampleRow(),
    questions: {
      specific: { instructions: 'specific question', polarity: 'yes_is_pass' }
    }
  };
  const noulCalls = [];
  await buildRequest(row, {
    prepare: async sourcePath => ({ path: sourcePath }),
    image: async imagePath => ({ imagePath }),
    noul: (...args) => {
      noulCalls.push(args);
      return { args };
    }
  });

  assert.deepEqual(noulCalls, [['共有の文脈 specific question']]);
});

test('toRecord aggregates all_pass question verdicts by precedence', () => {
  const cases = [
    { probabilities: [0.95, 0.05, 0.5, null], expected: 'invalid' },
    { probabilities: [0.95, 0.5, 0.05], expected: 'defect' },
    { probabilities: [0.95, 0.5], expected: 'uncertain' },
    { probabilities: [0.95, 0.9], expected: 'pass' }
  ];

  for (const { probabilities, expected } of cases) {
    const questions = Object.fromEntries(probabilities.map((_, index) => [
      `sub_${index}`,
      { instructions: `question ${index}`, polarity: 'yes_is_pass' }
    ]));
    const row = { ...sampleRow(), aggregation: 'all_pass', questions };
    const answers = Object.fromEntries(probabilities.map((p, index) => [
      `sub_${index}`,
      { noul: p }
    ]));
    const record = toRecord(row, builtFor(row), { answers }, null);

    assert.equal(record.row_verdict, expected);
  }
});

test('toRecord sets row_p_min only when every all_pass probability is numeric', () => {
  const row = {
    ...sampleRow(),
    aggregation: 'all_pass',
    questions: {
      sub_0: { instructions: 'first question', polarity: 'yes_is_pass' },
      sub_1: { instructions: 'second question', polarity: 'yes_is_pass' },
      sub_2: { instructions: 'third question', polarity: 'yes_is_pass' }
    }
  };
  const built = builtFor(row);
  const minimum = toRecord(row, built, {
    answers: {
      sub_0: { noul: 0.91 },
      sub_1: { noul: 0.62 },
      sub_2: { noul: 0.78 }
    }
  }, null);
  const missing = toRecord(row, built, {
    answers: {
      sub_0: { noul: 0.91 },
      sub_1: { noul: null },
      sub_2: { noul: 0.78 }
    }
  }, null);
  const unaggregated = toRecord(sampleRow(), builtFor(sampleRow()), {
    answers: { specific: { noul: 0.9 }, generic: { noul: 0.8 } }
  }, null);

  assert.equal(minimum.row_p_min, 0.62);
  assert.equal(missing.row_p_min, null);
  assert.equal(Object.hasOwn(unaggregated, 'row_p_min'), false);
  assert.equal(Object.hasOwn(unaggregated, 'row_verdict'), false);
});

test('summarize counts row verdicts when row verdicts are present', () => {
  const records = ['pass', 'defect', 'uncertain', 'invalid'].map(row_verdict => ({
    error: null,
    usage: null,
    answers: { sub_0: { verdict: row_verdict } },
    row_verdict
  }));

  assert.deepEqual(summarize(records), {
    rows: 4,
    errors: 0,
    byVerdict: {
      sub_0: { pass: 1, defect: 1, uncertain: 1, invalid: 1 }
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    byRowVerdict: { pass: 1, defect: 1, uncertain: 1, invalid: 1 }
  });
});
