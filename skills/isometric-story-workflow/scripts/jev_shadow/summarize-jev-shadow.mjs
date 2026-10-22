#!/usr/bin/env node
import { summarizeFiles } from './lib/summary.mjs';

const usage = 'Usage: node summarize-jev-shadow.mjs <ledger.jsonl...> [--results <results.jsonl...>]';

const parseArgs = args => {
  const ledgerFiles = [];
  const resultFiles = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--results') {
      const start = index + 1;
      while (index + 1 < args.length && !args[index + 1].startsWith('--')) {
        resultFiles.push(args[index + 1]);
        index += 1;
      }
      if (index + 1 === start) throw new Error('--results requires one or more paths.');
      continue;
    }
    if (argument.startsWith('--')) throw new Error(`Unknown flag: ${argument}`);
    ledgerFiles.push(argument);
  }
  if (ledgerFiles.length === 0) throw new Error('Provide at least one ledger path.');
  return { ledgerFiles, resultFiles };
};

const run = async () => {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    const summary = await summarizeFiles(options);
    for (const error of summary.errors) console.error(error);
    const { errors, ...output } = summary;
    console.log(JSON.stringify(output, null, 2));
    if (errors.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 2;
  }
};

await run();
