#!/usr/bin/env node
import { openAsBlob } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareImage } from './lib/prepare-image.mjs';
import { parseQuestionsJsonl, validateRows } from './lib/questions.mjs';
import { buildRequest, summarize, toRecord } from './lib/run-lib.mjs';

const runDirectory = dirname(fileURLToPath(import.meta.url));
const usage = 'Usage: node run-jev-shadow.mjs [--dry-run | --live] --questions <path> --cache-dir <absolute path> [--out <path>] [--model <id>] [--limit <n>] [--only <id[,id...]>] [--resume <results path>]';

// --only uses the prototype's comma-separated ids; --resume appends to and summarizes that same file.
const parseArgs = args => {
  let mode = 'dry-run';
  let modeWasSet = false;
  let questionsPath;
  let cacheDir;
  let outPath;
  let model = 'jev-1.14.0';
  let limit;
  let only;
  let resumePath;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run' || argument === '--live') {
      const nextMode = argument === '--live' ? 'live' : 'dry-run';
      if (modeWasSet && mode !== nextMode) throw new Error('Choose only one of --dry-run or --live.');
      mode = nextMode;
      modeWasSet = true;
      continue;
    }
    if (!['--questions', '--cache-dir', '--out', '--model', '--limit', '--only', '--resume'].includes(argument)) {
      throw new Error(`Unknown flag: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
    index += 1;

    if (argument === '--questions') questionsPath = resolve(process.cwd(), value);
    if (argument === '--cache-dir') cacheDir = value;
    if (argument === '--out') outPath = resolve(process.cwd(), value);
    if (argument === '--model') model = value;
    if (argument === '--resume') resumePath = resolve(process.cwd(), value);
    if (argument === '--limit') {
      const parsedLimit = Number(value);
      if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 0) throw new Error('--limit must be a non-negative integer.');
      limit = parsedLimit;
    }
    if (argument === '--only') {
      const ids = value.split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length === 0) throw new Error('--only requires at least one id.');
      only = new Set(ids);
    }
  }

  if (!questionsPath) throw new Error('Missing required --questions <path>.');
  if (!cacheDir) throw new Error('Missing required --cache-dir <absolute path>.');
  if (!isAbsolute(cacheDir)) throw new Error('--cache-dir must be an absolute path.');
  if (resumePath && mode !== 'live') throw new Error('--resume can be used only with --live.');
  if (resumePath && outPath) throw new Error('Use --resume as the output path; do not also provide --out.');
  if (mode === 'live' && !resumePath && !outPath) throw new Error('--out is required for --live unless --resume is given.');
  if (typeof model !== 'string' || model.trim().length === 0) throw new Error('--model must be a non-empty id.');

  return {
    mode,
    questionsPath,
    cacheDir,
    outPath: resumePath ?? outPath,
    model,
    limit,
    only,
    resumePath
  };
};

const selectRows = (rows, { only, limit }) => {
  const selected = only ? rows.filter(row => only.has(row?.id)) : rows;
  return limit === undefined ? selected : selected.slice(0, limit);
};

const readQuestionRows = async questionsPath => {
  const parsed = parseQuestionsJsonl(await readFile(questionsPath, 'utf8'));
  const errors = [
    ...parsed.errors,
    ...validateRows(parsed.rows, { lineNumbers: parsed.lineNumbers })
  ];
  if (errors.length > 0) {
    for (const error of errors) console.error(`line ${error.line}: ${error.message}`);
    return null;
  }
  return parsed.rows;
};

const dryRun = async (rows, options) => {
  const output = [];
  for (const row of rows) {
    const built = await buildRequest(row, {
      prepare: sourcePath => prepareImage(sourcePath, { cacheDir: options.cacheDir }),
      image: sentPath => ({ dryRunImagePath: sentPath }),
      noul: (instructions, criteria) => ({ dryRunNoulInstructions: instructions, criteria }),
      model: options.model
    });
    output.push({
      id: built.id,
      images: built.images.map(({ key, width, height, resized }) => ({ key, sentSize: { width, height }, resized }))
    });
  }
  console.log(JSON.stringify({ mode: 'dry-run', requested_model: options.model, rows: output }, null, 2));
};

const readExistingRecords = async resumePath => {
  if (!resumePath) return [];
  const content = await readFile(resumePath, 'utf8');
  const records = [];
  content.split(/\r?\n/u).forEach((line, index) => {
    if (line.trim().length === 0) return;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Invalid results JSONL at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return records;
};

const runLive = async (rows, options) => {
  const jevRequire = createRequire(new URL('../../../../shared/jev/package.json', import.meta.url));
  const sdkPath = jevRequire.resolve('@typesafe-ai/sdk');
  const [{ askJev }, sdk] = await Promise.all([
    import(new URL('../../../../shared/jev/src/jev-client.mjs', import.meta.url)),
    import(pathToFileURL(sdkPath))
  ]);
  const existingRecords = await readExistingRecords(options.resumePath);
  const completedIds = new Set(existingRecords.filter(record => record?.error === null).map(record => record.id));
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
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 2;
    return;
  }

  let rows;
  try {
    rows = await readQuestionRows(options.questionsPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }
  if (rows === null) {
    process.exitCode = 2;
    return;
  }

  if (options.mode === 'live' && !process.env.TYPESAFE_API_KEY) {
    console.error('TYPESAFE_API_KEY is required for --live; no request was sent.');
    process.exitCode = 2;
    return;
  }

  const selectedRows = selectRows(rows, options);
  try {
    if (options.mode === 'dry-run') await dryRun(selectedRows, options);
    else await runLive(selectedRows, options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
};

await run();
