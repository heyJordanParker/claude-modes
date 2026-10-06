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
  - write: "**"
    except: ["docs/plans/**"]
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

let clock = Date.parse('2026-10-07T10:00:00.000Z')

export function row(fields: Readonly<Record<string, unknown>>): string {
  clock += 1000
  return JSON.stringify({ timestamp: new Date(clock).toISOString(), sessionId: 'session-1', cwd: '/work/app', ...fields })
}

export function transcriptRows(): string[] {
  return [
    row({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'Add a login page' } }),
    row({ type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [{ type: 'text', text: 'I will look at the routes first.' }, { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls src' } }] } }),
    row({ type: 'user', uuid: 'r1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ls: src: No such file', is_error: true }] } }),
    row({ type: 'assistant', uuid: 'a2', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_2', name: 'Agent', input: { description: 'Find the router', prompt: 'Find the router' } }] } }),
    row({ type: 'user', uuid: 'r2', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: [{ type: 'text', text: 'It is app/router.ts' }] }] } }),
    row({ type: 'assistant', uuid: 'a3', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_3', name: 'Skill', input: { skill: 'build' } }] } }),
    row({ type: 'user', uuid: 's1', isMeta: true, sourceToolUseID: 'toolu_3', message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: /home/me/.claude/skills/build\n\n# Build' }] } }),
    row({ type: 'system', subtype: 'compact_boundary', uuid: 'c1', compactMetadata: { trigger: 'auto' } }),
    row({ type: 'user', uuid: 'cs1', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued...' } }),
    row({ type: 'user', uuid: 'u2', message: { role: 'user', content: '<command-name>/review</command-name>\n<command-args>login</command-args>' } }),
    row({ type: 'assistant', uuid: 'a4', message: { role: 'assistant', content: [{ type: 'text', text: 'The login page looks right.' }] } }),
    row({ type: 'custom-title', customTitle: 'login work' }),
  ]
}

export function subagentRows(): string[] {
  return [
    row({ type: 'user', uuid: 'su1', isSidechain: true, agentId: 'agent-x', message: { role: 'user', content: 'Find the router' } }),
    row({ type: 'assistant', uuid: 'sa1', isSidechain: true, agentId: 'agent-x', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_s1', name: 'Grep', input: { pattern: 'router' } }] } }),
    row({ type: 'user', uuid: 'sr1', isSidechain: true, agentId: 'agent-x', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_s1', content: 'app/router.ts' }] } }),
    row({ type: 'assistant', uuid: 'sa2', isSidechain: true, agentId: 'agent-x', message: { role: 'assistant', content: [{ type: 'text', text: 'It is app/router.ts' }] } }),
  ]
}

export function writeTranscript(root: string, rows: readonly string[], subagent: readonly string[] = []): string {
  const path = join(root, 'projects', 'session-1.jsonl')
  writeFiles(root, { 'projects/session-1.jsonl': `${rows.join('\n')}\n` })
  if (subagent.length > 0) {
    writeFiles(root, {
      'projects/session-1/subagents/agent-agent-x.jsonl': `${subagent.join('\n')}\n`,
      'projects/session-1/subagents/agent-agent-x.meta.json': JSON.stringify({ agentType: 'explorer', description: 'Find the router', toolUseId: 'toolu_2' }),
    })
  }
  return path
}
