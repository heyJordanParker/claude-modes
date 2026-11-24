import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { proposeMode, temporaryFolder, writeFiles } from './fixtures.ts'

const main = join(import.meta.dir, '..', 'src', 'main.ts')

test('serve prints its local address, and answers only the mod that holds its token', async () => {
  const home = temporaryFolder()
  const store = temporaryFolder()
  writeFiles(home, { 'cmods/modes/propose.md': proposeMode })
  const child = Bun.spawn(['bun', main, 'serve'], { env: { ...process.env, CLAUDE_CONFIG_DIR: home, CLAUDE_MODES_HOME: store, CLAUDE_MODES_TOKEN: 'token-1' }, stdout: 'pipe' })
  const reader = child.stdout.getReader()
  const address = new TextDecoder().decode((await reader.read()).value).trim()
  const post = (path: string, body: unknown, token = 'token-1') => fetch(`http://${address}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })

  const answer = await post('/event', { session: { id: 's1', projectRoot: temporaryFolder(), cwd: '/', defaultMode: '' }, event: 'SessionStart', input: { source: 'startup' }, commands: [] })
  const missing = await post('/nothing', {})
  const stranger = await post('/event', {}, 'guess')

  expect(address).toMatch(/^127\.0\.0\.1:\d+$/)
  expect(await answer.json()).toMatchObject({ modes: { main: 'propose', agents: {} } })
  expect(missing.status).toBe(404)
  expect(stranger.status).toBe(401)
  expect(existsSync(join(store, 'sessions.db'))).toBe(true)

  child.kill('SIGTERM')
  expect(await child.exited).toBe(0)
})

test('serve refuses to start without a token, so nothing but its mod reaches the store', () => {
  const run = Bun.spawnSync(['bun', main, 'serve'], { env: { ...process.env, CLAUDE_MODES_HOME: temporaryFolder(), CLAUDE_MODES_TOKEN: '' } })

  expect(run.exitCode).toBe(2)
  expect(run.stderr.toString()).toContain('sets CLAUDE_MODES_TOKEN')
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

test('a session imported on one machine writes back the same transcript on another', () => {
  const store = temporaryFolder()
  const otherMachine = temporaryFolder()
  const project = temporaryFolder()
  const lines = [
    JSON.stringify({ type: 'user', uuid: 'u1', cwd: project, timestamp: '2026-01-01T10:00:00.000Z', message: { role: 'user', content: 'Ship the release' } }),
    JSON.stringify({ type: 'assistant', uuid: 'a1', cwd: project, timestamp: '2026-01-01T10:01:00.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Shipped.' }] } }),
  ]
  const transcript = join(temporaryFolder(), 'session-7.jsonl')
  writeFiles('/', { [transcript]: `${lines.join('\n')}\n` })
  const run = (...args: string[]) => Bun.spawnSync(['bun', main, ...args], { env: { ...process.env, CLAUDE_CONFIG_DIR: otherMachine, CLAUDE_MODES_HOME: store } })

  expect(run('import', transcript).exitCode).toBe(0)
  const exported = run('export', 'session-7', '--as', 'claude')
  const written = join(otherMachine, 'projects', project.replace(/[^A-Za-z0-9]/g, '-'), 'session-7.jsonl')

  expect(exported.stdout.toString().trim()).toBe(`Wrote ${written}. Resume it with: claude --resume session-7`)
  expect(readFileSync(written, 'utf8')).toBe(`${lines.join('\n')}\n`)
  expect(run('export', 'session-7', '--as', 'claude').exitCode).toBe(1)
})
