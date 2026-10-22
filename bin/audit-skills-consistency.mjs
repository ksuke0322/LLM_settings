import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const stopWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'use', 'when', 'with'])
const normativePattern = /\b(MUST|NEVER|ALWAYS)\b|必須|禁止|原則/giu
const excludedSkillDirectories = new Set([
  'high-beta-daily-flow',
  'japan-high-beta-breakout-screening',
  'japan-top-companies-screening',
  'market-regime-assessment',
  'portfolio-risk-allocator',
  'stock-investment-decision-support',
  'stock-investment-position-review',
  'stock-shared'
])
const unique = (values) => [...new Set(values)]
const usage = 'Usage: node bin/audit-skills-consistency.mjs [project-root] [--allow-pair path-a path-b]... [--changed path]... [--base-lock file --current-lock file]'

const normalizeOptionPath = (value) => value.trim().replaceAll('\\', '/').replace(/^(?:\.\/)+/u, '').replace(/\/+/gu, '/')

const pairKey = (left, right) => [left, right].sort((a, b) => a.localeCompare(b)).join('\0')

const normalizePathOptions = (paths, optionName) => {
  if (!Array.isArray(paths)) throw new TypeError(`${optionName} must be an array of project-relative paths`)
  return paths.map((value) => {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${optionName} entries must be non-empty paths`)
    return normalizeOptionPath(value)
  })
}

const normalizeAllowlist = (pairs) => {
  if (!Array.isArray(pairs)) throw new TypeError('allowlistedPairs must be an array of two-path pairs')
  return new Set(pairs.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('allowlistedPairs entries must contain exactly two paths')
    const [left, right] = normalizePathOptions(pair, 'allowlistedPairs')
    return pairKey(left, right)
  }))
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const validateSkillLock = (lock, label = 'input') => {
  const invalid = (reason) => {
    throw new TypeError(`Invalid ${label} lock schema: ${reason}`)
  }

  if (!isRecord(lock)) invalid('root must be an object')
  if (!Object.hasOwn(lock, 'skills') || !isRecord(lock.skills)) invalid('skills must be an object keyed by skill name')
  if (Object.hasOwn(lock, 'version') && (!Number.isInteger(lock.version) || lock.version < 1)) {
    invalid('version must be a positive integer when present')
  }
  if (Object.hasOwn(lock, 'dismissed') && !isRecord(lock.dismissed)) invalid('dismissed must be an object when present')
  if (Object.hasOwn(lock, 'lastSelectedAgents') && !Array.isArray(lock.lastSelectedAgents)) {
    invalid('lastSelectedAgents must be an array when present')
  }

  for (const [key, entry] of Object.entries(lock.skills)) {
    if (!key.trim() || key === '.' || key === '..' || key.includes('/') || key.includes('\\')) {
      invalid('skill keys must be non-empty directory names')
    }
    if (!isRecord(entry)) invalid(`skills.${key} must be an object`)
    for (const field of ['source', 'sourceType', 'sourceUrl', 'skillPath', 'skillFolderHash', 'installedAt', 'updatedAt']) {
      if (Object.hasOwn(entry, field) && typeof entry[field] !== 'string') {
        invalid(`skills.${key}.${field} must be a string when present`)
      }
    }
  }

  return lock
}

const canonicalize = (value) => {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  }
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, canonicalize(entryValue)])
  )
}

const areFieldValuesEqual = (leftEntry, rightEntry, field) => {
  const leftExists = Object.hasOwn(leftEntry, field)
  const rightExists = Object.hasOwn(rightEntry, field)
  if (leftExists !== rightExists) return false
  if (!leftExists) return true
  return JSON.stringify(canonicalize(leftEntry[field])) === JSON.stringify(canonicalize(rightEntry[field]))
}

const isStockLockEntry = (key, entry) => {
  if (excludedSkillDirectories.has(key)) return true
  if (typeof entry?.skillPath !== 'string') return false
  const segments = entry.skillPath.replaceAll('\\', '/').split('/')
  return segments.some((segment) => excludedSkillDirectories.has(segment))
}

/** Compare skill lock records without treating object or array ordering as a change. */
export const compareSkillLocks = (before, after) => {
  validateSkillLock(before, 'base')
  validateSkillLock(after, 'current')

  const beforeSkills = before.skills
  const afterSkills = after.skills
  const keys = unique([...Object.keys(beforeSkills), ...Object.keys(afterSkills)]).sort((left, right) => left.localeCompare(right))
  const changes = []

  for (const key of keys) {
    const beforeEntry = beforeSkills[key]
    const afterEntry = afterSkills[key]
    if (isStockLockEntry(key, beforeEntry) || isStockLockEntry(key, afterEntry)) continue

    const beforeExists = Object.hasOwn(beforeSkills, key)
    const afterExists = Object.hasOwn(afterSkills, key)
    if (beforeExists && afterExists) {
      const changedFields = unique([...Object.keys(beforeEntry), ...Object.keys(afterEntry)])
        .filter((field) => !areFieldValuesEqual(beforeEntry, afterEntry, field))
        .sort((left, right) => left.localeCompare(right))
      if (changedFields.length) changes.push({ action: 'updated', key, changedFields })
      continue
    }

    const entry = afterExists ? afterEntry : beforeEntry
    changes.push({
      action: afterExists ? 'added' : 'removed',
      key,
      changedFields: Object.keys(entry).sort((left, right) => left.localeCompare(right))
    })
  }

  return changes
}

const readSkillLock = async (filePath, label) => {
  let source
  try {
    source = await readFile(path.resolve(filePath), 'utf8')
  } catch (error) {
    throw new Error(`Unable to read ${label} lock JSON file: ${error.message}`)
  }

  let lock
  try {
    lock = JSON.parse(source)
  } catch (error) {
    throw new Error(`Invalid ${label} lock JSON: ${error.message}`)
  }
  return validateSkillLock(lock, label)
}

const localSkillExists = async (projectRoot, localSkillPath) => {
  const absolutePath = path.join(projectRoot, ...localSkillPath.split('/'))
  try {
    return (await stat(absolutePath)).isFile()
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false
    throw error
  }
}

const reviewSkillLockChanges = async (projectRoot, before, after) => {
  const changes = compareSkillLocks(before, after)
  const resolvedRoot = path.resolve(projectRoot)
  return Promise.all(changes.map(async (change) => {
    const localSkillPath = `skills/${change.key}/SKILL.md`
    const exists = await localSkillExists(resolvedRoot, localSkillPath)
    const baseEntryExists = Object.hasOwn(before.skills, change.key)
    const currentEntryExists = Object.hasOwn(after.skills, change.key)
    const unknownReasons = []
    if (!exists) unknownReasons.push(`local SKILL.md is missing at ${localSkillPath}`)
    if (!baseEntryExists) unknownReasons.push('base lock ledger entry is missing')
    if (!currentEntryExists) unknownReasons.push('current lock ledger entry is missing')
    const reason = unknownReasons.length
      ? `unknown: ${unknownReasons.join('; ')}; human review required`
      : `changed fields require human review: ${change.changedFields.join(', ')}`

    return {
      ...change,
      status: change.action === 'removed' ? 'reported-only' : 'review-required',
      localSkillPath,
      exists,
      baseEntryExists,
      currentEntryExists,
      reason
    }
  }))
}
const unquote = (value) => {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    const quote = trimmed[0]
    const inner = trimmed.slice(1, -1)
    return quote === "'" ? inner.replaceAll("''", "'") : inner
  }
  return trimmed
}

const parseFrontmatter = (source) => {
  const block = source.match(/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)
  if (!block) return { name: '', nameLine: 0, description: '', descriptionLine: 0 }

  const lines = block[1].split(/\r?\n/u)
  let name = ''
  let nameLine = 0
  let description = ''
  let descriptionLine = 0

  for (let index = 0; index < lines.length; index += 1) {
    const field = lines[index].match(/^(name|description):[ \t]*(.*)$/u)
    if (!field) continue

    const [, key, rawValue] = field
    const lineNumber = index + 2
    if (key === 'name') {
      name = unquote(rawValue)
      nameLine = lineNumber
      continue
    }

    if (/^[>|][+-]?$/.test(rawValue.trim())) {
      const folded = rawValue.trim().startsWith('>')
      const continuation = []
      while (index + 1 < lines.length && (/^[ \t]/u.test(lines[index + 1]) || lines[index + 1].trim() === '')) {
        index += 1
        const valueLine = lines[index]
        if (!descriptionLine && valueLine.trim()) descriptionLine = index + 2
        continuation.push(valueLine.trim() ? valueLine.trim() : '')
      }
      description = continuation.join(folded ? ' ' : '\n').trim()
    } else {
      description = unquote(rawValue)
      descriptionLine = lineNumber
    }
  }

  return { name, nameLine, description, descriptionLine }
}

const collectSkillFiles = async (directory, relativeDirectory = '') => {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }

  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name)
    const relativeEntryPath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name
    if (entry.isDirectory() && !excludedSkillDirectories.has(relativeEntryPath)) {
      files.push(...await collectSkillFiles(entryPath, relativeEntryPath))
    }
    else if (entry.isFile() && entry.name === 'SKILL.md') files.push(entryPath)
  }
  return files
}

const descriptionTokens = (description) => {
  const runs = description.toLocaleLowerCase().match(/[a-z0-9]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/giu) ?? []
  const tokens = new Set()
  for (const run of runs) {
    if (/^[a-z0-9]+$/u.test(run)) {
      if (!stopWords.has(run) && run.length > 1) tokens.add(run)
      continue
    }

    const characters = Array.from(run)
    for (let index = 0; index < characters.length - 1; index += 1) tokens.add(characters[index] + characters[index + 1])
  }
  return tokens
}

const compareDescriptions = (left, right) => {
  const leftTokens = descriptionTokens(left.description)
  const rightTokens = descriptionTokens(right.description)
  const sharedTerms = [...leftTokens].filter((term) => rightTokens.has(term)).sort((a, b) => a.localeCompare(b))
  const unionSize = new Set([...leftTokens, ...rightTokens]).size
  return { sharedTerms, similarity: unionSize ? sharedTerms.length / unionSize : 0 }
}

const round = (value) => Math.round(value * 1000) / 1000

const isPairSelected = (leftPath, rightPath, changedPaths, allowlist) => {
  const matchesChangedFilter = changedPaths.size === 0 || changedPaths.has(leftPath) || changedPaths.has(rightPath)
  return matchesChangedFilter && !allowlist.has(pairKey(leftPath, rightPath))
}

/**
 * Scan projectRoot/skills recursively. Candidate filters apply only to pairs;
 * inventory and warnings always cover every discovered skill. Results are review
 * candidates and warnings, not semantic consistency verdicts. The function only reads files.
 */
export const auditSkills = async (projectRoot = process.cwd(), {
  similarityThreshold = 0.3,
  allowlistedPairs = [],
  changedPaths = []
} = {}) => {
  const resolvedRoot = path.resolve(projectRoot)
  const files = await collectSkillFiles(path.join(resolvedRoot, 'skills'))
  const allowlist = normalizeAllowlist(allowlistedPairs)
  const changed = new Set(normalizePathOptions(changedPaths, 'changedPaths'))
  const inventory = []
  const skills = []
  const warnings = []
  const namePlacements = new Map()

  for (const filePath of files) {
    const source = await readFile(filePath, 'utf8')
    const relativePath = path.relative(resolvedRoot, filePath).split(path.sep).join('/')
    const metadata = parseFrontmatter(source)
    inventory.push({ path: relativePath, name: metadata.name, description: metadata.description })
    const name = metadata.name.trim()
    if (name) {
      const placements = namePlacements.get(name) ?? []
      placements.push({ path: relativePath, line: metadata.nameLine })
      namePlacements.set(name, placements)
    }
    if (metadata.description.trim()) {
      skills.push({ path: relativePath, name: metadata.name, description: metadata.description, descriptionLine: metadata.descriptionLine })
    }

    const folderName = path.basename(path.dirname(filePath))
    if (metadata.name && metadata.name !== folderName) {
      warnings.push({
        kind: 'name-folder-mismatch',
        path: relativePath,
        line: metadata.nameLine,
        reason: 'frontmatter name differs from the containing skill folder',
        actualName: metadata.name,
        expectedFolder: folderName
      })

    }

    source.split(/\r?\n/u).forEach((text, index) => {
      const matchedTerms = [...text.matchAll(normativePattern)].map(([term]) => term.toLocaleUpperCase())
      if (matchedTerms.length) {
        const distinctTerms = unique(matchedTerms)
        warnings.push({
          kind: 'normative-wording',
          path: relativePath,
          line: index + 1,
          reason: `strong normative wording (${distinctTerms.join(', ')}) merits human review`,
          matchedTerms: distinctTerms,
          text: text.trim()
        })
      }
    })
  }

  for (const [name, placements] of namePlacements) {
    if (placements.length < 2) continue
    const relatedPaths = placements.map(({ path: skillPath }) => skillPath).sort((left, right) => left.localeCompare(right))
    const firstPlacement = placements.find(({ path: skillPath }) => skillPath === relatedPaths[0])
    warnings.push({
      kind: 'duplicate-skill-name',
      path: relatedPaths[0],
      line: firstPlacement.line,
      reason: 'same non-empty frontmatter name appears in multiple static Skill placements; review placement only, runtime duplicate activation is not established',
      name,
      relatedPaths
    })
  }

  inventory.sort((left, right) => left.path.localeCompare(right.path))
  skills.sort((left, right) => left.path.localeCompare(right.path))
  const termDocumentFrequency = new Map()
  for (const { description } of skills) {
    for (const term of descriptionTokens(description)) {
      if (!/^[a-z0-9]+$/u.test(term)) continue
      termDocumentFrequency.set(term, (termDocumentFrequency.get(term) ?? 0) + 1)
    }
  }
  const rareTermLimit = Math.ceil(skills.length * 0.2)
  const candidates = []
  for (let leftIndex = 0; leftIndex < skills.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < skills.length; rightIndex += 1) {
      const left = skills[leftIndex]
      const right = skills[rightIndex]
      if (!isPairSelected(left.path, right.path, changed, allowlist)) continue
      const { sharedTerms, similarity } = compareDescriptions(left, right)
      const rareSharedTerms = sharedTerms.filter((term) => /^[a-z0-9]+$/u.test(term) && termDocumentFrequency.get(term) <= rareTermLimit)
      const similarityMatch = similarity >= similarityThreshold
      const rareTermMatch = rareSharedTerms.length >= 2
      if (sharedTerms.length < 2 || (!similarityMatch && !rareTermMatch)) continue

      const reasons = []
      if (similarityMatch) reasons.push(`description Jaccard similarity ${round(similarity)}`)
      if (rareTermMatch) reasons.push(`rare shared terms in at most ${rareTermLimit}/${skills.length} descriptions (${rareSharedTerms.join(', ')})`)
      candidates.push({
        left: left.path,
        right: right.path,
        leftLine: left.descriptionLine,
        rightLine: right.descriptionLine,
        similarity: round(similarity),
        sharedTerms,
        rareSharedTerms: rareTermMatch ? rareSharedTerms : [],
        reason: `${reasons.join('; ')}; exact shared terms: ${sharedTerms.join(', ')}; review manually`
      })
    }
  }

  candidates.sort((left, right) => right.similarity - left.similarity || left.left.localeCompare(right.left) || left.right.localeCompare(right.right))
  warnings.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.kind.localeCompare(right.kind))
  return { inventory, candidates, warnings }
}

const parseCliArgs = (args) => {
  let index = 0
  let projectRoot = process.cwd()
  if (args[0] && !args[0].startsWith('--')) {
    projectRoot = args[0]
    index = 1
  }

  const allowlistedPairs = []
  const changedPaths = []
  let baseLockPath
  let currentLockPath
  while (index < args.length) {
    const option = args[index]
    if (option === '--allow-pair') {
      const left = args[index + 1]
      const right = args[index + 2]
      if (!left || left.startsWith('--') || !right || right.startsWith('--')) throw new Error(usage)
      allowlistedPairs.push([left, right])
      index += 3
    } else if (option === '--changed') {
      const changedPath = args[index + 1]
      if (!changedPath || changedPath.startsWith('--')) throw new Error(usage)
      changedPaths.push(changedPath)
      index += 2
    } else if (option === '--base-lock' || option === '--current-lock') {
      const lockPath = args[index + 1]
      if (!lockPath || lockPath.startsWith('--')) throw new Error(`${option} requires a JSON file path`)
      if (option === '--base-lock') {
        if (baseLockPath) throw new Error('--base-lock may be specified only once')
        baseLockPath = lockPath
      } else {
        if (currentLockPath) throw new Error('--current-lock may be specified only once')
        currentLockPath = lockPath
      }
      index += 2
    } else {
      throw new Error(usage)
    }
  }
  if (Boolean(baseLockPath) !== Boolean(currentLockPath)) {
    throw new Error('Both --base-lock and --current-lock must be provided together')
  }
  return { projectRoot, options: { allowlistedPairs, changedPaths, baseLockPath, currentLockPath } }
}

const runCli = async () => {
  const args = process.argv.slice(2)
  const { projectRoot, options } = parseCliArgs(args)
  const { baseLockPath, currentLockPath, ...auditOptions } = options
  const lockPair = baseLockPath
    ? {
        before: await readSkillLock(baseLockPath, 'base'),
        after: await readSkillLock(currentLockPath, 'current')
      }
    : null
  const result = await auditSkills(projectRoot, auditOptions)
  if (lockPair) result.lockReview = await reviewSkillLockChanges(projectRoot, lockPair.before, lockPair.after)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
