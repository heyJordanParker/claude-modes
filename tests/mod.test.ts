import { afterEach, expect, test } from 'bun:test'
import type { RenderPropsOf } from 'claude-code'
import { join } from 'node:path'
import { testMod } from '../node_modules/@cmodjs/core/testing.js'
import { slots } from '../node_modules/@cmodjs/core/ui/slots.js'
import { modes } from '../src/mod.js'
import { modeFiles, stopPrograms, temporaryFolder, useRealProgram, writeFiles } from './program.js'

afterEach(stopPrograms)

const band: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 75, scroll: { offset: 0, bodyRows: 12 }, view: {} }

async function started(files: Readonly<Record<string, string>> = {}) {
  const home = temporaryFolder()
  const project = temporaryFolder()
  writeFiles(home, { ...modeFiles, ...files })
  const tested = testMod(modes, { projectRoot: project })
  useRealProgram(tested.fakes, home)
  await tested.fire('SessionStart', { source: 'startup' })
  await tested.settle()
  return { tested, home, project }
}

const check = (tool: string, input: Record<string, unknown>) => ({ tool, input, tool_use_id: `toolu_${tool}` }) as never

test('a session starts in the first mode, reads its rules, and the band shows it', async () => {
  const home = temporaryFolder()
  writeFiles(home, modeFiles)
  const tested = testMod(modes, { projectRoot: temporaryFolder() })
  useRealProgram(tested.fakes, home)

  const answer = await tested.fire('SessionStart', { source: 'startup' })

  expect(answer).toMatchObject({ additionalContext: ['Mode: propose (plan before you build)\n\nYou are proposing.'] })
  expect((await tested.lines(slots.AbovePrompt, band)).at(-1)).toBe('mode: propose')
})

test('propose refuses an edit in the tree and allows a plan, with the mode in the reason', async () => {
  const { tested, project } = await started()

  const edit = await tested.fire('tool.check', check('Write', { file_path: join(project, 'src/app.ts'), content: 'x' }), { decision: 'allow' })
  const plan = await tested.fire('tool.check', check('Write', { file_path: join(project, 'docs/plans/login.md'), content: 'x' }), { decision: 'allow' })
  const commit = await tested.fire('tool.check', check('Bash', { command: 'git commit -m wip' }), { decision: 'allow' })

  expect(edit).toEqual({ decision: 'deny', reason: `propose mode refuses edits to **. Write plans only.` })
  expect(plan).toEqual({ decision: 'allow' })
  expect(commit).toEqual({ decision: 'deny', reason: 'propose mode refuses git commit.' })
})

test('/mode moves to the next mode, and build refuses subagents', async () => {
  const { tested } = await started()

  expect(await tested.type('/mode')).toEqual({})
  const dispatch = await tested.fire('tool.check', check('Agent', { subagent_type: 'explorer', prompt: 'look' }), { decision: 'allow' })

  expect(tested.state.memory.modes.main).toBe('build')
  expect(dispatch).toEqual({ decision: 'deny', reason: 'build mode refuses every subagent.' })
  expect(await tested.type('/mode ship')).toEqual({ text: '/mode failed: "ship" is not a mode. The modes are propose, build, commit.' })
})

test('a commit in commit mode enters propose and tells Claude', async () => {
  const { tested } = await started()
  await tested.type('/mode commit')

  const result = await tested.fire('tool.call', check('Bash', { command: 'git commit -m "ship"' }), { result: 'committed' } as never)

  expect(result).toMatchObject({ context: ['The session is now in propose mode.'] })
  expect(tested.state.memory.modes.main).toBe('propose')
})

test('a hook script answers the event it names, and a saved change applies to the next one', async () => {
  const { tested, home } = await started({ 'cmods/modes/hooks/remind.ts': "export default { on: 'UserPromptSubmit', run: () => ({ context: 'Reply in English.' }) }\n" })

  expect(await tested.fire('UserPromptSubmit', { prompt: 'hi' })).toMatchObject({ additionalContext: ['Reply in English.'] })

  writeFiles(home, { 'cmods/modes/hooks/remind.ts': "export default { on: 'UserPromptSubmit', run: () => ({ context: 'Reply in French.' }) }\n" })
  await Bun.sleep(300)

  expect(await tested.fire('UserPromptSubmit', { prompt: 'hi' })).toMatchObject({ additionalContext: ['Reply in French.'] })
})

test('the panel opens on History and lists the modes on Settings', async () => {
  const { tested } = await started()

  await tested.type('/modes')
  const history = await tested.lines('modes')
  await tested.press('modes', 'tab-settings')
  const settings = await tested.lines('modes')

  expect(history.join('\n')).toContain('History')
  expect(settings.join('\n')).toContain('refuses edits to **')
  expect(settings.join('\n')).toContain('enters propose after git commit')
})

test('another mod reads the mode, enters one, and fills the mode tab', async () => {
  const { tested } = await started()
  const call = (method: string, input: Record<string, unknown>) => tested.fire('cmod.call', { to: 'modes', method, input } as never)

  expect(await call('current', {})).toMatchObject({ value: { mode: 'propose' } })
  await call('enter', { mode: 'build', by: 'review-mod' })
  await call('showTab', { title: 'Review', markdown: '# Checklist' })
  await tested.type('/modes')

  expect(tested.state.memory.modes.main).toBe('build')
  expect((await tested.lines('modes')).join('\n')).toContain('Checklist')
})
