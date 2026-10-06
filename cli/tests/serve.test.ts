import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { proposeMode, temporaryFolder, writeFiles } from './fixtures.ts'

const main = join(import.meta.dir, '..', 'src', 'main.ts')

test('serve prints its socket, answers over it, and removes it when stopped', async () => {
  const home = temporaryFolder()
  const store = temporaryFolder()
  writeFiles(home, { 'cmods/modes/propose.md': proposeMode })
  const child = Bun.spawn(['bun', main, 'serve'], { env: { ...process.env, CLAUDE_CONFIG_DIR: home, CLAUDE_MODES_HOME: store }, stdout: 'pipe' })
  const reader = child.stdout.getReader()
  const first = new TextDecoder().decode((await reader.read()).value).trim()
  const socketPath = first.replace(/^unix:/, '')

  const answer = await fetch('http://localhost/event', {
    method: 'POST',
    unix: socketPath,
    body: JSON.stringify({ session: { id: 's1', projectRoot: temporaryFolder(), cwd: '/', defaultMode: '' }, event: 'SessionStart', input: { source: 'startup' } }),
  })
  const missing = await fetch('http://localhost/nothing', { method: 'POST', unix: socketPath, body: '{}' })

  expect(first).toBe(`unix:${join(store, 'run', `${child.pid}.sock`)}`)
  expect(await answer.json()).toMatchObject({ modes: { main: 'propose', agents: {} } })
  expect(missing.status).toBe(404)
  expect(existsSync(join(store, 'sessions.db'))).toBe(true)

  child.kill('SIGTERM')
  await child.exited
  expect(existsSync(socketPath)).toBe(false)
})

test('the command line lists, shows, and moves sessions between modes', async () => {
  const home = temporaryFolder()
  const store = temporaryFolder()
  const project = temporaryFolder()
  writeFiles(home, { 'cmods/modes/propose.md': proposeMode, 'cmods/modes/build.md': '---\norder: 2\n---\nBuild.\n' })
  const transcript = join(temporaryFolder(), 'session-9.jsonl')
  writeFiles('/', {
    [transcript]: `${JSON.stringify({ type: 'user', uuid: 'u1', cwd: project, timestamp: '2026-01-01T10:00:00.000Z', message: { role: 'user', content: 'Ship the release' } })}\n`,
  })
  const run = (...args: string[]) => {
    const result = Bun.spawnSync(['bun', main, ...args], { env: { ...process.env, CLAUDE_CONFIG_DIR: home, CLAUDE_MODES_HOME: store }, cwd: project })
    return { code: result.exitCode, out: result.stdout.toString().trim(), err: result.stderr.toString().trim() }
  }

  expect(run('import', transcript)).toEqual({ code: 0, out: 'Imported session-9: 1 messages in 1 turns.', err: '' })
  expect(run('set', 'session-9', 'mode', 'build').code).toBe(0)
  expect(run('current', '--field', 'mode').out).toBe('build')
  expect(run('show', 'session-9').out).toBe('Ship the release\n  turn: Ship the release\n    mode: build (command claude-modes set)')
  expect(run('set', 'session-9', 'mode', 'ship')).toMatchObject({ code: 1, err: expect.stringContaining('"ship" is not a mode') })
  expect(run('check', project)).toMatchObject({ code: 0, out: expect.stringContaining('propose  2 gates') })
})
