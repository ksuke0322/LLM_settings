#!/usr/bin/env node
import { openAsBlob, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCases, evaluate } from './smoke-lib.mjs';

const smokeDirectory = dirname(fileURLToPath(import.meta.url));
const questionsPath = resolve(smokeDirectory, '../questions.jsonl');
const imagePaths = {
  A: '/Users/sawairikeisuke/Documents/Blender/isometric/pomodoro_assets/creature-watching_story-02-beehive-opus5/evidence/step8/cu_hive.png',
  B: '/Users/sawairikeisuke/Documents/Blender/isometric/pomodoro_assets/windmill-hill_story-01-windmill_opus5/output/cu3_cart.png'
};

const summarizeDryRun = async () => {
  const cases = await buildCases({
    questionsPath,
    imagePaths,
    image: imagePath => ({ smokeImagePath: imagePath }),
    noul: instructions => ({ smokeNoulInstructions: instructions })
  });
  const imageList = [...new Set(cases.flatMap(({ request }) =>
    Object.values(request.state)
      .map(value => value?.smokeImagePath)
      .filter(Boolean)
  ))].map(path => ({ path, bytes: statSync(path).size }));

  return {
    mode: 'dry-run',
    cases: cases.map(({ id, check }) => ({ id, check })),
    checks: [
      { name: 'content', threshold: 'yes >= 0.9 and no <= 0.1', cases: cases.filter(item => item.check === 'content').length },
      { name: 'image/no-image', threshold: 'absolute probability difference >= 0.3 for each pair', cases: cases.filter(item => item.check === 'no-image').length },
      { name: 'language', threshold: 'JA and EN agree at p >= 0.5 for every pair', cases: cases.filter(item => item.check === 'language').length },
      { name: 'size', threshold: 'largest image payload returns without error', cases: cases.filter(item => item.check === 'size').length },
      { name: 'repeat', threshold: 'probability spread <= 0.1 over 3 calls', cases: cases.filter(item => item.check === 'repeat').length }
    ],
    images: imageList
  };
};

const runLive = async () => {
  const jevRequire = createRequire(new URL('../../../shared/jev/package.json', import.meta.url));
  const sdkPath = jevRequire.resolve('@typesafe-ai/sdk');
  const [{ askJev }, sdk] = await Promise.all([
    import(new URL('../../../shared/jev/src/jev-client.mjs', import.meta.url)),
    import(pathToFileURL(sdkPath))
  ]);
  const cases = await buildCases({
    questionsPath,
    imagePaths,
    image: async imagePath => sdk.image(await openAsBlob(imagePath)),
    noul: sdk.noul
  });
  const results = [];

  for (const item of cases) {
    try {
      const response = await askJev(item.request, item.options);
      results.push({ ...item, response, error: null });
    } catch (error) {
      results.push({ ...item, response: null, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const summary = evaluate(results);
  const timestamp = new Date().toISOString();
  const resultPath = join(smokeDirectory, `results-${timestamp}.json`);
  const savedResults = results.map(({ id, check, response, error }) => ({
    id,
    check,
    answers: response?.answers ?? null,
    model: response?.model ?? null,
    usage: response?.usage ?? null,
    error: error ?? null
  }));

  await writeFile(resultPath, `${JSON.stringify({ timestamp, results: savedResults, evaluation: summary }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.error(`Results saved to ${resultPath}`);
  if (!summary.pass) process.exitCode = 1;
};

const run = async () => {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const dryRun = args.includes('--dry-run');
  const invalidArgs = args.some(argument => !['--live', '--dry-run'].includes(argument));

  if (invalidArgs || (live && dryRun)) {
    console.error('Usage: node smoke-image.mjs [--dry-run | --live]');
    process.exitCode = 2;
    return;
  }

  if (live && !process.env.TYPESAFE_API_KEY) {
    console.error('TYPESAFE_API_KEY is required for --live; no request was sent.');
    process.exitCode = 2;
    return;
  }

  if (live) {
    await runLive();
    return;
  }

  console.log(JSON.stringify(await summarizeDryRun(), null, 2));
};

await run();
