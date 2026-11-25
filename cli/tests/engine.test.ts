import { expect, test } from 'bun:test'
import type { HookRequest } from '../../src/protocol.ts'
import { createCatalog } from '../src/definitions/catalog.ts'
import { createEngine } from '../src/engine.ts'
import { buildMode, commitMode, proposeMode, temporaryFolder, writeFiles } from './fixtures.ts'

function setUp(files: Readonly<Record<string, string>> = {}) {
  const home = temporaryFolder()
  const projectRoot = temporaryFolder()
  writeFiles(home, { 'cmods/modes/propose.md': proposeMode, 'cmods/modes/build.md': buildMode, 'cmods/modes/commit.md': commitMode, ...files })
  const engine = createEngine(createCatalog(home))
  const fire = (event: string, mode: string | undefined, input: Record<string, unknown> = {}, commands: string[][] = []) => {
    const request: HookRequest = { projectRoot, event, input, context: { session: { id: 'session-1', projectRoot, cwd: '/work/app' }, mode, agentId: undefined, commands } }
    return engine.hook(request)
  }
  return { engine, projectRoot, fire }
}

test('a hook script runs only in its modes, and an effect its event cannot take is a problem', async () => {
  const { engine, projectRoot, fire } = setUp({
    'cmods/modes/hooks/no-revert.ts':
      "import { defineHook } from 'claude-modes'\nexport default defineHook({ on: 'PreToolUse', mode: 'build', run: (_input, { commands }) => commands.some(([program, verb]) => program === 'git' && verb === 'restore') ? { deny: 'Fix forward.' } : undefined })\n",
    'cmods/modes/hooks/wrong.ts': "export default { on: 'SessionEnd', run: () => ({ deny: 'no' }) }\n",
  })
  const restore = { tool_name: 'Bash', tool_input: { command: 'cd app && git restore src/a.ts' }, tool_use_id: 'toolu_1' }
  const commands = [['cd', 'app'], ['git', 'restore', 'src/a.ts']]

  const inPropose = await fire('PreToolUse', 'propose', restore, commands)
  const inBuild = await fire('PreToolUse', 'build', restore, commands)
  await fire('SessionEnd', 'build')

  expect(inPropose.effects).toEqual([])
  expect(inBuild.effects).toEqual([{ deny: 'Fix forward.' }])
  expect((await engine.definitions(projectRoot)).problems.map(({ message }) => message)).toContain('it answered deny on SessionEnd, which takes no effect.')
})

test('a hook script that throws on PreToolUse denies the call with its error', async () => {
  const { fire } = setUp({ 'cmods/modes/hooks/broken.ts': "export default { on: 'PreToolUse', run() { throw new Error('the token expired') } }\n" })

  const answer = await fire('PreToolUse', 'propose', { tool_name: 'Read', tool_input: {}, tool_use_id: 'toolu_1' })

  expect(answer.effects).toEqual([{ deny: 'The broken hook failed, so it denies the call: the token expired' }])
})

test('a hook script enters a mode the files define, and naming another mode is a problem', async () => {
  const { engine, projectRoot, fire } = setUp({
    'cmods/modes/hooks/ship.ts': "export default { on: 'Stop', run: () => ({ enter: 'commit' }) }\n",
    'cmods/modes/hooks/lost.ts': "export default { on: 'Stop', run: () => ({ enter: 'lunch' }) }\n",
  })

  const answer = await fire('Stop', 'build', { stop_hook_active: false })

  expect(answer.effects).toEqual([{ enter: 'commit', hook: 'ship' }])
  expect((await engine.definitions(projectRoot)).problems.map(({ message }) => message)).toContain('"lunch" is not a mode. Define it in a mode file first.')
  expect(answer.version).toBe((await engine.definitions(projectRoot)).version)
})
