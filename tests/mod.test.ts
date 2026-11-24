import { afterEach, expect, test } from 'bun:test'
import { join } from 'node:path'
import { BelowPrompt, Prompt } from '../node_modules/@cmodjs/core/mod.js'
import { claudeCodeOf } from '../node_modules/@cmodjs/core/testing/claude-code.js'
import { testMod } from '../node_modules/@cmodjs/core/testing.js'
import { modes } from '../src/mod.js'
import type { ListedRule } from '../types/index.js'
import { modeFiles, stopPrograms, temporaryFolder, useRealProgram, writeFiles } from './program.js'

afterEach(stopPrograms)

const rulebook = { name: 'rulebook/Rules', mod: 'rulebook', methods: { rules: () => [] } } as const

async function started(files: Readonly<Record<string, string>> = {}, options: { readonly defaultMode?: string } = {}, providers: readonly [typeof rulebook & { readonly isStarted?: false }] = [rulebook]) {
  const home = temporaryFolder()
  const project = temporaryFolder()
  writeFiles(home, { ...modeFiles, ...files })
  const tested = testMod(modes, { projectRoot: project, options, providers })
  useRealProgram(tested.fakes, home)
  await tested.raise.beforeSessionStart({ source: 'startup' })
  await tested.settle()
  return { tested, home, project }
}

const check = (tool: string, input: Record<string, unknown>) => ({ tool, input, tool_use_id: `toolu_${tool}` }) as never

const rule = (id: string, mode?: string): ListedRule => ({ id, description: id, severity: 'error', metadata: mode === undefined ? {} : { mode } })

test('a session starts in the first mode, Claude reads its rules, and the widget shows it', async () => {
  const { tested } = await started()

  const context = await tested.fire('prompt.context', { blocks: [] } as never, { blocks: [] } as never)

  expect(JSON.stringify(context)).toContain('Mode: propose (plan before you build)\\n\\nYou are proposing.')
  expect(await tested.lines(BelowPrompt)).toEqual(['mode: propose'])
})

test('Claude lists the modes in order, with their gates, and the mode the session is in', async () => {
  const { tested } = await started()
  await tested.type('/build')

  const listed = await tested.callTool('list_modes', {})

  expect(listed).toEqual({
    result: [
      'The modes, in order. The session is in build.',
      '- propose: plan before you build',
      '  refuses edits to ** except docs/plans/**',
      '  refuses git commit',
      '- build (the session is in it)',
      '  refuses every subagent',
      '- commit',
      '  lasts one turn',
      '  enters propose after git commit',
    ].join('\n'),
  })
})

test('a new mode gives Claude its rules once, as a note', async () => {
  const { tested } = await started()
  await tested.fire('prompt.context', { blocks: [] } as never, { blocks: [] } as never)

  await tested.type('/mode')
  await tested.settle()

  expect(tested.shown.notes).toEqual(['# Mode\nMode: build\n\nYou are building.'])
})

test('a new session starts in the mode the defaultMode option names', async () => {
  const { tested } = await started({}, { defaultMode: 'build' })

  expect(tested.state.memory.modes.main).toBe('build')
})

test('propose refuses an edit in the tree and allows a plan, with the mode in the reason', async () => {
  const { tested, project } = await started()

  const edit = await tested.fire('tool.check', check('Write', { file_path: join(project, 'src/app.ts'), content: 'x' }), { decision: 'allow' })
  const plan = await tested.fire('tool.check', check('Write', { file_path: join(project, 'docs/plans/login.md'), content: 'x' }), { decision: 'allow' })
  const commit = await tested.fire('tool.check', check('Bash', { command: 'git commit -m wip' }), { decision: 'allow' })

  expect(edit).toEqual({ decision: 'deny', reason: 'propose mode refuses edits to ** except docs/plans/**. Write plans only.' })
  expect(plan).toEqual({ decision: 'allow' })
  expect(commit).toEqual({ decision: 'deny', reason: 'propose mode refuses git commit.' })
})

test('/mode moves to the next mode, the hotkey to the one after, and build refuses subagents', async () => {
  const { tested } = await started()

  expect(await tested.type('/mode')).toEqual({})
  const dispatch = await tested.fire('tool.check', check('Agent', { subagent_type: 'explorer', prompt: 'look' }), { decision: 'allow' })
  expect(tested.state.memory.modes.main).toBe('build')
  expect(dispatch).toEqual({ decision: 'deny', reason: 'build mode refuses every subagent.' })

  await tested.hotkey('cycle')
  expect(tested.state.memory.modes.main).toBe('commit')
  expect(await tested.type('/mode ship')).toEqual({ text: '/mode failed: "ship" is not a mode. The modes are propose, build, commit.' })
})

test('each mode gets a slash command of its own', async () => {
  const { tested } = await started()

  await tested.type('/build')

  expect(tested.state.memory.modes.main).toBe('build')
})

test('a commit in commit mode enters propose and tells Claude', async () => {
  const { tested } = await started()
  await tested.type('/mode commit')

  const result = await claudeCodeOf(tested).fire('tool.call', { tool: 'Bash', command: 'git commit -m "ship"', tool_use_id: 'toolu_1' } as never, { result: 'committed' } as never)

  expect(JSON.stringify(result)).toContain('The session is now in propose mode.')
  expect(tested.state.memory.modes.main).toBe('propose')
})

