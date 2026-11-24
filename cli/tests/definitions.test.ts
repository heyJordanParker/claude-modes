import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createCatalog } from '../src/definitions/catalog.ts'
import { readModeFile } from '../src/definitions/mode-file.ts'
import { buildMode, commitMode, proposeMode, temporaryFolder, writeFiles } from './fixtures.ts'

test('a mode file holds its gates, how it ends, and its rules', () => {
  expect(readModeFile('/m/propose.md', proposeMode)).toEqual({
    name: 'propose',
    order: 1,
    description: 'plan before you build',
    rules: 'You are proposing. You change no file and make no commit.',
    deny: [{ write: ['**', '!docs/plans/**'], reason: 'Propose mode writes plans only.' }, { command: 'git commit' }],
    ask: [],
    after: [],
    source: '/m/propose.md',
  })
  expect(readModeFile('/m/commit.md', commitMode)).toMatchObject({ lasts: 'turn', after: [{ command: 'git commit', enter: 'propose' }] })
})

test("a mode file names its color as an Agent does, and another color is refused with the colors there are", () => {
  expect(readModeFile('/m/build.md', '---\ncolor: green\n---\n')).toMatchObject({ name: 'build', color: 'green' })
  expect(() => readModeFile('/m/build.md', '---\ncolor: teal\n---\n')).toThrow('color is "teal". Use one of red, blue, green, yellow, purple, orange, pink, cyan, as an Agent\'s color.')
})

test('a mode file with a rule that names two targets is refused with the fix', () => {
  expect(() => readModeFile('/m/bad.md', '---\ndeny:\n  - write: "**"\n    read: "**"\n---\n')).toThrow('deny[0] names read and write. Name exactly one of command, read, write, fetch, subagent, tool.')
  expect(() => readModeFile('/m/bad.md', '---\ngates: []\n---\n')).toThrow('"gates" is not a mode key.')
  expect(() => readModeFile('/m/bad.md', '---\ndeny:\n  - write: "**"\n    except: docs/**\n---\n')).toThrow('deny[0] has "except". A rule holds one target, and may add reason.')
  expect(() => readModeFile('/m/bad.md', '---\ndeny:\n  - write: "!docs/**"\n---\n')).toThrow('deny[0].write only leaves calls out. Add a pattern without "!" for them to leave out of, such as ["**", "!docs/**"].')
})

test('the catalog orders the modes, and a project mode replaces a personal one of the same name', async () => {
  const home = temporaryFolder()
  const project = temporaryFolder()
  writeFiles(home, { 'cmods/modes/build.md': buildMode, 'cmods/modes/propose.md': proposeMode })
  writeFiles(project, { '.claude/cmods/modes/build.md': '---\norder: 2\n---\nThe team builds.\n' })

  const { definitions } = await createCatalog(home).load(project)

  expect(definitions.modes.map(({ name, rules }) => [name, rules])).toEqual([
    ['propose', 'You are proposing. You change no file and make no commit.'],
    ['build', 'The team builds.'],
  ])
  expect(definitions.problems).toEqual([])
})

test('Agents and Skills enter modes through their metadata, and an unknown mode is a problem', async () => {
  const home = temporaryFolder()
  writeFiles(home, {
    'cmods/modes/propose.md': proposeMode,
    'agents/planner.md': '---\nname: planner\nmetadata:\n  modes.mode: propose\n---\nPlan.\n',
    'skills/plan/SKILL.md': '---\nname: plan\nmetadata:\n  modes.mode: propose\n---\nPlan.\n',
    'skills/ship/SKILL.md': '---\nmetadata:\n  modes.mode: shipping\n---\nShip.\n',
    'skills/old/SKILL.md': '---\nmode: propose\n---\nA top-level mode key is not Modes metadata.\n',
  })

  const loaded = await createCatalog(home).load(temporaryFolder())

  expect([...loaded.agentModes]).toEqual([['planner', 'propose']])
  expect([...loaded.skillModes]).toEqual([['plan', 'propose']])
  expect(loaded.definitions.problems).toEqual([{ source: join(home, 'skills/ship/SKILL.md'), message: 'metadata modes.mode: shipping names no mode file. Use one of propose.' }])
})

test('a hook script loads with the SDK, and its folder gets editor types', async () => {
  const home = temporaryFolder()
  writeFiles(home, {
    'cmods/modes/propose.md': proposeMode,
    'cmods/modes/hooks/no-revert.ts': "import { defineHook } from 'claude-modes'\nexport default defineHook({ on: 'PreToolUse', mode: 'propose', run: () => ({ deny: 'No reverts.' }) })\n",
    'cmods/modes/hooks/broken.ts': "export default { on: 'Lunch', run() {} }\n",
  })

  const loaded = await createCatalog(home).load(temporaryFolder())

  expect(loaded.definitions.hooks).toEqual([{ name: 'no-revert', source: join(home, 'cmods/modes/hooks/no-revert.ts'), events: ['PreToolUse'], modes: ['propose'] }])
  expect(loaded.definitions.problems.map(({ message }) => message)).toEqual([expect.stringContaining('on is "Lunch". Name one or more of SessionStart')])
  expect(existsSync(join(home, 'cmods/modes/hooks/claude-modes.d.ts'))).toBe(true)
  expect(existsSync(join(home, 'cmods/modes/hooks/tsconfig.json'))).toBe(true)
})

test('a saved change reaches the next load without a restart', async () => {
  const home = temporaryFolder()
  const project = temporaryFolder()
  writeFiles(home, { 'cmods/modes/hooks/note.ts': "export default { on: 'Stop', run: () => ({ context: 'one' }) }\n" })
  const catalog = createCatalog(home)
  const first = await catalog.load(project)
  expect(await first.scripts[0]?.run({} as never, {} as never)).toEqual({ context: 'one' })
  expect((await catalog.load(project)).definitions.version).toBe(first.definitions.version)

  await Bun.sleep(20)
  writeFiles(home, { 'cmods/modes/hooks/note.ts': "export default { on: 'Stop', run: () => ({ context: 'two' }) }\n", 'cmods/modes/build.md': buildMode })

  const second = await catalog.load(project)
  expect(second.definitions.version).toBe(first.definitions.version + 1)
  expect(await second.scripts[0]?.run({} as never, {} as never)).toEqual({ context: 'two' })
  expect(second.definitions.modes.map(({ name }) => name)).toEqual(['build'])
})
