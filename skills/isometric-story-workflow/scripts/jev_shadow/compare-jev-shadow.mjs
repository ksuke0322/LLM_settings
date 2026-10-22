#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { compareResults, renderComparison } from './lib/compare.mjs';

const usage = 'Usage: node compare-jev-shadow.mjs --results <results.jsonl> [--reports <report.json...>] [--ledger-template <out.jsonl> --attempt <n>]';

const parseArgs = args => {
  let resultsPath;
  let reportPaths = [];
  let ledgerTemplatePath;
  let attempt;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--reports') {
      const start = index + 1;
      while (index + 1 < args.length && !args[index + 1].startsWith('--')) {
        reportPaths.push(resolve(process.cwd(), args[index + 1]));
        index += 1;
      }
      if (index + 1 === start) throw new Error('--reports requires one or more paths.');
      continue;
    }
    if (!['--results', '--ledger-template', '--attempt'].includes(argument)) throw new Error(`Unknown flag: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
    index += 1;
    if (argument === '--results') resultsPath = resolve(process.cwd(), value);
    if (argument === '--ledger-template') ledgerTemplatePath = resolve(process.cwd(), value);
    if (argument === '--attempt') {
      attempt = Number(value);
      if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error('--attempt must be a positive integer.');
    }
  }
  if (!resultsPath) throw new Error('Missing required --results <path>.');
  if (ledgerTemplatePath && attempt === undefined) throw new Error('--attempt is required with --ledger-template.');
  return { resultsPath, reportPaths, ledgerTemplatePath, attempt };
};

const readJsonl = async file => {
  const content = await readFile(file, 'utf8');
  return content.split(/\r?\n/u).flatMap((line, index) => {
    if (line.trim().length === 0) return [];
    try {
      return [JSON.parse(line)];
    } catch (error) {
      throw new Error(`Invalid JSONL in ${file}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
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

  try {
    const results = await readJsonl(options.resultsPath);
    const reports = [];
    for (const file of options.reportPaths) {
      try {
        reports.push({ file, report: JSON.parse(await readFile(file, 'utf8')) });
      } catch (error) {
        console.error(`Warning: skipped report ${file}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    const compared = compareResults({ results, reports, attempt: options.attempt });
    console.log(renderComparison(compared));
    if (options.ledgerTemplatePath) {
      await mkdir(dirname(options.ledgerTemplatePath), { recursive: true });
      await writeFile(options.ledgerTemplatePath, compared.ledgerRows.map(row => JSON.stringify(row)).join('\n') + (compared.ledgerRows.length > 0 ? '\n' : ''), 'utf8');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
};

await run();
