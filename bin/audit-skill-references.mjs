#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXCLUDED_SKILLS = new Set([
  "high-beta-daily-flow",
  "japan-high-beta-breakout-screening",
  "japan-top-companies-screening",
  "market-regime-assessment",
  "portfolio-risk-allocator",
  "stock-investment-decision-support",
  "stock-investment-position-review",
  "stock-shared",
]);

const PATH_TOKEN_PATTERN = /(?:\$\{[^}]+\}\/[^\s"'`<>]+|~\/[^\s"'`<>]+|\/Users\/[^\s"'`<>]+|(?:\.\.\/|\.\/|skills\/|references\/|[A-Za-z0-9_.-]+\/)[A-Za-z0-9_.$@{}~/-]*)/gu;
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu;

export const parseArgs = (argv) => {
  let root;
  let json = false;
  let registryInput;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      root = argv[index + 1];
      index += 1;
    } else if (argument === "--registry") {
      registryInput = argv[index + 1];
      if (!registryInput) throw new Error("--registry requires a JSON value or file path");
      index += 1;
    } else if (argument === "--json") {
      json = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!root || !json) throw new Error("Usage: node bin/audit-skill-references.mjs --root <root> --json");
  return { root: path.resolve(root), json, registryInput };
};

export const loadRegistry = (registryInput) => {
  if (registryInput === undefined) return new Set();
  if (typeof registryInput !== "string" || !registryInput.trim()) throw new Error("Invalid registry input");

  const trimmedInput = registryInput.trim();
  let serialized;
  if (trimmedInput.startsWith("{") || trimmedInput.startsWith("[")) {
    serialized = registryInput;
  } else if (existsSync(registryInput) && statSync(registryInput).isFile()) {
    serialized = readFileSync(registryInput, "utf8");
  } else {
    throw new Error(`Invalid registry input: JSON file not found: ${registryInput}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`Invalid registry JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.references)) {
    throw new Error("Invalid registry schema: expected an object with a references array");
  }
  if (parsed.references.some((reference) => typeof reference !== "string" || !reference.trim())) {
    throw new Error("Invalid registry schema: references must contain non-empty strings");
  }
  return new Set(parsed.references);
};

const walkMarkdown = (directory, rootDirectory = directory, includeFile = () => true, excludedTopLevel = new Set()) => {
  if (!existsSync(directory)) return [];

  const found = [];
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativeParts = path.relative(rootDirectory, absolutePath).split(path.sep);
    if (entry.isDirectory()) {
      if (!excludedTopLevel.has(relativeParts[0])) {
        found.push(...walkMarkdown(absolutePath, rootDirectory, includeFile, excludedTopLevel));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md") && includeFile(absolutePath)) {
      found.push(absolutePath);
    }
  }
  return found;
};

export const collectSourceFiles = (root) => {
  const files = [];
  const agentInstructions = path.join(root, "AGENTS.md");
  if (existsSync(agentInstructions) && statSync(agentInstructions).isFile()) files.push(agentInstructions);

  files.push(...walkMarkdown(path.join(root, "references")));
  files.push(...walkMarkdown(
    path.join(root, "skills"),
    path.join(root, "skills"),
    (filePath) => path.basename(filePath) === "SKILL.md",
    EXCLUDED_SKILLS,
  ));

  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
};

const cleanCandidate = (candidate) => candidate.replace(/[.,;:!?)}\]]+$/u, "");

const isPathLikeCodeCandidate = (candidate) => {
  const hasExplicitPathPrefix = /^(?:\$\{[^}]+\}\/|~\/|\/|\.\.\/|\.\/|skills\/|references\/)/u.test(candidate);
  if (hasExplicitPathPrefix) return true;
  const pathWithoutQueryOrFragment = candidate.split(/[?#]/u, 1)[0];
  return /(?:^|\/)[^/]+\.[A-Za-z0-9]{1,12}$/u.test(pathWithoutQueryOrFragment);
};

const maskInlineCode = (line) => {
  const references = [];
  const visibleLine = line.replace(/(`+)(.*?)\1/gu, (span, _delimiter, code) => {
    for (const match of code.matchAll(PATH_TOKEN_PATTERN)) {
      const candidate = cleanCandidate(match[0]);
      if (candidate && isPathLikeCodeCandidate(candidate)) references.push(candidate);
    }
    return " ".repeat(span.length);
  });
  return { visibleLine, references };
};

