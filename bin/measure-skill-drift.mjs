#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const STOCK_SKILL_NAMES = new Set([
  "high-beta-daily-flow",
  "japan-high-beta-breakout-screening",
  "japan-top-companies-screening",
  "market-regime-assessment",
  "portfolio-risk-allocator",
  "stock-investment-decision-support",
  "stock-investment-position-review",
  "stock-shared",
]);

const DIGEST_ALGORITHM = {
  id: "skill-folder-content-v1",
  rules: [
    "Hash stream starts with UTF-8 bytes for skill-folder-content-v1 followed by one NUL byte.",
    "SHA-256 over regular files sorted by UTF-8 relative path.",
    "Each file encodes the big-endian path byte length, path bytes, big-endian content byte length, and content bytes.",
    "Empty directories and executable bits are excluded.",
    "Finding any symbolic link makes the local digest null and the measurement unknown.",
  ],
};

const UNKNOWN_COMPARISON_REASON = "verification-unknown: 上流ツリーSHAを取得していないため、ローカル内容との照合は未確認です。";
const SYMLINK_REASON = "verification-unknown: ローカルSkill内にシンボリックリンクがあるため、安全に計測できません。";

const parseArgs = (args) => {
  let root;
  let baselinePath = null;
  let customizationsSpec = null;
  let upstreamCheckoutsPath = null;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      root = args[index + 1];
      if (!root || root.startsWith("--")) {
        throw new Error("--root にはルートディレクトリを指定してください。");
      }
      index += 1;
    } else if (arg === "--baseline" || arg === "--customizations" || arg === "--upstream-checkouts") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} には入力を指定してください。`);
      if (arg === "--baseline") baselinePath = value;
      else if (arg === "--customizations") customizationsSpec = value;
      else upstreamCheckoutsPath = value;
      index += 1;
    } else if (arg === "--json") {
      json = true;
    } else {
      throw new Error(`未対応の引数です: ${arg}`);
    }
  }

  if (!root) throw new Error("使用方法: measure-skill-drift.mjs --root <root> --json");
  if (!json) throw new Error("この計測CLIでは --json を指定してください。");
  return { root: resolve(root), baselinePath, customizationsSpec, upstreamCheckoutsPath };
};

const isStockSkill = (name, entry) => {
  if (STOCK_SKILL_NAMES.has(name)) return true;

  const identifiers = [name, entry?.skillPath, entry?.source, entry?.sourceUrl]
    .filter((value) => typeof value === "string");
  return identifiers.some((value) => {
    const normalized = value.replaceAll("\\", "/").toLowerCase();
    return /(?:^|[/_.-])stock7(?:$|[/_.-])/.test(normalized)
      || /(?:^|[/_.-])stock-shared(?:$|[/_.-])/.test(normalized)
      || /(?:^|[/_.-])stock-skills?(?:$|[/_.-])/.test(normalized);
  });
};

const isWithinRoot = (root, target) => {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`));
};

const errorIsMissing = (error) => error?.code === "ENOENT" || error?.code === "ENOTDIR";

const reasonForReadFailure = (error) => {
  if (errorIsMissing(error)) return "verification-unknown: 計測対象のローカルSkillディレクトリまたはファイルが欠損しています。";
  const detail = typeof error?.code === "string" ? error.code : "原因不明";
  return `verification-unknown: ローカルSkill内容の計測に失敗しました（${detail}）。`;
};

const openRegularFileWithoutFollowingLinks = async (filePath) => {
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stats = await handle.stat();
    if (!stats.isFile()) return { regular: false, symbolicLink: false };
    return { regular: true, symbolicLink: false, content: await handle.readFile() };
  } catch (error) {
    if (error?.code === "ELOOP") return { regular: false, symbolicLink: true };
    throw error;
  } finally {
    await handle?.close();
  }
};

const localDirectoryFor = (root, skillName) => {
  if (typeof skillName !== "string" || skillName.trim() === "" || skillName === "." || skillName === ".." || /[\\/]/.test(skillName)) {
    return null;
  }
  return resolve(root, "skills", skillName);
};

