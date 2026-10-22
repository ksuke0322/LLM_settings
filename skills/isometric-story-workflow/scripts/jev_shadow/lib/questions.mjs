import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const stateKeyPattern = /^(?:scene|closeup_\d+)$/u;
const questionKeyPattern = /^sub_\d+$/u;
const renderHashPattern = /^[0-9a-f]{64}$/u;
const imagePathPattern = /\.(?:png|jpe?g)$/iu;

// JSONL blank lines are skipped, while retained source lines preserve physical line numbers.
export const parseQuestionsJsonl = content => {
  const rows = [];
  const lineNumbers = [];
  const errors = [];

  content.split(/\r?\n/u).forEach((line, index) => {
    if (line.trim().length === 0) return;
    try {
      rows.push(JSON.parse(line));
      lineNumbers.push(index + 1);
    } catch (error) {
      errors.push({
        id: null,
        line: index + 1,
        message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  return { rows, lineNumbers, errors };
};

export const validateRows = (rows, { fileExists = existsSync, lineNumbers = [] } = {}) => {
  const errors = [];
  const add = (row, line, message) => errors.push({
    id: isNonEmptyString(row?.id) ? row.id : null,
    line,
    message
  });

  if (!Array.isArray(rows)) return [{ id: null, line: 1, message: 'Questions must be an array of rows.' }];

  const seenIds = new Set();
  let firstRenderSet = null;

  rows.forEach((row, index) => {
    const line = lineNumbers[index] ?? row?.__line ?? index + 1;
    if (!isRecord(row)) {
      add(null, line, 'Row must be a JSON object.');
      return;
    }

    if (row.schema_version !== 1) add(row, line, 'schema_version must be 1.');

    if (!isNonEmptyString(row.id)) {
      add(row, line, 'id must be a non-empty string.');
    } else if (seenIds.has(row.id)) {
      add(row, line, `id must be unique; duplicate id ${row.id}.`);
    } else {
      seenIds.add(row.id);
    }

    if (!['8A', '8B', '8C'].includes(row.review_type)) add(row, line, 'review_type must be 8A, 8B, or 8C.');

    if (!isRecord(row.item) || !isNonEmptyString(row.item.kind)) add(row, line, 'item.kind must be a non-empty string.');
    if (!isRecord(row.item) || !isNonEmptyString(row.item.criterion)) add(row, line, 'item.criterion must be a non-empty string.');

    if (!isNonEmptyString(row.render_set_sha256) || !renderHashPattern.test(row.render_set_sha256)) {
      add(row, line, 'render_set_sha256 must be 64 lowercase hexadecimal characters.');
    }
    if (firstRenderSet === null && isNonEmptyString(row.render_set_sha256)) firstRenderSet = row.render_set_sha256;
    else if (isNonEmptyString(row.render_set_sha256) && row.render_set_sha256 !== firstRenderSet) {
      add(row, line, 'All rows must share the same render_set_sha256.');
    }

    if (!isRecord(row.state) || Object.keys(row.state).length === 0) {
      add(row, line, 'state must be a non-empty object.');
    } else {
      for (const [key, imagePath] of Object.entries(row.state)) {
        if (!stateKeyPattern.test(key)) add(row, line, `state key ${key} must be scene or match closeup_<number>.`);
        if (typeof imagePath !== 'string' || !isAbsolute(imagePath)) {
          add(row, line, `state.${key} must be an absolute image path.`);
          continue;
        }
        if (!imagePathPattern.test(imagePath)) add(row, line, `state.${key} must end with .png, .jpg, or .jpeg.`);
        let exists = false;
        try {
          exists = fileExists(imagePath);
        } catch {
          exists = false;
        }
        if (!exists) add(row, line, `state.${key} image does not exist: ${imagePath}.`);
      }
    }

    if (!isRecord(row.notes) || !isNonEmptyString(row.notes.notes)) {
      add(row, line, 'notes must be an object with a non-empty string notes field.');
    }
    if (!isNonEmptyString(row.context)) add(row, line, 'context must be a non-empty string.');
    if (row.aggregation !== 'all_pass') add(row, line, 'aggregation must be all_pass.');

    const questions = row.questions;
    if (!isRecord(questions)) {
      add(row, line, 'questions must be an object with 1 to 3 sub-question keys.');
    } else {
      const questionEntries = Object.entries(questions);
      if (questionEntries.length < 1 || questionEntries.length > 3) {
        add(row, line, 'questions must contain 1 to 3 sub-questions.');
      }
      const allowedTokens = new Set(['notes', ...Object.keys(isRecord(row.state) ? row.state : {})]);
      const checkTokens = (value, field) => {
        for (const [, token] of value.matchAll(/`([^`]*)`/gu)) {
          if (!allowedTokens.has(token)) add(row, line, `${field} contains an unsupported backticked token: ${token}.`);
        }
      };
      if (isNonEmptyString(row.context)) checkTokens(row.context, 'context');

      for (const [key, question] of questionEntries) {
        if (!questionKeyPattern.test(key)) add(row, line, `question key ${key} must match sub_<number>.`);
        if (!isRecord(question)) {
          add(row, line, `questions.${key} must be an object.`);
          continue;
        }
        if (question.type !== 'noul') add(row, line, `questions.${key}.type must be noul.`);
        if (!isNonEmptyString(question.instructions)) {
          add(row, line, `questions.${key}.instructions must be a non-empty string.`);
        } else {
          checkTokens(question.instructions, `questions.${key}.instructions`);
        }
        if (!isRecord(question.criteria)
          || !isNonEmptyString(question.criteria.true)
          || !isNonEmptyString(question.criteria.false)) {
          add(row, line, `questions.${key}.criteria must contain non-empty true and false strings.`);
        }
        if (question.polarity !== 'yes_is_pass') add(row, line, `questions.${key}.polarity must be yes_is_pass.`);
      }
    }
  });

  return errors;
};
