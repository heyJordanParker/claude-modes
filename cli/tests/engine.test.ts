import { expect, test } from 'bun:test'
import type { SessionRef } from '../../src/protocol.ts'
import { createCatalog } from '../src/definitions/catalog.ts'
import { createEngine } from '../src/engine.ts'
import { openStore } from '../src/store/store.ts'
import { buildMode, commitMode, proposeMode, subagentRows, temporaryFolder, transcriptRows, writeFiles, writeTranscript } from './fixtures.ts'

function setUp(files: Readonly<Record<string, string>> = {}) {
  const home = temporaryFolder()
  writeFiles(home, { 'cmods/modes/propose.md': proposeMode, 'cmods/modes/build.md': buildMode, 'cmods/modes/commit.md': commitMode, ...files })
  const store = openStore(':memory:')
  const engine = createEngine(store, createCatalog(home))
  const session: SessionRef = { id: 'session-1', projectRoot: temporaryFolder(), cwd: '/work/app', defaultMode: '' }
  const fire = (event: string, input: Record<string, unknown> = {}) => engine.event({ session, event, input })
  return { home, store, engine, session, fire }
}

test('a session starts in the first mode and reads its rules', async () => {
  const { fire } = setUp()

  const answer = await fire('SessionStart', { source: 'startup' })

  expect(answer.modes).toEqual({ main: 'propose', agents: {} })
  expect(answer.effects).toEqual([{ context: 'Mode: propose (plan before you build)\n\nYou are proposing. You change no file and make no commit.' }])
})

test('a session starts in the default mode, or in the mode its Agent names', async () => {
  const fromDefault = setUp()
  const answer = await fromDefault.engine.event({ session: { ...fromDefault.session, defaultMode: 'build' }, event: 'SessionStart', input: { source: 'startup' } })
  expect(answer.modes.main).toBe('build')

  const fromAgent = setUp({ 'agents/builder.md': '---\nmode: build\n---\n' })
  expect((await fromAgent.fire('SessionStart', { source: 'startup', agent_type: 'builder' })).modes.main).toBe('build')
})

test('a Skill that names a mode enters it, and Claude reads the rules once', async () => {
  const { fire } = setUp({ 'skills/ship/SKILL.md': '---\nmode: build\n---\nShip it.\n' })
  await fire('SessionStart', { source: 'startup' })

  const loaded = await fire('PostToolUse', { tool_name: 'Skill', tool_input: { skill: 'ship' }, tool_use_id: 'toolu_1' })
  const next = await fire('PostToolUse', { tool_name: 'Read', tool_input: {}, tool_use_id: 'toolu_2' })

  expect(loaded.modes.main).toBe('build')
  expect(loaded.effects).toEqual([{ context: 'Mode: build\n\nYou are building.' }])
  expect(next.effects).toEqual([])
})

test('a mode that lasts a turn returns to the mode before it when the turn ends', async () => {
  const { engine, session, fire } = setUp()
  await fire('SessionStart', { source: 'startup' })
  await engine.enter({ session, mode: 'build', agentId: undefined, cause: { kind: 'command', name: 'build' } })
  await engine.enter({ session, mode: 'commit', agentId: undefined, cause: { kind: 'command', name: 'commit' } })

  const prompt = await fire('UserPromptSubmit', { prompt: 'commit it' })
  const stop = await fire('Stop', { stop_hook_active: false })

  expect(prompt.effects).toEqual([{ context: 'Mode: commit\n\nCommit the work, then stop.' }])
  expect(stop.modes.main).toBe('build')
  expect(engine.entries('session-1').map(({ mode, cause }) => [mode, cause.kind])).toEqual([
    ['propose', 'start'],
    ['build', 'command'],
    ['commit', 'command'],
    ['build', 'turn-end'],
  ])
})

test('a subagent starts in the mode its Agent names and reads that mode', async () => {
  const { fire } = setUp({ 'agents/explorer.md': '---\nmode: propose\n---\n' })
  await fire('SessionStart', { source: 'startup', agent_type: 'none' })

  const answer = await fire('SubagentStart', { agent_id: 'agent-x', agent_type: 'explorer' })

  expect(answer.modes).toEqual({ main: 'propose', agents: { 'agent-x': 'propose' } })
  expect(answer.effects).toEqual([{ context: 'Mode: propose (plan before you build)\n\nYou are proposing. You change no file and make no commit.' }])
})