const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

const localDigestFor = async (root, skillName) => {
  const directory = localDirectoryFor(root, skillName);
  const displayDirectory = typeof skillName === "string" ? `skills/${skillName}` : null;
  if (!directory || !isWithinRoot(resolve(root, "skills"), directory)) {
    return { digest: null, directory: displayDirectory, reason: "verification-unknown: ロックキーがローカルSkillディレクトリ名として無効です。" };
  }

  const skillsDirectory = resolve(root, "skills");
  try {
    const skillsStats = await lstat(skillsDirectory);
    if (!skillsStats.isDirectory() || skillsStats.isSymbolicLink()) {
      return { digest: null, directory: displayDirectory, reason: "verification-unknown: skillsディレクトリが通常のディレクトリではありません。" };
    }

    const directoryStats = await lstat(directory);
    if (directoryStats.isSymbolicLink()) {
      return { digest: null, directory: displayDirectory, reason: SYMLINK_REASON };
    }
    if (!directoryStats.isDirectory()) {
      return { digest: null, directory: displayDirectory, reason: "verification-unknown: ローカルSkillディレクトリが通常のディレクトリではありません。" };
    }

    const files = [];
    let foundSymlink = false;
    const walk = async (currentDirectory, relativeDirectory) => {
      const entries = await readdir(currentDirectory, { withFileTypes: true });
      entries.sort((left, right) => compareUtf8(left.name, right.name));

      for (const entry of entries) {
        const absolutePath = resolve(currentDirectory, entry.name);
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) {
          foundSymlink = true;
          return;
        }
        if (entry.isDirectory()) {
          const stats = await lstat(absolutePath);
          if (stats.isSymbolicLink()) {
            foundSymlink = true;
            return;
          }
          if (stats.isDirectory()) await walk(absolutePath, relativePath);
        } else if (entry.isFile()) {
          const result = await openRegularFileWithoutFollowingLinks(absolutePath);
          if (result.symbolicLink) {
            foundSymlink = true;
            return;
          }
          if (result.regular) files.push({ path: relativePath, content: result.content });
        }
        if (foundSymlink) return;
      }
    };

    await walk(directory, "");
    if (foundSymlink) return { digest: null, directory: displayDirectory, reason: SYMLINK_REASON };

    files.sort((left, right) => compareUtf8(left.path, right.path));
    const hash = createHash("sha256");
    hash.update("skill-folder-content-v1\0", "utf8");
    for (const file of files) {
      const pathBytes = Buffer.from(file.path, "utf8");
      const pathLength = Buffer.alloc(4);
      pathLength.writeUInt32BE(pathBytes.length);
      const contentLength = Buffer.alloc(8);
      contentLength.writeBigUInt64BE(BigInt(file.content.length));
      hash.update(pathLength).update(pathBytes).update(contentLength).update(file.content);
    }

    return { digest: hash.digest("hex"), directory: displayDirectory, reason: UNKNOWN_COMPARISON_REASON };
  } catch (error) {
    return { digest: null, directory: displayDirectory, reason: reasonForReadFailure(error) };
  }
};

const readBaseline = async (inputPath) => {
  if (!inputPath) {
    return {
      inputPath: null,
      status: "verification-unknown",
      algorithmId: null,
      reason: "verification-unknown: baseline input was not provided.",
      report: null,
    };
  }

  let report;
  try {
    report = JSON.parse(await readFile(inputPath, "utf8"));
  } catch (error) {
    const detail = errorIsMissing(error) ? "baseline file is missing." : "baseline JSON could not be read or parsed.";
    return { inputPath, status: "verification-unknown", algorithmId: null, reason: `verification-unknown: ${detail}`, report: null };
  }

  const algorithmId = report?.digestAlgorithm?.id ?? null;
  if (!report || typeof report !== "object" || !Array.isArray(report.records) || typeof algorithmId !== "string") {
    return {
      inputPath,
      status: "verification-unknown",
      algorithmId: typeof algorithmId === "string" ? algorithmId : null,
      reason: "verification-unknown: baseline schema must contain digestAlgorithm.id and a records array.",
      report: null,
    };
  }
  if (algorithmId !== DIGEST_ALGORITHM.id) {
    return {
      inputPath,
      status: "verification-unknown",
      algorithmId,
      reason: `verification-unknown: baseline algorithm ${algorithmId} does not match ${DIGEST_ALGORITHM.id}.`,
      report,
    };
  }
  return { inputPath, status: "ready", algorithmId, reason: null, report };
};

