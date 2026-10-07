import { expect, test } from 'bun:test'
import { chmodSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { temporaryFolder, writeFiles } from './fixtures.ts'

const root = join(import.meta.dir, '..', '..')

test('the install step binds shift+tab, and the uninstall step gives it back', () => {
  const home = temporaryFolder()
  const bin = temporaryFolder()
  writeFiles(bin, { 'claude-modes': `#!/bin/sh\nexec bun ${join(root, 'cli', 'src', 'main.ts')} "$@"\n` })
  chmodSync(join(bin, 'claude-modes'), 0o755)
  const env = { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}`, CLAUDE_CONFIG_DIR: home, CLAUDE_MODES_HOME: temporaryFolder() }
  const step = (script: string) => Bun.spawnSync(['sh', '-c', script], { cwd: root, env })
  const binding = () => (JSON.parse(readFileSync(join(home, 'keybindings.json'), 'utf8')) as { bindings: { bindings: Record<string, string> }[] }).bindings[0]?.bindings['shift+tab']

  const install = step('./setup/install.sh')
  expect(install.exitCode).toBe(0)
  expect(install.stdout.toString()).toContain('progress 1 1 Bound shift+tab to /mode')
  expect(binding()).toBe('command:mode')

  expect(step('./setup/uninstall.sh').exitCode).toBe(0)
  expect(binding()).toBeUndefined()
})
