import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { proposeMode, temporaryFolder, writeFiles } from './fixtures.ts'

const main = join(import.meta.dir, '..', 'src', 'main.ts')

test('serve prints its local address, and answers only the mod that holds its token', async () => {
  const home = temporaryFolder()
  writeFiles(home, { 'cmods/modes/propose.md': proposeMode })
  const child = Bun.spawn(['bun', main, 'serve'], { env: { ...process.env, CLAUDE_CONFIG_DIR: home, CLAUDE_MODES_TOKEN: 'token-1' }, stdout: 'pipe' })
  const reader = child.stdout.getReader()
  const address = new TextDecoder().decode((await reader.read()).value).trim()
  const post = (path: string, body: unknown, token = 'token-1') => fetch(`http://${address}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })

  const answer = await post('/definitions', { projectRoot: temporaryFolder() })
  const missing = await post('/nothing', {})
  const stranger = await post('/definitions', {}, 'guess')

  expect(address).toMatch(/^127\.0\.0\.1:\d+$/)
  expect(await answer.json()).toMatchObject({ modes: [{ name: 'propose' }] })
  expect(missing.status).toBe(404)
  expect(stranger.status).toBe(401)

  child.kill('SIGTERM')
  expect(await child.exited).toBe(0)
})

test('serve refuses to start without a token, so nothing but its mod reaches it', () => {
  const run = Bun.spawnSync(['bun', main, 'serve'], { env: { ...process.env, CLAUDE_MODES_TOKEN: '' } })

  expect(run.exitCode).toBe(2)
  expect(run.stderr.toString()).toContain('sets CLAUDE_MODES_TOKEN')
})
