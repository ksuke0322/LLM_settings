import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { auditSkills, compareSkillLocks } from './audit-skills-consistency.mjs'

const makeProject = async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'skill-audit-'))
  t.after(async () => await rm(projectRoot, { recursive: true, force: true }))
  return projectRoot
}

const addSkill = async (projectRoot, folder, { name, description, body = '' }) => {
  const filePath = path.join(projectRoot, 'skills', folder, 'SKILL.md')
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `---\nname: ${name}\ndescription: ${description}\n---\n${body}`)
}

const writeLock = async (projectRoot, fileName, lock) => {
  const filePath = path.join(projectRoot, fileName)
  await writeFile(filePath, JSON.stringify(lock))
  return filePath
}

const lockFor = (skills) => ({ version: 1, skills })

const runCli = (projectRoot, args) => {
  const scriptPath = new URL('./audit-skills-consistency.mjs', import.meta.url)
  return spawnSync(process.execPath, [scriptPath.pathname, projectRoot, ...args], { encoding: 'utf8' })
}

test('finds recursive candidates and reports advisory wording and folder mismatches', async (t) => {
  const projectRoot = await makeProject(t)
  await addSkill(projectRoot, 'alpha', {
    name: 'alpha',
    description: 'Review security for user input and output',
    body: '# Rules\nMUST preserve unknown evidence.\nALWAYS retain input hashes.\n必須: 理由を記録。\n禁止: 推測で補わない。\n原則として候補に留める。\n'
  })
  await addSkill(projectRoot, 'group/beta', {
    name: 'beta',
    description: 'Review security for user input and output',
    body: 'NEVER infer success.\n'
  })
  await addSkill(projectRoot, 'mismatch', {
    name: 'different-name',
    description: 'Prepare unrelated slide presentations'
  })

  const result = await auditSkills(projectRoot)

  assert.deepEqual(Object.keys(result).sort(), ['candidates', 'inventory', 'warnings'])
  assert.deepEqual(result.inventory, [
    { path: 'skills/alpha/SKILL.md', name: 'alpha', description: 'Review security for user input and output' },
    { path: 'skills/group/beta/SKILL.md', name: 'beta', description: 'Review security for user input and output' },
    { path: 'skills/mismatch/SKILL.md', name: 'different-name', description: 'Prepare unrelated slide presentations' }
  ])
  assert.equal(result.candidates.length, 1)
  assert.deepEqual(
    [result.candidates[0].left, result.candidates[0].right],
    ['skills/alpha/SKILL.md', 'skills/group/beta/SKILL.md']
  )
  assert.ok(result.candidates[0].similarity > 0)
  assert.ok(result.candidates[0].sharedTerms.length >= 2)

  const alphaWarnings = result.warnings.filter(({ path: file }) => file === 'skills/alpha/SKILL.md')
  assert.deepEqual(alphaWarnings.map(({ line }) => line), [6, 7, 8, 9, 10])
  assert.ok(alphaWarnings.every(({ reason }) => typeof reason === 'string' && reason.length > 0))
  assert.ok(result.warnings.some(({ path: file, line }) => file === 'skills/group/beta/SKILL.md' && line === 5))
  assert.ok(result.warnings.some(({ kind, path: file, line }) => kind === 'name-folder-mismatch' && file === 'skills/mismatch/SKILL.md' && line === 2))
  assert.ok(result.candidates.every(({ verdict }) => verdict === undefined))
})

test('allowlist suppresses only the exact pair and changed paths limit candidate pairs', async (t) => {
  const projectRoot = await makeProject(t)
  for (const folder of ['alpha', 'beta', 'gamma']) {
    await addSkill(projectRoot, folder, {
      name: folder,
      description: 'Review security for user input and output',
      body: folder === 'gamma' ? 'MUST retain evidence.\n' : ''
    })
  }

  const allowlisted = await auditSkills(projectRoot, {
    allowlistedPairs: [['skills/beta/SKILL.md', 'skills/alpha/SKILL.md']]
  })
  assert.deepEqual(allowlisted.candidates.map(({ left, right }) => [left, right]), [
    ['skills/alpha/SKILL.md', 'skills/gamma/SKILL.md'],
    ['skills/beta/SKILL.md', 'skills/gamma/SKILL.md']
  ])

  const changed = await auditSkills(projectRoot, { changedPaths: ['skills/alpha/SKILL.md'] })
  assert.deepEqual(changed.candidates.map(({ left, right }) => [left, right]), [
    ['skills/alpha/SKILL.md', 'skills/beta/SKILL.md'],
    ['skills/alpha/SKILL.md', 'skills/gamma/SKILL.md']
  ])
  assert.equal(changed.inventory.length, 3)
  assert.ok(changed.warnings.some(({ path: file }) => file === 'skills/gamma/SKILL.md'))
})

