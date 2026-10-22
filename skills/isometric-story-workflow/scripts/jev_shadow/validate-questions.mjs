#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parseQuestionsJsonl, validateRows } from './lib/questions.mjs';

const run = async () => {
  const [questionsPath, ...extraArgs] = process.argv.slice(2);
  if (!questionsPath || extraArgs.length > 0) {
    console.error('Usage: node validate-questions.mjs <questions.jsonl>');
    process.exitCode = 2;
    return;
  }

  let parsed;
  try {
    parsed = parseQuestionsJsonl(await readFile(questionsPath, 'utf8'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const errors = [
    ...parsed.errors,
    ...validateRows(parsed.rows, { fileExists: existsSync, lineNumbers: parsed.lineNumbers })
  ];
  if (errors.length > 0) {
    for (const error of errors) console.error(`line ${error.line}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`OK ${parsed.rows.length} rows`);
};

await run();
