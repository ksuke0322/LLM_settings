import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { computeTargetSize, JEV_MAX_SIDE, JEV_MIN_SIDE, prepareImage } from './prepare-image.mjs';

const withTempDir = async run => {
  const tempDir = await mkdtemp(join(tmpdir(), 'jev-prepare-image-'));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

test('exports Jev image side limits', () => {
  assert.equal(JEV_MAX_SIDE, 1568);
  assert.equal(JEV_MIN_SIDE, 280);
});

test('computeTargetSize leaves images within limits unchanged', () => {
  assert.deepEqual(computeTargetSize({ width: 1080, height: 1080 }), {
    width: 1080,
    height: 1080,
    resized: false
  });
  assert.deepEqual(computeTargetSize({ width: 1568, height: 280 }), {
    width: 1568,
    height: 280,
    resized: false
  });
});

test('computeTargetSize scales down the longest side and rounds with Math.round', () => {
  assert.deepEqual(computeTargetSize({ width: 1080, height: 1920 }), {
    width: 882,
    height: 1568,
    resized: true
  });
  assert.deepEqual(computeTargetSize({ width: 1001, height: 2000 }), {
    width: 785,
    height: 1568,
    resized: true
  });
});

test('computeTargetSize does not let a resized side fall below the minimum', () => {
  assert.deepEqual(computeTargetSize({ width: 4000, height: 300 }), {
    width: 1568,
    height: 280,
    resized: true
  });
});

test('computeTargetSize rejects images with an original side below the minimum', () => {
  assert.throws(() => computeTargetSize({ width: 279, height: 2000 }), RangeError);
  assert.throws(() => computeTargetSize({ width: 1920, height: 279 }), RangeError);
});

test('prepareImage returns the source unchanged when resizing is unnecessary', async () => {
  await withTempDir(async tempDir => {
    const sourcePath = join(tempDir, 'source.png');
    const cacheDir = join(tempDir, 'cache');
    await writeFile(sourcePath, 'source image');
    let resizeCalls = 0;

    const result = await prepareImage(sourcePath, {
      cacheDir,
      readDimensions: async path => {
        assert.equal(path, sourcePath);
        return { width: 1080, height: 1080 };
      },
      resize: async () => { resizeCalls += 1; }
    });

    assert.deepEqual(result, { path: sourcePath, width: 1080, height: 1080, resized: false });
    assert.equal(resizeCalls, 0);
  });
});

test('prepareImage writes a hashed PNG into cacheDir without touching the source', async () => {
  await withTempDir(async tempDir => {
    const sourcePath = join(tempDir, 'source.png');
    const cacheDir = join(tempDir, 'cache', 'nested');
    const sourceBytes = Buffer.from('source image bytes');
    await writeFile(sourcePath, sourceBytes);
    const hash = createHash('sha256').update(sourceBytes).digest('hex').slice(0, 16);
    const destPath = join(cacheDir, `${hash}-882x1568.png`);
    let resizeArgs;

    const result = await prepareImage(sourcePath, {
      cacheDir,
      readDimensions: async () => ({ width: 1080, height: 1920 }),
      resize: async (...args) => {
        resizeArgs = args;
        await writeFile(args[1], 'resized png');
      }
    });

    assert.deepEqual(result, {
      path: destPath,
      width: 882,
      height: 1568,
      resized: true,
      sourcePath
    });
    assert.deepEqual(resizeArgs, [sourcePath, destPath, 882, 1568]);
    assert.equal(await readFile(sourcePath, 'utf8'), 'source image bytes');
    assert.equal(await readFile(destPath, 'utf8'), 'resized png');
    assert.notEqual(result.path, sourcePath);
    assert.notEqual(dirname(result.path), dirname(sourcePath));
  });
});

test('prepareImage reuses an existing cached image', async () => {
  await withTempDir(async tempDir => {
    const sourcePath = join(tempDir, 'source.png');
    const cacheDir = join(tempDir, 'cache');
    const sourceBytes = Buffer.from('repeatable source');
    await writeFile(sourcePath, sourceBytes);
    await mkdir(cacheDir, { recursive: true });
    const hash = createHash('sha256').update(sourceBytes).digest('hex').slice(0, 16);
    const destPath = join(cacheDir, `${hash}-882x1568.png`);
    await writeFile(destPath, 'cached png');
    let resizeCalls = 0;

    const result = await prepareImage(sourcePath, {
      cacheDir,
      readDimensions: async () => ({ width: 1080, height: 1920 }),
      resize: async () => { resizeCalls += 1; }
    });

    assert.equal(result.path, destPath);
    assert.equal(result.resized, true);
    assert.equal(resizeCalls, 0);
    assert.equal(await readFile(destPath, 'utf8'), 'cached png');
  });
});

test('prepareImage rejects a cacheDir beside the source file', async () => {
  await withTempDir(async tempDir => {
    const sourcePath = join(tempDir, 'source.png');
    await writeFile(sourcePath, 'source image');
    let resizeCalls = 0;

    await assert.rejects(prepareImage(sourcePath, {
      cacheDir: tempDir,
      readDimensions: async () => ({ width: 1080, height: 1920 }),
      resize: async () => { resizeCalls += 1; }
    }), RangeError);

    assert.equal(resizeCalls, 0);
    assert.equal(await readFile(sourcePath, 'utf8'), 'source image');
  });
});
