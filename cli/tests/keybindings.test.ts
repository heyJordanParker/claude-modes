import { expect, test } from 'bun:test'
import { lstatSync, readFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { bindModeKey, unbindModeKey } from '../src/keybindings.ts'
import { temporaryFolder, writeFiles } from './fixtures.ts'

const read = (home: string) => JSON.parse(readFileSync(join(home, 'keybindings.json'), 'utf8')) as { bindings: { context: string; bindings: Record<string, unknown> }[] }

test('bind creates keybindings.json with shift+tab on /mode', () => {
  const home = temporaryFolder()

  expect(bindModeKey(home)).toEqual({ code: 0, text: `shift+tab now runs /mode. ${join(home, 'keybindings.json')} holds the binding.` })
  expect(read(home).bindings).toEqual([{ context: 'Chat', bindings: { 'shift+tab': 'command:mode' } }])
})

test('bind adds to the Chat block a person already has, and keeps every other binding', () => {
  const home = temporaryFolder()
  writeFiles(home, { 'keybindings.json': JSON.stringify({ bindings: [{ context: 'Global', bindings: { 'ctrl+t': null } }, { context: 'Chat', bindings: { 'ctrl+e': 'chat:externalEditor' } }] }) })

  bindModeKey(home)
  bindModeKey(home)

  expect(read(home).bindings).toEqual([
    { context: 'Global', bindings: { 'ctrl+t': null } },
    { context: 'Chat', bindings: { 'ctrl+e': 'chat:externalEditor', 'shift+tab': 'command:mode' } },
  ])
})

test('bind leaves shift+tab alone when the person bound it to something else', () => {
  const home = temporaryFolder()
  writeFiles(home, { 'keybindings.json': JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'shift+tab': 'chat:cycleMode' } }] }) })

  expect(bindModeKey(home)).toEqual({ code: 0, text: 'shift+tab already runs chat:cycleMode, so Modes left it. Bind "shift+tab": "command:mode" in the Chat context to switch modes with it.' })
  expect(read(home).bindings[0]?.bindings['shift+tab']).toBe('chat:cycleMode')
})

test('unbind removes only the binding Modes added', () => {
  const home = temporaryFolder()
  writeFiles(home, { 'keybindings.json': JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+e': 'chat:externalEditor', 'shift+tab': 'command:mode' } }] }) })

  expect(unbindModeKey(home).code).toBe(0)
  expect(read(home).bindings).toEqual([{ context: 'Chat', bindings: { 'ctrl+e': 'chat:externalEditor' } }])
})

test('bind writes through a symbolic link, so a stowed file stays a link', () => {
  const home = temporaryFolder()
  const dotfiles = temporaryFolder()
  writeFiles(dotfiles, { 'keybindings.json': JSON.stringify({ bindings: [] }) })
  symlinkSync(join(dotfiles, 'keybindings.json'), join(home, 'keybindings.json'))

  bindModeKey(home)

  expect(lstatSync(join(home, 'keybindings.json')).isSymbolicLink()).toBe(true)
  expect(read(dotfiles).bindings).toEqual([{ context: 'Chat', bindings: { 'shift+tab': 'command:mode' } }])
})

test('bind refuses a keybindings.json that is not JSON, and names the file', () => {
  const home = temporaryFolder()
  writeFiles(home, { 'keybindings.json': '{ broken' })

  expect(bindModeKey(home)).toMatchObject({ code: 1, text: expect.stringContaining(`${join(home, 'keybindings.json')} is not JSON`) })
})
