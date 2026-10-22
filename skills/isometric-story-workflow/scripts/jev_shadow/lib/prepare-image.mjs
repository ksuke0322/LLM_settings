import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

export const JEV_MAX_SIDE = 1568;
export const JEV_MIN_SIDE = 280;

const execFileAsync = promisify(execFile);

const readDimensionsWithSips = async imagePath => {
  const { stdout } = await execFileAsync('sips', [
    '-g', 'pixelWidth',
    '-g', 'pixelHeight',
    imagePath
  ]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/u)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/u)?.[1]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new RangeError(`Could not read image dimensions: ${imagePath}`);
  }

  return { width, height };
};

const resizeWithSips = async (sourcePath, destPath, width, height) => {
  await execFileAsync('sips', [
    '-z', String(height), String(width), sourcePath, '--out', destPath
  ]);
};

export const computeTargetSize = ({ width, height }) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Image width and height must be positive finite numbers');
  }

  if (width < JEV_MIN_SIDE || height < JEV_MIN_SIDE) {
    throw new RangeError(`Image sides must be at least ${JEV_MIN_SIDE}px`);
  }

  if (Math.max(width, height) <= JEV_MAX_SIDE) {
    return { width, height, resized: false };
  }

  if (width >= height) {
    return {
      width: JEV_MAX_SIDE,
      height: Math.max(JEV_MIN_SIDE, Math.round(height * JEV_MAX_SIDE / width)),
      resized: true
    };
  }

  return {
    width: Math.max(JEV_MIN_SIDE, Math.round(width * JEV_MAX_SIDE / height)),
    height: JEV_MAX_SIDE,
    resized: true
  };
};

export const prepareImage = async (
  sourcePath,
  { cacheDir, readDimensions = readDimensionsWithSips, resize = resizeWithSips }
) => {
  const { width, height } = await readDimensions(sourcePath);
  const target = computeTargetSize({ width, height });

  if (!target.resized) return { path: sourcePath, width, height, resized: false };

  const sourceAbsolutePath = resolve(sourcePath);
  if (resolve(cacheDir) === dirname(sourceAbsolutePath)) {
    throw new RangeError('cacheDir must be separate from the source image directory');
  }

  const sourceBytes = await readFile(sourcePath);
  const hash = createHash('sha256').update(sourceBytes).digest('hex').slice(0, 16);
  const destPath = join(cacheDir, `${hash}-${target.width}x${target.height}.png`);

  if (resolve(destPath) === sourceAbsolutePath) {
    throw new RangeError('Resized image cache path must not overwrite the source image');
  }

  await mkdir(cacheDir, { recursive: true });

  try {
    if ((await stat(destPath)).isFile()) {
      return {
        path: destPath,
        width: target.width,
        height: target.height,
        resized: true,
        sourcePath
      };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await resize(sourcePath, destPath, target.width, target.height);
  return {
    path: destPath,
    width: target.width,
    height: target.height,
    resized: true,
    sourcePath
  };
};