test('a hook script runs only in its modes, and an effect its event cannot take is a problem', async () => {
  const { engine, session, fire } = setUp({
    'cmods/modes/hooks/no-revert.ts':
      "import { defineHook } from 'claude-modes'\nexport default defineHook({ on: 'PreToolUse', mode: 'build', run: (_input, { commands }) => commands.some(([program, verb]) => program === 'git' && verb === 'restore') ? { deny: 'Fix forward.' } : undefined })\n",
    'cmods/modes/hooks/wrong.ts': "export default { on: 'SessionEnd', run: () => ({ deny: 'no' }) }\n",
  })
  await fire('SessionStart', { source: 'startup' })
  const restore = { tool_name: 'Bash', tool_input: { command: 'cd app && git restore src/a.ts' }, tool_use_id: 'toolu_1' }

  const inPropose = await fire('PreToolUse', restore)
  await engine.enter({ session, mode: 'build', agentId: undefined, cause: { kind: 'command', name: 'build' } })
  const inBuild = await fire('PreToolUse', restore)
  await fire('SessionEnd', {})

  expect(inPropose.effects).toEqual([])
  expect(inBuild.effects).toEqual([{ deny: 'Fix forward.' }, { context: 'Mode: build\n\nYou are building.' }])
  expect((await engine.definitions(session.projectRoot)).problems.map(({ message }) => message)).toContain('it answered deny on SessionEnd, which takes no effect.')
})

test('a hook script that throws on PreToolUse denies the call with its error', async () => {
  const { fire } = setUp({ 'cmods/modes/hooks/broken.ts': "export default { on: 'PreToolUse', run() { throw new Error('the token expired') } }\n" })

  const answer = await fire('PreToolUse', { tool_name: 'Read', tool_input: {}, tool_use_id: 'toolu_1' })

  expect(answer.effects).toEqual([{ deny: 'The broken hook failed, so it denies the call: the token expired' }])
})

test('entering a mode no file defines is refused with the modes there are', async () => {
  const { engine, session } = setUp()
  expect(engine.enter({ session, mode: 'ship', agentId: undefined, cause: { kind: 'command', name: 'ship' } })).rejects.toThrow('"ship" is not a mode. The modes are propose, build, commit.')
})

test('the transcript becomes contexts, turns, tasks, and messages, once', async () => {
  const { store, fire } = setUp()
  const transcript = writeTranscript(temporaryFolder(), transcriptRows(), subagentRows())

  await fire('SessionStart', { source: 'startup', transcript_path: transcript })
  await fire('Stop', { stop_hook_active: false, transcript_path: transcript })

  expect(store.contexts('session-1').map(({ reason }) => reason)).toEqual(['start', 'compacted (auto)'])
  expect(store.turns('session-1').map(({ prompt_id }) => prompt_id)).toEqual(['u1', 'cs1', 'u2'])
  expect(store.tasks('session-1').map(({ id, parent_id, agent_type, title }) => [id, parent_id, agent_type, title])).toEqual([
    ['session-1', null, null, 'login work'],
    ['agent-x', 'session-1', 'explorer', 'Find the router'],
  ])
  expect(store.messages('session-1').map(({ kind, text }) => `${kind}: ${text.split('\n')[0]}`)).toEqual([
    'prompt: Add a login page',
    'reply: I will look at the routes first.',
    'tool call: ls src',
    'tool result: ls: src: No such file',
    'tool call: Find the router',
    'tool result: It is app/router.ts',
    'tool call: build',
    'skill: /home/me/.claude/skills/build',
    'notice: The conversation was compacted.',
    'notice: Continued after compaction',
    'prompt: /review login',
    'reply: The login page looks right.',
    'prompt: Find the router',
    'tool call: router',
    'tool result: app/router.ts',
    'reply: It is app/router.ts',
  ])
})
