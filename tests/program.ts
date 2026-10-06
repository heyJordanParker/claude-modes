import type { HookStream, HttpResponse, ProcessSpawnChunk, ProcessSpawnResult } from 'claude-code'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Fakes } from '../node_modules/@cmodjs/core/testing.js'

const main = join(import.meta.dir, '..', 'cli', 'src', 'main.ts')

const children: { kill(): void }[] = []

export function stopPrograms(): void {
  for (const child of children.splice(0)) child.kill()
}

export function temporaryFolder(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'modes-mod-')))
}

export function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

export function useRealProgram(fakes: Fakes, configHome: string): void {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_MODES_HOME: temporaryFolder() }

  fakes.process.spawn = (request) => {
    const child = Bun.spawn(['bun', main, ...request.argv.slice(1)], { env, stdout: 'pipe', stderr: 'ignore' })
    children.push(child)
    async function* pieces(): AsyncGenerator<ProcessSpawnChunk, ProcessSpawnResult> {
      for await (const chunk of child.stdout) yield { stream: 'stdout', text: new TextDecoder().decode(chunk) }
      return { code: await child.exited, signal: null }
    }
    return Object.assign(pieces(), { result: child.exited.then((code) => ({ code, signal: null })) }) as unknown as HookStream<ProcessSpawnChunk, ProcessSpawnResult>
  }

  fakes.http.fetch = async (url, init) => {
    const response = await fetch(url, {
      method: init?.method ?? 'GET',
      ...(init?.headers === undefined ? {} : { headers: init.headers }),
      ...(init?.body === undefined ? {} : { body: init.body }),
      ...(init?.socketPath === undefined ? {} : { unix: init.socketPath }),
    })
    const answer: HttpResponse = { status: response.status, ok: response.ok, headers: Object.fromEntries(response.headers), text: await response.text() }
    return answer
  }
}

export const modeFiles = {
  'cmods/modes/propose.md': `---
order: 1
description: plan before you build
deny:
  - write: "**"
    except: ["docs/plans/**"]
    reason: Write plans only.
  - command: git commit
---
You are proposing.
`,
  'cmods/modes/build.md': `---
order: 2
deny:
  - subagent: "*"
---
You are building.
`,
  'cmods/modes/commit.md': `---
order: 3
lasts: turn
after:
  - command: git commit
    enter: propose
---
Commit, then stop.
`,
}
