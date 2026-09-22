import test from 'node:test';
import assert from 'node:assert/strict';

import { askJev, createJevGateway } from '../src/jev-client.mjs';

const createRecordingClient = () => {
  const calls = [];
  const client = {
    systemOne: async (request) => {
      calls.push(request);
      return { answers: {} };
    },
  };

  return { calls, client };
};

test('default askJev export is a function', () => {
  assert.equal(typeof askJev, 'function');
});

test('createJevGateway exposes askJev', () => {
  const { client } = createRecordingClient();
  const gateway = createJevGateway({ client });

  assert.equal(typeof gateway.askJev, 'function');
});

test('askJev calls client.systemOne exactly once', async () => {
  const { calls, client } = createRecordingClient();
  const { askJev } = createJevGateway({ client });

  await askJev({ state: { phase: 'test' }, questions: { decision: 'ok?' } });

  assert.equal(calls.length, 1);
});

test('askJev preserves the state and questions references', async () => {
  const { calls, client } = createRecordingClient();
  const { askJev } = createJevGateway({ client });
  const state = { phase: 'test' };
  const questions = { decision: 'ok?' };

  await askJev({ state, questions });

  assert.strictEqual(calls[0].state, state);
  assert.strictEqual(calls[0].questions, questions);
});

test('askJev omits model when it is not specified', async () => {
  const { calls, client } = createRecordingClient();
  const { askJev } = createJevGateway({ client });

  await askJev({ state: {}, questions: {} });

  assert.equal(Object.hasOwn(calls[0], 'model'), false);
});

test('askJev forwards the specified model', async () => {
  const { calls, client } = createRecordingClient();
  const { askJev } = createJevGateway({ client });

  await askJev({ state: {}, questions: {}, model: 'jev-latest' });

  assert.equal(calls[0].model, 'jev-latest');
});

test('askJev propagates the exact client.systemOne error', async () => {
  const expectedError = new Error('systemOne failed');
  const client = {
    systemOne: async () => {
      throw expectedError;
    },
  };
  const { askJev } = createJevGateway({ client });

  await assert.rejects(askJev({ state: {}, questions: {} }), (error) => {
    assert.strictEqual(error, expectedError);
    return true;
  });
});
