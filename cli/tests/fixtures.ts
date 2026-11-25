import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export function temporaryFolder(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'claude-modes-')))
}

export function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

export const proposeMode = `---
order: 1
description: plan before you build
deny:
  - write: ["**", "!docs/plans/**"]
    reason: Propose mode writes plans only.
  - command: git commit
---
You are proposing. You change no file and make no commit.
`

export const buildMode = `---
order: 2
deny:
  - subagent: "*"
    reason: Build mode does the work itself.
---
You are building.
`

export const commitMode = `---
order: 3
lasts: turn
after:
  - command: git commit
    enter: propose
---
Commit the work, then stop.
`