const readCustomizations = async (spec) => {
  if (!spec) {
    return {
      path: null,
      source: "absent",
      status: "verification-unknown",
      reason: "verification-unknown: customizations were not provided.",
      skills: null,
    };
  }

  const inline = spec.trimStart().startsWith("{");
  const inputPath = inline ? null : spec;
  try {
    const content = inline ? spec : await readFile(spec, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || !parsed.skills || typeof parsed.skills !== "object" || Array.isArray(parsed.skills)) {
      return {
        path: inputPath,
        source: inline ? "inline" : "file",
        status: "verification-unknown",
        reason: "verification-unknown: customization schema must contain a skills object.",
        skills: null,
      };
    }
    return { path: inputPath, source: inline ? "inline" : "file", status: "loaded", reason: null, skills: parsed.skills };
  } catch (error) {
    const detail = errorIsMissing(error) ? "customization file is missing." : "customization JSON could not be read or parsed.";
    return {
      path: inputPath,
      source: inline ? "inline" : "file",
      status: "verification-unknown",
      reason: `verification-unknown: ${detail}`,
      skills: null,
    };
  }
};

const readUpstreamCheckouts = async (inputPath) => {
  if (!inputPath) {
    return {
      inputPath: null,
      status: "verification-unknown",
      reason: "verification-unknown: --upstream-checkouts was not provided.",
      sources: null,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(inputPath, "utf8"));
  } catch (error) {
    const detail = errorIsMissing(error) ? "upstream checkout mapping file is missing." : "upstream checkout mapping JSON could not be read or parsed.";
    return { inputPath, status: "verification-unknown", reason: `verification-unknown: ${detail}`, sources: null };
  }
  if (!parsed || typeof parsed !== "object" || !parsed.sources || typeof parsed.sources !== "object" || Array.isArray(parsed.sources)) {
    return {
      inputPath,
      status: "verification-unknown",
      reason: "verification-unknown: upstream checkout mapping must contain a sources object.",
      sources: null,
    };
  }
  return { inputPath, status: "loaded", reason: null, sources: parsed.sources };
};

const githubSourceId = (source) => {
  if (typeof source !== "string") return null;
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(source);
  if (!match || [match[1], match[2]].some((part) => part === "." || part === "..")) return null;
  return `${match[1]}/${match[2]}`.toLowerCase();
};

const githubSourceFromOrigin = (origin) => {
  let match = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(origin);
  if (match) return githubSourceId(`${match[1]}/${match[2]}`);
  try {
    const url = new URL(origin);
    if (!new Set(["https:", "http:", "ssh:", "git:"]).has(url.protocol) || url.hostname.toLowerCase() !== "github.com") return null;
    const path = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
    return githubSourceId(path);
  } catch {
    return null;
  }
};

