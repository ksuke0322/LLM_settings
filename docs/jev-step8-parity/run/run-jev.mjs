#!/usr/bin/env node
import { openAsBlob } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareImage } from '../lib/prepare-image.mjs';
import { buildRequest, summarize, toRecord } from './run-lib.mjs';

const runDirectory = dirname(fileURLToPath(import.meta.url));
const defaultQuestionsPath = resolve(runDirectory, '../questions.jsonl');
const usage = 'Usage: node run-jev.mjs [--dry-run | --live] --cache-dir <abs path> [--questions <path>] [--out <path>] [--limit <n>] [--only <id[,id...]>] [--resume <existing results path>] [--model <id>]';

const parseArgs = args => {
  let mode = 'dry-run';
  let modeWasSet = false;
  let cacheDir;
  let questionsPath = defaultQuestionsPath;
  let outPath;
  let limit;
  let only;
  let resumePath;
  let model;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run' || argument === '--live') {
      const nextMode = argument === '--live' ? 'live' : 'dry-run';
      if (modeWasSet && mode !== nextMode) throw new Error('Choose only one of --dry-run or --live.');
      mode = nextMode;
      modeWasSet = true;
      continue;
    }

    if (!['--cache-dir', '--questions', '--out', '--limit', '--only', '--resume', '--model'].includes(argument)) {
      throw new Error(`Unknown flag: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
    index += 1;

    if (argument === '--cache-dir') cacheDir = value;
    if (argument === '--questions') questionsPath = resolve(process.cwd(), value);
    if (argument === '--out') outPath = value;
    if (argument === '--resume') resumePath = value;
    if (argument === '--model') model = value;
    if (argument === '--limit') {
      const parsedLimit = Number(value);
      if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 0) {
        throw new Error('--limit must be a non-negative integer.');
      }
      limit = parsedLimit;
    }
    if (argument === '--only') {
      only = value.split(',').map(id => id.trim()).filter(Boolean);
      if (only.length === 0) throw new Error('--only requires at least one id.');
    }
  }

  if (!cacheDir) throw new Error('Missing required --cache-dir <abs path>.');
  if (!isAbsolute(cacheDir)) throw new Error('--cache-dir must be an absolute path.');
  if (resumePath && mode !== 'live') throw new Error('--resume can be used only with --live.');

  return {
    mode,
    cacheDir,
    questionsPath,
    outPath: resumePath ? resolve(resumePath) : resolve(outPath ?? resolve(runDirectory, `results-${new Date().toISOString()}.jsonl`)),
    limit,
    only: only ? new Set(only) : null,
    model,
    resumePath: resumePath ? resolve(resumePath) : null
  };
};

const readRows = async questionsPath => (await readFile(questionsPath, 'utf8'))
  .split(/\r?\n/u)
  .filter(line => line.trim().length > 0)
  .map(line => JSON.parse(line));

const selectRows = (rows, { only, limit }) => {
  const selected = only ? rows.filter(row => only.has(row.id)) : rows;
  return limit === undefined ? selected : selected.slice(0, limit);
};

const dryRun = async (rows, { cacheDir, model }) => {
  const output = [];

  for (const row of rows) {
    const built = await buildRequest(row, {
      prepare: sourcePath => prepareImage(sourcePath, { cacheDir }),
      image: sentPath => ({ dryRunImagePath: sentPath }),
      noul: instructions => ({ dryRunNoulInstructions: instructions }),
      model
    });
    output.push({
      id: built.id,
      images: built.images.map(({ key, width, height, resized }) => ({
        key,
        sentSize: { width, height },
        resized
      }))
    });
  }

  console.log(JSON.stringify({ mode: 'dry-run', requested_model: model ?? null, rows: output }, null, 2));
};

const readExistingRecords = async resumePath => {
  if (!resumePath) return [];
  const content = await readFile(resumePath, 'utf8');
  return content
    .split(/\r?\n/u)
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line));
};

const runLive = async (rows, options) => {
  const jevRequire = createRequire(new URL('../../../shared/jev/package.json', import.meta.url));
  const sdkPath = jevRequire.resolve('@typesafe-ai/sdk');
  const [{ askJev }, sdk] = await Promise.all([
    import(new URL('../../../shared/jev/src/jev-client.mjs', import.meta.url)),
    import(pathToFileURL(sdkPath))
  ]);
  const existingRecords = await readExistingRecords(options.resumePath);
  const completedIds = new Set(existingRecords
    .filter(record => record.error === null)
    .map(record => record.id));
  const records = [...existingRecords];

  if (!options.resumePath) await mkdir(dirname(options.outPath), { recursive: true });

  for (const row of rows) {
    if (completedIds.has(row.id)) continue;

    let built = null;
    let response = null;
    let error = null;

    try {
      built = await buildRequest(row, {
        prepare: sourcePath => prepareImage(sourcePath, { cacheDir: options.cacheDir }),
        image: async sentPath => sdk.image(await openAsBlob(sentPath)),
        noul: sdk.noul,
        model: options.model
      });
      response = await askJev(built.request, built.options);
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : String(caughtError);
    }

    const record = toRecord(row, built, response, error, options.model);
    await appendFile(options.outPath, `${JSON.stringify(record)}\n`);
    records.push(record);
  }

  const summary = summarize(records);
  console.log(JSON.stringify(summary, null, 2));
  console.error(`Errors: ${summary.errors}`);
};

const run = async () => {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage);
    process.exitCode = 2;
    return;
  }

  if (options.mode === 'live' && !process.env.TYPESAFE_API_KEY) {
    console.error('TYPESAFE_API_KEY is required for --live; no request was sent.');
    process.exitCode = 2;
    return;
  }

  const rows = selectRows(await readRows(options.questionsPath), options);
  if (options.mode === 'dry-run') {
    await dryRun(rows, options);
    return;
  }

  await runLive(rows, options);
};

await run();
