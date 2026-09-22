import assert from 'node:assert/strict';

import { noul } from '@typesafe-ai/sdk';

import { askJev } from '../src/jev-client.mjs';

const apiKey = process.env.TYPESAFE_API_KEY?.trim();

if (!apiKey) {
  throw new Error(
    'TYPESAFE_API_KEY is required before running the Jev smoke test.',
  );
}

const answerName = 'test_signal';
const state =
  'This is a short, non-sensitive smoke test statement for validating Jev response structure.';

try {
  const { answers, model, usage } = await askJev({
    state,
    questions: {
      [answerName]: noul('Does this statement indicate a positive signal?'),
    },
  });

  assert.equal(typeof model, 'string');
  assert.notEqual(model.trim(), '');

  const { input_tokens: inputTokens, output_tokens: outputTokens } = usage ?? {};
  assert.ok(Number.isInteger(inputTokens));
  assert.ok(inputTokens >= 0);
  assert.ok(Number.isInteger(outputTokens));
  assert.ok(outputTokens >= 0);

  const noulValue = answers?.[answerName]?.noul;
  assert.equal(typeof noulValue, 'number');
  assert.ok(Number.isFinite(noulValue));
  assert.ok(noulValue >= 0 && noulValue <= 1);

  console.log(
    JSON.stringify({
      ok: true,
      model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
      answerName,
      noul: noulValue,
    }),
  );
} catch {
  console.error('Jev smoke test failed during communication or response validation.');
  process.exitCode = 1;
}
