import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { auditSkills } from './audit-skills-consistency.mjs'

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
