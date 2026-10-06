import { afterEach, expect, test } from 'bun:test'
import { join } from 'node:path'
import { testMod } from '../node_modules/@cmodjs/core/testing.js'
import { modes } from '../src/mod.js'
import { modeFiles, stopPrograms, temporaryFolder, useRealProgram, writeFiles } from './program.js'

afterEach(stopPrograms)

let clock = Date.parse('2026-01-01T09:00:00.000Z')
const row = (fields: Readonly<Record<string, unknown>>) => {
  clock += 60_000
  return JSON.stringify({ timestamp: new Date(clock).toISOString(), ...fields })
}

const transcript = [
  row({ type: 'user', uuid: 'u1', message: { content: 'Add a login page' } }),
  row({ type: 'assistant', uuid: 'a1', message: { content: [{ type: 'text', text: 'Reading the routes first.' }, { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls src' } }] } }),
  row({ type: 'user', uuid: 'r1', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'No such file', is_error: true }] } }),
  row({ type: 'assistant', uuid: 'a2', message: { content: [{ type: 'tool_use', id: 'toolu_2', name: 'Agent', input: { description: 'Find the router' } }] } }),
  row({ type: 'user', uuid: 'u2', message: { content: 'Now style it' } }),
  row({ type: 'assistant', uuid: 'a3', message: { content: [{ type: 'tool_use', id: 'toolu_3', name: 'Edit', input: { file_path: '/app/login.css' } }] } }),
]

const subagent = [
  row({ type: 'user', uuid: 's1', message: { content: 'Find the router' } }),
  row({ type: 'assistant', uuid: 's2', message: { content: [{ type: 'tool_use', id: 'toolu_s1', name: 'Grep', input: { pattern: 'router' } }] } }),
]

async function panelWithHistory() {
  const home = temporaryFolder()
  const sessions = temporaryFolder()
  writeFiles(home, modeFiles)
  writeFiles(sessions, {
    'session-1.jsonl': `${transcript.join('\n')}\n`,
    'session-1/subagents/agent-a1.jsonl': `${subagent.join('\n')}\n`,
    'session-1/subagents/agent-a1.meta.json': JSON.stringify({ agentType: 'explorer', description: 'Find the router', toolUseId: 'toolu_2' }),
  })
  const tested = testMod(modes, { projectRoot: temporaryFolder() })
  useRealProgram(tested.fakes, home)
  await tested.fire('SessionStart', { source: 'startup', transcript_path: join(sessions, 'session-1.jsonl') })
  await tested.type('/modes')
  await tested.settle()
  return tested
}

test('History shows each prompt as a turn, with its tool calls, failures, and subagents under it', async () => {
  const tested = await panelWithHistory()

  expect((await tested.lines('modes')).filter((line) => line.trim() !== '')).toEqual([
    'History Settings',
    'Add a login page',
    'mode propose · 3 calls · 1 failed',
    'Tasks Show: all Expand all Collapse all',
    'Find:',
    ' ▸ you    Add a login page 2 1✗',
    ' ▾ you    Now style it 1',
    '     tool   Edit /app/login.css',
    '     mode   propose (session start)',
  ])
})

test('pressing a turn opens it, and the dispatched subagent nests its own calls', async () => {
  const tested = await panelWithHistory()

  await tested.press('modes', 'toggle:turn:1')
  await tested.press('modes', 'toggle:task:a1')
  const rows = (await tested.lines('modes')).filter((line) => line.trim() !== '').slice(5, 12)

  expect(rows).toEqual([
    ' ▾ you    Add a login page 2 1✗',
    '     claude Reading the routes first.',
    '     tool   Bash ls src failed',
    '   ▾ agent  explorer: Find the router 1 running',
    '       prompt prompt: Find the router',
    '       tool   Grep router',
    ' ▾ you    Now style it 1',
  ])
})
