import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { HistoryNode } from '../../src/protocol.ts'
import { createCatalog } from './definitions/catalog.ts'
import { historyOf } from './history.ts'
import type { Store } from './store/store.ts'
import { syncTranscript } from './transcript.ts'

export type Output = { readonly text: string; readonly code: number }

const ok = (text: string): Output => ({ text, code: 0 })
const failed = (text: string): Output => ({ text, code: 1 })

export function sessions(store: Store, limit: number): Output {
  const rows = store.sessions(limit)
  if (rows.length === 0) return ok('No sessions yet. Start claude with the Modes plugin, or run claude-modes import <transcript>.')
  return ok(
    rows
      .map((row) => {
        const mode = store.modeState(row.id).main ?? '-'
        return [row.id, new Date(row.updated_at).toISOString().slice(0, 16).replace('T', ' '), mode.padEnd(12), row.title ?? '', `(${row.project})`].join('  ')
      })
      .join('\n'),
  )
}

export function show(store: Store, sessionId: string, asJson: boolean): Output {
  const history = historyOf(store, sessionId)
  if (history === undefined) return failed(`No session ${sessionId}. Run claude-modes sessions to list them.`)
  if (asJson) return ok(JSON.stringify(history, null, 2))
  const lines: string[] = []
  const walk = (node: HistoryNode, depth: number) => {
    const counts = node.calls === undefined ? '' : `  [${node.calls} calls${node.errors === undefined ? '' : `, ${node.errors} failed`}]`
    lines.push(`${'  '.repeat(depth)}${node.kind === 'goal' ? '' : `${node.kind}: `}${node.label}${node.isRunning === true ? '  (running)' : ''}${counts}`)
    for (const child of node.children ?? []) walk(child, depth + 1)
  }
  walk(history.root, 0)
  return ok(lines.join('\n'))
}

export async function setMode(store: Store, configHome: string, sessionId: string, mode: string): Promise<Output> {
  const session = store.session(sessionId)
  if (session === null) return failed(`No session ${sessionId}. Run claude-modes sessions to list them.`)
  const { definitions } = await createCatalog(configHome).load(session.project)
  if (!definitions.modes.some(({ name }) => name === mode)) return failed(`"${mode}" is not a mode in ${session.project}. The modes are ${definitions.modes.map(({ name }) => name).join(', ') || 'not defined yet'}.`)
  store.enter(sessionId, undefined, mode, { kind: 'command', name: 'claude-modes set' }, Date.now())
  return ok(`${sessionId} is in ${mode} mode. The session reads its rules with the next prompt.`)
}

export function copy(store: Store, from: string, to: string): Output {
  if (store.session(from) === null) return failed(`No session ${from}.`)
  if (store.session(to) === null) return failed(`No session ${to}.`)
  store.copyModes(from, to, Date.now())
  return ok(`${to} is in ${store.modeState(to).main ?? 'no'} mode, as ${from} is.`)
}

export async function importTranscript(store: Store, path: string): Promise<Output> {
  const transcript = resolve(path)
  if (!existsSync(transcript)) return failed(`No file ${transcript}.`)
  const sessionId = basename(transcript, '.jsonl')
  const firstRow = readFileSync(transcript, 'utf8').split('\n').find((line) => line.includes('"cwd"'))
  const cwd = firstRow === undefined ? undefined : (JSON.parse(firstRow) as { readonly cwd?: unknown }).cwd
  const project = typeof cwd === 'string' ? cwd : dirname(transcript)
  store.ensureSession(sessionId, project, Date.now(), { transcript })
  await syncTranscript(store, sessionId, transcript)
  store.closeOpenTasks(sessionId, Date.now())
  return ok(`Imported ${sessionId}: ${store.messages(sessionId).length} messages in ${store.turns(sessionId).length} turns.`)
}

export function exportSession(store: Store, sessionId: string): Output {
  const session = store.session(sessionId)
  if (session === null) return failed(`No session ${sessionId}.`)
  return ok(
    JSON.stringify(
      {
        session,
        contexts: store.contexts(sessionId),
        turns: store.turns(sessionId),
        tasks: store.tasks(sessionId),
        modes: store.entries(sessionId),
        messages: store.messages(sessionId),
      },
      null,
      2,
    ),
  )
}