test('excludes stock skill directories and stock-shared from the full audit and changed-path candidates', async (t) => {
  const projectRoot = await makeProject(t)
  await addSkill(projectRoot, 'alpha', {
    name: 'alpha',
    description: 'Review security for user input and output'
  })

  const stockFolders = [
    'high-beta-daily-flow',
    'japan-high-beta-breakout-screening',
    'japan-top-companies-screening',
    'market-regime-assessment',
    'portfolio-risk-allocator',
    'stock-investment-decision-support',
    'stock-investment-position-review',
    'stock-shared'
  ]
  for (const folder of stockFolders) {
    await addSkill(projectRoot, folder, {
      name: folder,
      description: 'Review security for user input and output',
      body: 'MUST retain evidence.\n'
    })
  }

  const result = await auditSkills(projectRoot)
  const changedStockPath = `skills/${stockFolders.find((folder) => folder !== 'stock-shared')}/SKILL.md`
  const changed = await auditSkills(projectRoot, {
    changedPaths: [changedStockPath]
  })
  const stockPaths = new Set(stockFolders.map((folder) => `skills/${folder}/SKILL.md`))
  assert.deepEqual({
    inventoryPaths: result.inventory.map(({ path: file }) => file),
    stockCandidatePaths: [
      ...new Set(result.candidates.flatMap(({ left, right }) => [left, right]).filter((file) => stockPaths.has(file)))
    ].sort(),
    stockWarningPaths: [
      ...new Set(result.warnings.map(({ path: file }) => file).filter((file) => stockPaths.has(file)))
    ].sort(),
    changedCandidatePairs: changed.candidates
      .filter(({ left, right }) => left === changedStockPath || right === changedStockPath)
      .map(({ left, right }) => [left, right]),
    changedInventoryPaths: changed.inventory.map(({ path: file }) => file),
    changedWarningPaths: changed.warnings.map(({ path: file }) => file)
  }, {
    inventoryPaths: ['skills/alpha/SKILL.md'],
    stockCandidatePaths: [],
    stockWarningPaths: [],
    changedCandidatePairs: [],
    changedInventoryPaths: ['skills/alpha/SKILL.md'],
    changedWarningPaths: []
  })
})

test('reports duplicate non-empty skill names independently of descriptions and pair filters', async (t) => {
  const projectRoot = await makeProject(t)
  const skills = [
    ['alpha', 'shared', 'Plan a local architecture'],
    ['group/branch/shared', 'shared', 'Prepare a distant calendar'],
    ['zeta', 'shared', 'Compose unrelated music'],
    ['pair-a', 'pair', 'Compare local charts'],
    ['pair-b', 'pair', 'Model weather conditions'],
    ['nested-alias/skills/private-name', 'private-name', 'Audit privacy controls'],
    ['empty-one', '', 'Write a unique description'],
    ['empty-two', '', 'Read another unrelated description'],
    ['stock-shared', 'shared', 'Excluded stock content']
  ]
  for (const [folder, name, description] of skills) {
    await addSkill(projectRoot, folder, { name, description })
  }

  const result = await auditSkills(projectRoot, {
    allowlistedPairs: [['skills/alpha/SKILL.md', 'skills/zeta/SKILL.md']],
    changedPaths: ['skills/alpha/SKILL.md']
  })
  const duplicates = result.warnings.filter(({ kind }) => kind === 'duplicate-skill-name')

  assert.deepEqual(Object.keys(result).sort(), ['candidates', 'inventory', 'warnings'])
  assert.equal(duplicates.length, 2)
  assert.deepEqual(duplicates[0], {
    kind: 'duplicate-skill-name',
    path: 'skills/alpha/SKILL.md',
    line: 2,
    reason: 'same non-empty frontmatter name appears in multiple static Skill placements; review placement only, runtime duplicate activation is not established',
    name: 'shared',
    relatedPaths: [
      'skills/alpha/SKILL.md',
      'skills/group/branch/shared/SKILL.md',
      'skills/zeta/SKILL.md'
    ]
  })
  assert.deepEqual(duplicates[1], {
    kind: 'duplicate-skill-name',
    path: 'skills/pair-a/SKILL.md',
    line: 2,
    reason: 'same non-empty frontmatter name appears in multiple static Skill placements; review placement only, runtime duplicate activation is not established',
    name: 'pair',
    relatedPaths: ['skills/pair-a/SKILL.md', 'skills/pair-b/SKILL.md']
  })
  assert.equal(result.candidates.length, 0)

  const run = runCli(projectRoot, ['--allow-pair', 'skills/alpha/SKILL.md', 'skills/zeta/SKILL.md', '--changed', 'skills/alpha/SKILL.md'])
  assert.equal(run.status, 0, run.stderr)
  const cliResult = JSON.parse(run.stdout)
  assert.deepEqual(Object.keys(cliResult).sort(), ['candidates', 'inventory', 'warnings'])
  assert.deepEqual(cliResult.warnings.filter(({ kind }) => kind === 'duplicate-skill-name'), duplicates)
  assert.equal(run.stderr, '')
})

