import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const stopWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'use', 'when', 'with'])
const normativePattern = /\b(MUST|NEVER|ALWAYS)\b|必須|禁止|原則/giu
const unique = (values) => [...new Set(values)]
const usage = 'Usage: node bin/audit-skills-consistency.mjs [project-root] [--allow-pair path-a path-b]... [--changed path]...'

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

const collectSkillFiles = async (directory) => {
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
    if (entry.isDirectory()) files.push(...await collectSkillFiles(entryPath))
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

  for (const filePath of files) {
    const source = await readFile(filePath, 'utf8')
    const relativePath = path.relative(resolvedRoot, filePath).split(path.sep).join('/')
    const metadata = parseFrontmatter(source)
    inventory.push({ path: relativePath, name: metadata.name, description: metadata.description })
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
    } else {
      throw new Error(usage)
    }
  }
  return { projectRoot, options: { allowlistedPairs, changedPaths } }
}

const runCli = async () => {
  const args = process.argv.slice(2)
  const { projectRoot, options } = parseCliArgs(args)
  const result = await auditSkills(projectRoot, options)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