export const collectLineCandidates = (line) => {
  const { visibleLine, references: codeReferences } = maskInlineCode(line);
  const records = codeReferences.map((reference) => ({ reference, syntax: "code-span" }));
  for (const match of visibleLine.matchAll(MARKDOWN_LINK_PATTERN)) {
    const reference = (match[1] ?? match[2] ?? "").trim();
    if (reference && !reference.startsWith("#")) records.push({ reference, syntax: "markdown-link" });
  }

  const seen = new Set();
  return records.filter(({ reference, syntax }) => {
    const key = `${syntax}\u0000${reference}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const withinRoot = (root, absolutePath) => {
  const relative = path.relative(root, absolutePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

const sourceSkillDirectory = (root, sourceFile) => {
  const relativeSource = path.relative(root, sourceFile).split(path.sep);
  return relativeSource[0] === "skills" && relativeSource.at(-1) === "SKILL.md"
    ? path.dirname(sourceFile)
    : null;
};

const isTemplateReference = (reference) => /(?:\$\{[^}]+\}|\$[A-Za-z_][\w]*|\{\{[^}]+\}\})/u.test(reference);

const unknownReference = (classification, reason) => ({ classification, severity: "warning", reason });
const externalReference = (reference, registry) => registry.has(reference)
  ? {
    classification: "external-known",
    severity: "info",
    reason: "外部参照がregistryに完全一致で登録されています。到達性は確認していません。",
  }
  : unknownReference("external-unknown", "外部参照がregistryに完全一致登録されていないため未確認として記録します。");

const resolveLocalTarget = (root, sourceFile, reference) => {
  const lookupReference = reference.split(/[?#]/u, 1)[0];
  if (!lookupReference) return { lookupReference, targetPath: null };
  const targetPath = path.isAbsolute(lookupReference)
    ? path.resolve(lookupReference)
    : lookupReference.startsWith("skills/")
      ? path.resolve(root, lookupReference)
      : path.resolve(path.dirname(sourceFile), lookupReference);
  return { lookupReference, targetPath };
};

export const classifyReference = (root, sourceFile, reference, syntax = "markdown-link", registry = new Set()) => {
  const skillDirectory = sourceSkillDirectory(root, sourceFile);
  const skillDirectoryPrefix = "${SKILL_DIR}/";
  const isSkillDirectoryTemplate = reference.startsWith(skillDirectoryPrefix);

  if (syntax === "code-span") {
    if (isSkillDirectoryTemplate && skillDirectory) {
      const templateTarget = path.resolve(skillDirectory, reference.slice(skillDirectoryPrefix.length).split(/[?#]/u, 1)[0]);
      if (withinRoot(root, templateTarget) && existsSync(templateTarget)) {
        return {
          classification: "skill-local",
          severity: "info",
          reason: "インライン例の${SKILL_DIR}参照を現在のSkillディレクトリに解決でき、対象が実在します。",
        };
      }
      return unknownReference("template-unknown", "インラインの${SKILL_DIR}参照は固定パスの欠落と断定せず未確認として記録します。");
    }
    if (isTemplateReference(reference)) {
      return unknownReference("template-unknown", "インラインの変数参照は固定パスと断定せず未確認として記録します。");
    }
    if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/u.test(reference)
      || /^~(?:\/|$)/u.test(reference)
      || reference.startsWith("/Users/")) {
      return externalReference(reference, registry);
    }
    const { lookupReference, targetPath } = resolveLocalTarget(root, sourceFile, reference);
    if (targetPath && withinRoot(root, targetPath) && existsSync(targetPath)) {
      const isSkillLocal = skillDirectory && withinRoot(skillDirectory, targetPath);
      return {
        classification: isSkillLocal ? "skill-local" : "repository-local",
        severity: "info",
        reason: "インラインコードのローカルパス例は実在するためinfoとして記録します。",
      };
    }
    if (targetPath && !withinRoot(root, targetPath)) {
      return externalReference(reference, registry);
    }
    return unknownReference("code-example-unknown", `インラインコードのパス例は欠落エラーにしません: ${lookupReference}`);
  }

  if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/u.test(reference)) {
    return externalReference(reference, registry);
  }

  if (/^~(?:\/|$)/u.test(reference) || reference.startsWith("/Users/")) {
    return externalReference(reference, registry);
  }

  if (isSkillDirectoryTemplate) {
    if (!skillDirectory) {
      return unknownReference(
        "template-unknown",
        "${SKILL_DIR} の基準ディレクトリを決められないため未確認として記録します。",
      );
    }
    const templateTarget = path.resolve(skillDirectory, reference.slice(skillDirectoryPrefix.length).split(/[?#]/u, 1)[0]);
    if (!withinRoot(root, templateTarget)) {
      return unknownReference("external-unknown", "テンプレートを解決するとリポジトリ外になるため未確認として記録します。");
    }
    if (!existsSync(templateTarget)) {
      return unknownReference(
        "template-unknown",
        "${SKILL_DIR} を含むテンプレート参照は固定パスの欠落と判定せず未確認として記録します。",
      );
    }
    return {
      classification: "skill-local",
      severity: "info",
      reason: "${SKILL_DIR} を現在の Skill ディレクトリに解決でき、対象が実在します。",
    };
  }

  if (isTemplateReference(reference)) {
    return unknownReference("template-unknown", "変数を含む参照は固定パスと断定せず、未確認として記録します。");
  }

  const { lookupReference, targetPath } = resolveLocalTarget(root, sourceFile, reference);
  if (!lookupReference) {
    return unknownReference("external-unknown", "空のリンク先をローカル参照として確認できないため未確認として記録します。");
  }

  if (!withinRoot(root, targetPath)) {
    return externalReference(reference, registry);
  }

  if (!existsSync(targetPath)) {
    return {
      classification: "broken-local",
      severity: "error",
      reason: "リポジトリ内の明示的なMarkdownリンク先が見つかりません。",
    };
  }

  const isSkillLocal = skillDirectory && withinRoot(skillDirectory, targetPath);
  return {
    classification: isSkillLocal ? "skill-local" : "repository-local",
    severity: "info",
    reason: isSkillLocal
      ? "リンク先を現在の Skill ディレクトリ基準で確認できました。"
      : "リンク先をリポジトリ内で確認できました。",
  };
};

const isFenceMarker = (line) => line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);

export const auditReferences = (root, registry = new Set()) => {
  const absoluteRoot = path.resolve(root);
  const references = [];
  for (const sourceFile of collectSourceFiles(absoluteRoot)) {
    const lines = readFileSync(sourceFile, "utf8").split(/\r?\n/u);
    const sourceRelativePath = path.relative(absoluteRoot, sourceFile).split(path.sep).join("/");
    let openFence = null;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const fenceMarker = isFenceMarker(line);
      if (openFence) {
        if (fenceMarker && fenceMarker[1][0] === openFence.character && fenceMarker[1].length >= openFence.length && /^\s*$/u.test(fenceMarker[2])) {
          openFence = null;
        }
        continue;
      }
      if (fenceMarker) {
        openFence = { character: fenceMarker[1][0], length: fenceMarker[1].length };
        continue;
      }

      for (const { reference, syntax } of collectLineCandidates(line)) {
        references.push({
          sourceFile: sourceRelativePath,
          line: index + 1,
          reference,
          syntax,
          ...classifyReference(absoluteRoot, sourceFile, reference, syntax, registry),
        });
      }
    }
  }
  return references;
};

export const summarizeReferences = (references) => {
  const errors = references.filter(({ severity }) => severity === "error");
  const warnings = references.filter(({ severity }) => severity === "warning");
  const byClassification = Object.fromEntries(
    [...new Set(references.map(({ classification }) => classification))]
      .sort()
      .map((classification) => [classification, references.filter((item) => item.classification === classification).length]),
  );

  return {
    references: references.length,
    errors: errors.length,
    warnings: warnings.length,
    brokenLocal: errors.length,
    byClassification,
    errorsByLine: errors,
    warningsByLine: warnings,
  };
};

const audit = (root, registry) => {
  const references = auditReferences(root, registry);
  const summary = summarizeReferences(references);
  return {
    references,
    errors: summary.errorsByLine,
    warnings: summary.warningsByLine,
    summary: {
      references: summary.references,
      errors: summary.errors,
      warnings: summary.warnings,
      brokenLocal: summary.brokenLocal,
      byClassification: summary.byClassification,
    },
  };
};

const runCli = (argv) => {
  try {
    const { root, registryInput } = parseArgs(argv);
    const registry = loadRegistry(registryInput);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Root directory does not exist: ${root}`);
    const result = audit(root, registry);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.errors.length > 0 ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