export function exportTranscript(store: Store, configHome: string, sessionId: string): Output {
  const session = store.session(sessionId)
  if (session === null) return failed(`No session ${sessionId}.`)
  const folder = join(configHome, 'projects', session.project.replace(/[^A-Za-z0-9]/g, '-'))
  const transcript = join(folder, `${sessionId}.jsonl`)
  if (existsSync(transcript)) return failed(`${transcript} already exists. Resume it with: claude --resume ${sessionId}`)
  const lines = store.rows(sessionId, undefined)
  if (lines.length === 0) return failed(`${sessionId} holds no transcript rows to write.`)
  mkdirSync(folder, { recursive: true })
  writeFileSync(transcript, `${lines.join('\n')}\n`)
  for (const task of store.tasks(sessionId).filter(({ parent_id }) => parent_id !== null)) {
    const rows = store.rows(sessionId, task.id)
    if (rows.length === 0) continue
    const subagents = join(folder, sessionId, 'subagents')
    mkdirSync(subagents, { recursive: true })
    writeFileSync(join(subagents, `agent-${task.id}.jsonl`), `${rows.join('\n')}\n`)
    writeFileSync(join(subagents, `agent-${task.id}.meta.json`), JSON.stringify({ agentType: task.agent_type, description: task.title, toolUseId: task.opened_by }))
  }
  return ok(`Wrote ${transcript}. Resume it with: claude --resume ${sessionId}`)
}

export function current(store: Store, cwd: string, field: string | undefined): Output {
  let folder = cwd
  for (;;) {
    const session = store.latestSessionIn(folder)
    if (session !== null) {
      if (field === undefined) return ok(`${session.id}  ${store.modeState(session.id).main ?? '-'}  ${session.title ?? ''}`)
      if (field === 'session') return ok(session.id)
      if (field === 'mode') return ok(store.modeState(session.id).main ?? '')
      if (field === 'transcript') return ok(session.transcript ?? '')
      return failed(`--field takes session, mode, or transcript, not ${field}.`)
    }
    if (folder === dirname(folder)) return failed(`No session ran in ${cwd} or a folder above it.`)
    folder = dirname(folder)
  }
}

export async function check(configHome: string, projectRoot: string): Promise<Output> {
  const { definitions, agentModes, skillModes } = await createCatalog(configHome).load(projectRoot)
  const lines = [`Folders: ${definitions.folders.join(', ')}`, '', 'Modes:']
  for (const mode of definitions.modes) {
    const gates = mode.deny.length + mode.ask.length
    lines.push(`  ${mode.name}  ${gates} gate${gates === 1 ? '' : 's'}${mode.lasts === undefined ? '' : ', lasts a turn'}  ${mode.source}`)
  }
  if (definitions.modes.length === 0) lines.push('  none')
  lines.push('', 'Hook scripts:')
  for (const hook of definitions.hooks) lines.push(`  ${hook.name}  on ${hook.events.join(', ')}${hook.modes.length === 0 ? '' : ` in ${hook.modes.join(', ')}`}`)
  if (definitions.hooks.length === 0) lines.push('  none')
  lines.push('', 'Entered by Agents and Skills:')
  for (const [name, mode] of [...agentModes].map(([agent, mode]) => [`agent ${agent}`, mode])) lines.push(`  ${name} -> ${mode}`)
  for (const [name, mode] of [...skillModes].map(([skill, mode]) => [`skill ${skill}`, mode])) lines.push(`  ${name} -> ${mode}`)
  if (agentModes.size + skillModes.size === 0) lines.push('  none')
  if (definitions.problems.length === 0) return ok(lines.join('\n'))
  lines.push('', 'Problems:')
  for (const problem of definitions.problems) lines.push(`  ${problem.source}: ${problem.message}`)
  return failed(lines.join('\n'))
}
