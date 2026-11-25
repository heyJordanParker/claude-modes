import { expect, test } from 'bun:test'
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { createCatalog } from '../src/definitions/catalog.ts'
import { createEngine } from '../src/engine.ts'
import { temporaryFolder } from './fixtures.ts'

const examples = join(import.meta.dir, '..', '..', 'examples')

test('the examples load with no problem, and their hooks answer as the README says', async () => {
  const home = temporaryFolder()
  cpSync(examples, join(home, 'cmods', 'modes'), { recursive: true })
  const engine = createEngine(createCatalog(home))
  const projectRoot = temporaryFolder()
  const bash = (command: string) =>
    engine.hook({ projectRoot, event: 'PreToolUse', input: { tool_name: 'Bash', tool_input: { command }, tool_use_id: 'toolu_1' }, context: { session: { id: 's1', projectRoot, cwd: '/' }, mode: 'build', agentId: undefined, commands: [command.split(' ')] } })

  const definitions = await engine.definitions(projectRoot)

  expect(definitions.problems).toEqual([])
  expect(definitions.modes.map(({ name }) => name)).toEqual(['propose', 'build', 'review', 'commit'])
  expect(definitions.hooks.map(({ name }) => name)).toEqual(['no-revert', 'tests-after-edit'])
  expect((await bash('git reset --hard HEAD')).effects).toEqual([{ deny: 'Reverting files throws away work that other agents may share. Fix forward instead.' }])
  expect((await bash('git status')).effects).toEqual([])
})