test('CLI accepts explicit allow-pair and changed-path options', async (t) => {
  const projectRoot = await makeProject(t)
  for (const folder of ['alpha', 'beta', 'gamma']) {
    await addSkill(projectRoot, folder, {
      name: folder,
      description: 'Review security for user input and output'
    })
  }

  const scriptPath = new URL('./audit-skills-consistency.mjs', import.meta.url)
  const run = spawnSync(process.execPath, [
    scriptPath.pathname,
    projectRoot,
    '--allow-pair', 'skills/alpha/SKILL.md', 'skills/beta/SKILL.md',
    '--changed', 'skills/alpha/SKILL.md'
  ], { encoding: 'utf8' })

  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout)
  assert.deepEqual(result.candidates.map(({ left, right }) => [left, right]), [
    ['skills/alpha/SKILL.md', 'skills/gamma/SKILL.md']
  ])
  assert.equal(result.inventory.length, 3)
  assert.deepEqual(result.warnings, [])
  assert.equal(run.stderr, '')
})

test('current skill inventory surfaces the two issue-known description pairs', async () => {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const { candidates } = await auditSkills(projectRoot)
  const candidatePairs = new Set(candidates.map(({ left, right }) => [left, right].sort().join(' <> ')))
  const expectedPairs = [
    ['skills/playwright-skill/SKILL.md', 'skills/web_e2e_test/SKILL.md'],
    ['skills/swiftui-expert-skill/SKILL.md', 'skills/swiftui-pro/SKILL.md']
  ]
  const missingPairs = expectedPairs
    .filter((pair) => !candidatePairs.has([...pair].sort().join(' <> ')))
    .map((pair) => pair.join(' <> '))

  assert.deepEqual(missingPairs, [], `expected pairs missing from candidates: ${missingPairs.join('; ')}`)
})

test('candidate evidence points to inline and block description lines', async (t) => {
  const projectRoot = await makeProject(t)
  const inlinePath = path.join(projectRoot, 'skills', 'alpha', 'SKILL.md')
  const blockPath = path.join(projectRoot, 'skills', 'beta', 'SKILL.md')
  await mkdir(path.dirname(inlinePath), { recursive: true })
  await mkdir(path.dirname(blockPath), { recursive: true })
  await writeFile(inlinePath, '---\nname: alpha\ndescription: shared semantic domain workflow\n---\n')
  await writeFile(blockPath, '---\nname: beta\ndescription: >-\n  shared semantic domain workflow for related systems\n---\n')

  const { candidates } = await auditSkills(projectRoot)

  assert.equal(candidates.length, 1)
  assert.deepEqual([candidates[0].leftLine, candidates[0].rightLine], [3, 4])
})

test('compareSkillLocks ignores object key and array order changes', () => {
  const before = lockFor({
    alpha: {
      skillPath: 'alpha/SKILL.md',
      nested: { first: 1, second: 2 },
      labels: ['one', 'two']
    }
  })
  const after = lockFor({
    alpha: {
      labels: ['two', 'one'],
      nested: { second: 2, first: 1 },
      skillPath: 'alpha/SKILL.md'
    }
  })

  assert.deepEqual(compareSkillLocks(before, after), [])
})