const safeSkillFolderPath = (skillPath) => {
  if (skillPath === "SKILL.md") return "";
  if (typeof skillPath !== "string" || !skillPath.endsWith("/SKILL.md") || skillPath.startsWith("/") || skillPath.includes("\\") || skillPath.includes("\0")) return null;
  const segments = skillPath.split("/");
  if (segments.length < 2 || segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  return segments.slice(0, -1).join("/");
};

const gitRead = (checkoutPath, args) => {
  const result = spawnSync("git", ["-C", checkoutPath, ...args], { encoding: "utf8", timeout: 10000, windowsHide: true });
  if (result.error || result.status !== 0) {
    const detail = result.error?.code ?? result.stderr?.trim() ?? `exit ${result.status}`;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return result.stdout.trim();
};

const unknownUpstreamEvidence = (entry, checkoutPath, reason) => ({
  source: entry?.source ?? null,
  ref: null,
  skillPath: entry?.skillPath ?? null,
  checkoutPath: checkoutPath ?? null,
  commit: null,
  treeSha: null,
  workingTreeDirty: null,
  workingTreeNote: "verification-unknown: upstream Git objects were not read.",
  status: "verification-unknown",
  reason,
});

const measureUpstreamEvidence = (entry, checkouts, lockVersion) => {
  const source = entry?.source;
  if (checkouts.status !== "loaded") return unknownUpstreamEvidence(entry, null, checkouts.reason);
  if (lockVersion !== 3) return unknownUpstreamEvidence(entry, null, "verification-unknown: upstream tree measurement requires skill lock version 3.");
  if (entry?.sourceType !== "github") {
    return unknownUpstreamEvidence(entry, null, "verification-unknown: lock sourceType is not github.");
  }
  if (typeof entry?.skillFolderHash !== "string" || !/^[a-fA-F0-9]{40}$/.test(entry.skillFolderHash)) {
    return unknownUpstreamEvidence(entry, null, "verification-unknown: GitHub lock skillFolderHash must be 40 hexadecimal characters.");
  }
  const sourceId = githubSourceId(source);
  if (!sourceId) return unknownUpstreamEvidence(entry, null, "verification-unknown: lock source is not a safe owner/repo identifier.");
  const skillFolderPath = safeSkillFolderPath(entry?.skillPath);
  if (skillFolderPath === null) return unknownUpstreamEvidence(entry, null, "verification-unknown: skillPath must be a safe relative path ending in SKILL.md.");

  const sourceEntry = Object.entries(checkouts.sources).find(([key]) => githubSourceId(key) === sourceId);
  if (!sourceEntry) return unknownUpstreamEvidence(entry, null, `verification-unknown: no local checkout mapping was provided for ${source}.`);
  const [mappedSource, checkoutPath] = sourceEntry;
  if (typeof checkoutPath !== "string" || !isAbsolute(checkoutPath)) {
    return unknownUpstreamEvidence(entry, typeof checkoutPath === "string" ? checkoutPath : null, "verification-unknown: mapped checkout path must be absolute.");
  }
  if (githubSourceId(mappedSource) !== sourceId) {
    return unknownUpstreamEvidence(entry, checkoutPath, "verification-unknown: checkout mapping source does not match lock source.");
  }

  try {
    const origin = gitRead(checkoutPath, ["config", "--get", "remote.origin.url"]);
    if (githubSourceFromOrigin(origin) !== sourceId) {
      return unknownUpstreamEvidence(entry, checkoutPath, "verification-unknown: checkout origin does not match the lock source.");
    }
    const commit = gitRead(checkoutPath, ["rev-parse", "--verify", "HEAD^{commit}"]);
    const treeRevision = skillFolderPath === "" ? `${commit}^{tree}` : `${commit}:${skillFolderPath}`;
    const treeSha = gitRead(checkoutPath, ["rev-parse", "--verify", treeRevision]);
    if (!/^[a-fA-F0-9]{40}$/.test(commit) || !/^[a-fA-F0-9]{40}$/.test(treeSha) || gitRead(checkoutPath, ["cat-file", "-t", treeSha]) !== "tree") {
      return unknownUpstreamEvidence(entry, checkoutPath, "verification-unknown: captured HEAD commit or skill folder tree object has an invalid type or SHA.");
    }
    const workingTreeDirty = gitRead(checkoutPath, ["status", "--porcelain", "--untracked-files=all"]) !== "";
    const workingTreeNote = workingTreeDirty
      ? `Checkout is dirty; the measurement uses Git objects at captured HEAD commit ${commit}, so working-tree file changes are not reflected.`
      : `Measurement uses Git objects at captured HEAD commit ${commit}; working-tree file changes are not included.`;
    return {
      source,
      ref: "HEAD",
      skillPath: entry.skillPath,
      checkoutPath,
      commit,
      treeSha,
      workingTreeDirty,
      workingTreeNote,
      status: "measured",
      reason: null,
    };
  } catch (error) {
    const detail = error?.message ?? String(error);
    const missingFolder = typeof entry?.skillPath === "string" && detail.includes(`:${skillFolderPath}`);
    const reason = missingFolder
      ? `verification-unknown: skillPath directory ${skillFolderPath || "."} is missing from the captured HEAD commit (${detail}).`
      : `verification-unknown: local Git checkout could not be measured (${detail}).`;
    return unknownUpstreamEvidence(entry, checkoutPath, reason);
  }
};

const compareUpstreamLock = (entry, evidence) => {
  if (evidence.status !== "measured") return { status: "verification-unknown", reason: evidence.reason };
  const lockHash = entry?.skillFolderHash;
  if (typeof lockHash !== "string" || !/^[a-fA-F0-9]{40}$/.test(lockHash)) {
    return { status: "verification-unknown", reason: "verification-unknown: GitHub lock hash is missing or invalid." };
  }
  return {
    status: lockHash.toLowerCase() === evidence.treeSha.toLowerCase() ? "upstream-lock-match" : "lock-update-needed",
    reason: null,
  };
};

const baselineRecordFor = (baseline, name) => {
  if (!Array.isArray(baseline.report?.records)) return { record: null, reason: baseline.reason };
  const matches = baseline.report.records.filter((record) => record?.name === name);
  if (matches.length === 0) return { record: null, reason: `verification-unknown: baseline has no record for ${name}.` };
  if (matches.length > 1) return { record: null, reason: `verification-unknown: baseline has duplicate records for ${name}.` };
  return { record: matches[0], reason: null };
};

const compareLocalDigest = (baseline, baselineRecordResult, localDigest, localReason) => {
  if (baseline.status !== "ready") return { status: "verification-unknown", reason: baseline.reason };
  if (!baselineRecordResult.record) return { status: "verification-unknown", reason: baselineRecordResult.reason };
  const baselineDigest = baselineRecordResult.record.localContentDigest;
  if (baselineDigest === null || baselineDigest === undefined) {
    return { status: "verification-unknown", reason: "verification-unknown: baseline local content digest is null or missing." };
  }
  if (localDigest === null || localDigest === undefined) {
    return { status: "verification-unknown", reason: `verification-unknown: current local content digest is null or missing. ${localReason}` };
  }
  if (typeof baselineDigest !== "string" || typeof localDigest !== "string" || !/^[a-f0-9]{64}$/.test(baselineDigest) || !/^[a-f0-9]{64}$/.test(localDigest)) {
    return { status: "verification-unknown", reason: "verification-unknown: local content digest has an invalid schema." };
  }
  return { status: baselineDigest === localDigest ? "local-baseline-match" : "locally-modified", reason: null };
};

const compareLockHash = (baseline, baselineRecordResult, lockHash) => {
  if (!baseline.report || !baselineRecordResult.record) {
    return { status: "verification-unknown", currentLockHash: lockHash ?? null, baselineLockHash: null, reason: baselineRecordResult.reason ?? baseline.reason };
  }
  const baselineLockHash = baselineRecordResult.record.lockHash;
  if (typeof lockHash !== "string" || typeof baselineLockHash !== "string") {
    return {
      status: "verification-unknown",
      currentLockHash: lockHash ?? null,
      baselineLockHash: baselineLockHash ?? null,
      reason: "verification-unknown: current or baseline lock hash is null or missing.",
    };
  }
  return {
    status: lockHash === baselineLockHash ? "lock-match" : "lock-changed",
    currentLockHash: lockHash,
    baselineLockHash,
    reason: null,
  };
};

const customizationFor = (customizations, name) => {
  if (customizations.status !== "loaded") {
    return {
      status: "verification-unknown",
      type: null,
      reference: null,
      reason: null,
      validity: "unverified",
      statusReason: customizations.reason,
    };
  }
  if (!Object.hasOwn(customizations.skills, name)) {
    return {
      status: "verification-unknown",
      type: null,
      reference: null,
      reason: null,
      validity: "unverified",
      statusReason: "verification-unknown: このSkillのcustomization宣言は未指定です。",
    };
  }

  const declaration = customizations.skills[name];
  const declarationObject = declaration && typeof declaration === "object" && !Array.isArray(declaration);
  const type = declarationObject ? declaration.type ?? null : null;
  const reference = declarationObject ? declaration.reference ?? null : null;
  const reason = declarationObject ? declaration.reason ?? null : null;
  const supportedType = type === "patch" || type === "wrapper";
  const completeDeclaration = supportedType && typeof reference === "string" && reference.trim() !== "" && typeof reason === "string" && reason.trim() !== "";

  return {
    status: completeDeclaration ? "declared" : "verification-unknown",
    type,
    reference,
    reason,
    validity: "unverified",
    statusReason: completeDeclaration ? null : "verification-unknown: customization declaration requires type patch or wrapper, reference, and reason.",
  };
};

const measure = async (root, { baselinePath, customizationsSpec, upstreamCheckoutsPath }) => {
  const lockPath = resolve(root, ".skill-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const skills = lock?.skills;
  if (!skills || typeof skills !== "object" || Array.isArray(skills)) {
    throw new Error(".skill-lock.json の skills がオブジェクトではありません。");
  }

  const [baseline, customizations, upstreamCheckouts] = await Promise.all([
    readBaseline(baselinePath),
    readCustomizations(customizationsSpec),
    readUpstreamCheckouts(upstreamCheckoutsPath),
  ]);
  const records = [];
  for (const [name, entry] of Object.entries(skills)) {
    if (isStockSkill(name, entry)) continue;

    const { digest, directory, reason } = await localDigestFor(root, name);
    const lockHash = typeof entry?.skillFolderHash === "string" ? entry.skillFolderHash : null;
    const upstream = measureUpstreamEvidence(entry, upstreamCheckouts, lock.version);
    const baselineRecordResult = baselineRecordFor(baseline, name);
    const localComparison = compareLocalDigest(baseline, baselineRecordResult, digest, reason);
    records.push({
      name,
      directory,
      source: entry?.source ?? null,
      sourceType: entry?.sourceType ?? null,
      sourceUrl: entry?.sourceUrl ?? null,
      skillPath: entry?.skillPath ?? null,
      installedAt: entry?.installedAt ?? null,
      updatedAt: entry?.updatedAt ?? null,
      lockMetadata: entry && typeof entry === "object" && !Array.isArray(entry) ? entry : null,
      lockHash,
      upstreamTreeSha: upstream.treeSha,
      upstream,
      localContentDigest: digest,
      baselineLocalContentDigest: baselineRecordResult.record?.localContentDigest ?? null,
      localComparison: localComparison.status,
      localComparisonReason: localComparison.reason,
      lockComparison: compareLockHash(baseline, baselineRecordResult, lockHash),
      upstreamComparison: compareUpstreamLock(entry, upstream),
      customization: customizationFor(customizations, name),
      status: "verification-unknown",
      reason,
    });
  }

  return {
    digestAlgorithm: DIGEST_ALGORITHM,
    baseline: {
      inputPath: baseline.inputPath,
      status: baseline.status,
      algorithmId: baseline.algorithmId,
      reason: baseline.reason,
    },
    customizationsInput: {
      path: customizations.path,
      source: customizations.source,
      status: customizations.status,
      reason: customizations.reason,
    },
    upstreamCheckoutsInput: {
      path: upstreamCheckouts.inputPath,
      status: upstreamCheckouts.status,
      reason: upstreamCheckouts.reason,
    },
    records,
  };
};

const main = async () => {
  try {
    const { root, ...options } = parseArgs(process.argv.slice(2));
    const report = await measure(root, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
