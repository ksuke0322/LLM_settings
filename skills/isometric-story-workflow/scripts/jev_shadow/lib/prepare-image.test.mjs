import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { computeTargetSize, JEV_MAX_SIDE, JEV_MIN_SIDE, prepareImage } from './prepare-image.mjs';

test('computeTargetSize enforces image bounds and scales the long side', () => {
  assert.equal(JEV_MAX_SIDE, 1568);
  assert.equal(JEV_MIN_SIDE, 280);
  assert.deepEqual(computeTargetSize({ width: 1080, height: 1080 }), {
    width: 1080, height: 1080, resized: false
  });
  assert.deepEqual(computeTargetSize({ width: 1080, height: 1920 }), {
    width: 882, height: 1568, resized: true
  });
  assert.throws(() => computeTargetSize({ width: 279, height: 2000 }), RangeError);
});

test('prepareImage returns a source image without resizing when it is within limits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jev-shadow-image-'));
  try {
    const sourcePath = join(directory, 'source.png');
    await writeFile(sourcePath, 'image bytes');
    const result = await prepareImage(sourcePath, {
      cacheDir: join(directory, 'cache'),
      readDimensions: async () => ({ width: 1080, height: 1080 }),
      resize: async () => assert.fail('resize should not be called')
    });
    assert.deepEqual(result, { path: sourcePath, width: 1080, height: 1080, resized: false });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