test('compareSkillLocks reports added, updated, and removed keys with field names', () => {
  const before = lockFor({
    updated: { source: 'registry', skillPath: 'updated/SKILL.md', sourceUrl: 'https://old.example' },
    removed: { source: 'registry', skillPath: 'removed/SKILL.md' }
  })
  const after = lockFor({
    updated: { source: 'registry', skillPath: 'updated/SKILL.md', sourceUrl: 'https://new.example', updatedAt: '2026-10-17' },
    added: { source: 'github', skillPath: 'added/SKILL.md' }
  })

  assert.deepEqual(compareSkillLocks(before, after), [
    { action: 'added', key: 'added', changedFields: ['skillPath', 'source'] },
    { action: 'removed', key: 'removed', changedFields: ['skillPath', 'source'] },
    { action: 'updated', key: 'updated', changedFields: ['sourceUrl', 'updatedAt'] }
  ])
})

test('CLI adds review-only lock rows and excludes stock keys and paths', async (t) => {
  const projectRoot = await makeProject(t)
  await addSkill(projectRoot, 'updated', { name: 'updated', description: 'Review local skill changes' })
  await addSkill(projectRoot, 'removed', { name: 'removed', description: 'Review removed lock entry' })
  const baseLock = await writeLock(projectRoot, 'base-lock.json', lockFor({
    updated: { source: 'registry', sourceUrl: 'https://old.example', skillPath: 'updated/SKILL.md' },
    removed: { source: 'registry', skillPath: 'removed/SKILL.md' },
    'high-beta-daily-flow': { skillPath: 'high-beta-daily-flow/SKILL.md' },
    ordinary: { skillPath: 'stock-shared/SKILL.md' }
  }))
  const currentLock = await writeLock(projectRoot, 'current-lock.json', lockFor({
    updated: { source: 'registry', sourceUrl: 'https://new.example', skillPath: 'updated/SKILL.md' },
    added: { source: 'github', skillPath: 'added/SKILL.md' },
    'high-beta-daily-flow': { skillPath: 'high-beta-daily-flow/SKILL.md', updatedAt: '2026-10-17' },
    ordinary: { skillPath: 'stock-shared/SKILL.md', updatedAt: '2026-10-17' }
  }))

  const run = runCli(projectRoot, ['--base-lock', baseLock, '--current-lock', currentLock])

  assert.equal(run.status, 0, run.stderr)
  const { lockReview } = JSON.parse(run.stdout)
  assert.deepEqual(lockReview.map(({ action, key }) => [action, key]), [
    ['added', 'added'],
    ['removed', 'removed'],
    ['updated', 'updated']
  ])
  const added = lockReview.find(({ key }) => key === 'added')
  assert.equal(added.status, 'review-required')
  assert.deepEqual(added.changedFields, ['skillPath', 'source'])
  assert.equal(added.localSkillPath, 'skills/added/SKILL.md')
  assert.equal(added.exists, false)
  assert.match(added.reason, /unknown/i)
  const updated = lockReview.find(({ key }) => key === 'updated')
  assert.equal(updated.status, 'review-required')
  assert.deepEqual(updated.changedFields, ['sourceUrl'])
  assert.equal(updated.exists, true)
  const removed = lockReview.find(({ key }) => key === 'removed')
  assert.equal(removed.status, 'reported-only')
  assert.deepEqual(removed.changedFields, ['skillPath', 'source'])
  assert.match(removed.reason, /unknown/i)
  assert.ok(lockReview.every(({ key }) => !['high-beta-daily-flow', 'ordinary'].includes(key)))
  assert.equal(run.stderr, '')
})

test('CLI reports a clear error for a partial lock pair or invalid lock schema', async (t) => {
  const projectRoot = await makeProject(t)
  const baseLock = await writeLock(projectRoot, 'base-lock.json', lockFor({}))
  const invalidLock = await writeLock(projectRoot, 'invalid-lock.json', { version: 1, skills: [] })

  const partial = runCli(projectRoot, ['--base-lock', baseLock])
  assert.equal(partial.status, 1)
  assert.match(partial.stderr, /both --base-lock and --current-lock/i)

  const invalid = runCli(projectRoot, ['--base-lock', invalidLock, '--current-lock', baseLock])
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /invalid.*lock schema/i)
})