test('a hook script answers the prompt it names, and a saved change applies to the next one', async () => {
  const { tested, home } = await started({ 'cmods/modes/hooks/remind.ts': "export default { on: 'UserPromptSubmit', run: () => ({ context: 'Reply in English.' }) }\n" })

  expect(await tested.raise.beforePrompt({ text: 'hi' })).toEqual({ note: 'Reply in English.' })

  writeFiles(home, { 'cmods/modes/hooks/remind.ts': "export default { on: 'UserPromptSubmit', run: () => ({ context: 'Reply in French.' }) }\n" })
  await Bun.sleep(300)

  expect(await tested.raise.beforePrompt({ text: 'hi' })).toEqual({ note: 'Reply in French.' })
})

test('a hook script asks before a tool call, and its context reaches Claude with the call', async () => {
  const { tested } = await started({
    'cmods/modes/hooks/careful.ts': "export default { on: 'PreToolUse', run: (input) => input.tool_name === 'Bash' ? { ask: 'Shell commands need a look.' } : { context: `Reading ${input.files.read[0]}.` } }\n",
  })
  await tested.add({ type: Prompt, text: 'go' })

  const shell = await tested.fire('tool.check', check('Bash', { command: 'ls' }), { decision: 'allow' })
  await tested.fire('tool.check', check('Read', { file_path: '/work/a.ts' }), { decision: 'allow' })
  const read = await claudeCodeOf(tested).fire('tool.call', { tool: 'Read', input: { file_path: '/work/a.ts' }, tool_use_id: 'toolu_Read' } as never, { result: 'export {}' } as never)

  expect(shell).toEqual({ decision: 'ask', reason: 'Shell commands need a look.' })
  expect(read).toEqual({ result: 'export {}', context: ['<modes_mod>\nReading /work/a.ts.\n</modes_mod>'] })
})

test("a subagent's first prompt gives it the SubagentStart hook scripts' context, with its agent type, and its mode", async () => {
  const { tested } = await started({ 'cmods/modes/hooks/brief.ts': "export default { on: 'SubagentStart', run: (input) => ({ context: `You are ${input.agent_type}.` }) }\n" })
  const task = await tested.startTask({ title: 'Map the code', agentType: 'Explore' })

  const first = await tested.raise.beforePrompt({ text: 'map it' }, { task })
  const second = await tested.raise.beforePrompt({ text: 'and the tests' }, { task })

  expect(first).toEqual({ note: 'You are Explore.\n\nMode: propose (plan before you build)\n\nYou are proposing.' })
  expect(second).toBeUndefined()
})

test('a hook script that fails refuses the call, and the Modes view lists the failure', async () => {
  const { tested } = await started({ 'cmods/modes/hooks/vault.ts': "export default { on: 'PreToolUse', run() { throw new Error('the vault is locked') } }\n" })

  const answer = await tested.fire('tool.check', check('Read', { file_path: '/a' }), { decision: 'allow' })
  await tested.type('/modes')

  expect(answer).toEqual({ decision: 'deny', reason: 'The vault hook failed, so it denies the call: the vault is locked' })
  expect((await tested.shown.view.lines()).join('\n')).toContain('vault.ts: the vault is locked')
})

test('the Modes view lists every mode with its gates, transitions, and the starting mode', async () => {
  const { tested } = await started()

  await tested.type('/modes')
  const shown = (await tested.shown.view.lines()).join('\n')

  expect(shown).toContain('refuses edits to ** except docs/plans/**')
  expect(shown).toContain('New sessions start in the first mode.')
  expect(shown).toContain('enters propose after git commit')
})

test('another mod reads the mode, enters one, and fills the mode tab', async () => {
  const { tested } = await started()

  expect(await tested.api['current']?.({})).toEqual({ mode: 'propose' })
  await tested.api['enter']?.({ mode: 'build', by: 'review-mod' })
  await tested.api['showTab']?.({ title: 'Review', markdown: '# Checklist' })
  await tested.type('/modes')

  expect(tested.state.memory.modes.main).toBe('build')
  expect((await tested.shown.view.lines()).join('\n')).toContain('Checklist')
})

test("rulebook turns a rule off for an agent outside the rule's mode, and leaves it on inside it", async () => {
  const { tested } = await started()
  await tested.type('/mode build')
  await tested.api['enter']?.({ mode: 'propose', agentId: 'agent-7', by: 'test' })
  const rules = [rule('no-code-while-proposing', 'propose'), rule('no-secrets')]

  const builder = await tested.providers[0].ask('Check', { path: '/work/src/app.ts', session: 'test-session', rules })
  const proposer = await tested.providers[0].ask('Check', { path: '/work/src/app.ts', session: 'test-session', task: 'agent-7', rules })

  expect(builder).toEqual([{ rules: { 'no-code-while-proposing': 'off' } }])
  expect(proposer).toEqual([])
})

test('a rulebook that starts after Modes gets its rules turned off by mode', async () => {
  const { tested } = await started({}, {}, [{ ...rulebook, isStarted: false }])

  tested.providers[0].start()
  await tested.settle()
  const answers = await tested.providers[0].ask('Check', { path: '/work/src/app.ts', session: 'test-session', rules: [rule('build-only', 'build')] })

  expect(answers).toEqual([{ rules: { 'build-only': 'off' } }])
})
