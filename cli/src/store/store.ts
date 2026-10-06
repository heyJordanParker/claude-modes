import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { EntryCause, MessageKind, ModeEntry, ModeState } from '../../../src/protocol.ts'
import { schema } from './schema.ts'

export type SessionRow = {
  readonly id: string
  readonly project: string
  readonly transcript: string | null
  readonly agent_type: string | null
  readonly title: string | null
  readonly started_at: number
  readonly updated_at: number
}

export type ContextRow = { readonly id: number; readonly ordinal: number; readonly opened_at: number; readonly reason: string }

export type TurnRow = { readonly id: number; readonly context_id: number; readonly prompt_id: string; readonly opened_at: number; readonly closed_at: number | null }

export type TaskRow = {
  readonly id: string
  readonly parent_id: string | null
  readonly agent_type: string | null
  readonly title: string
  readonly opened_by: string | null
  readonly opened_at: number
  readonly closed_at: number | null
}

export type MessageRow = {
  readonly seq: number
  readonly id: string
  readonly context_id: number
  readonly turn_id: number | null
  readonly task_id: string
  readonly kind: MessageKind
  readonly sender: string
  readonly name: string | null
  readonly tool_use_id: string | null
  readonly jump: string | null
  readonly text: string
  readonly is_error: number
  readonly at: number
}

export type NewMessage = Omit<MessageRow, 'seq' | 'context_id' | 'turn_id'>

type ModeRow = { readonly id: number; readonly agent_id: string; readonly mode: string; readonly cause: string; readonly at: number; readonly is_delivered: number }

export type Store = ReturnType<typeof openStore>

export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { create: true, strict: true })
  db.exec('pragma journal_mode = wal')
  db.exec('pragma busy_timeout = 5000')
  db.exec('pragma foreign_keys = on')
  db.exec(schema)

  const currentContext = (sessionId: string) =>
    db.query<ContextRow, [string]>('select id, ordinal, opened_at, reason from contexts where session_id = ? order by ordinal desc limit 1').get(sessionId)

  const currentTurn = (sessionId: string) =>
    db.query<TurnRow, [string]>('select id, context_id, prompt_id, opened_at, closed_at from turns where session_id = ? order by id desc limit 1').get(sessionId)

  const latestEntry = (sessionId: string, agentId: string) =>
    db.query<ModeRow, [string, string]>('select id, agent_id, mode, cause, at, is_delivered from modes where session_id = ? and agent_id = ? order by id desc limit 1').get(sessionId, agentId)

  const entryOf = (row: ModeRow): ModeEntry => ({ mode: row.mode, agentId: row.agent_id === '' ? undefined : row.agent_id, cause: JSON.parse(row.cause) as EntryCause, at: row.at })

  return {
    close: () => db.close(),

    transaction: <Value>(work: () => Value): Value => db.transaction(work)(),

    ensureSession(id: string, project: string, at: number, details: { readonly transcript?: string; readonly agentType?: string } = {}): SessionRow {
      db.query('insert into sessions (id, project, started_at, updated_at) values (?, ?, ?, ?) on conflict(id) do update set updated_at = excluded.updated_at').run(id, project, at, at)
      if (details.transcript !== undefined) db.query('update sessions set transcript = ? where id = ?').run(details.transcript, id)
      if (details.agentType !== undefined) db.query('update sessions set agent_type = ? where id = ?').run(details.agentType, id)
      if (currentContext(id) === null) db.query('insert into contexts (session_id, ordinal, opened_at, reason) values (?, 1, ?, ?)').run(id, at, 'start')
      if (db.query('select 1 from tasks where id = ?').get(id) === null) db.query('insert into tasks (id, session_id, title, opened_at) values (?, ?, ?, ?)').run(id, id, '', at)
      return this.session(id) as SessionRow
    },

    session: (id: string) => db.query<SessionRow, [string]>('select * from sessions where id = ?').get(id),

    sessions: (limit: number) => db.query<SessionRow, [number]>('select * from sessions order by updated_at desc limit ?').all(limit),

    latestSessionIn: (project: string) => db.query<SessionRow, [string]>('select * from sessions where project = ? order by updated_at desc limit 1').get(project),

    setTitle(id: string, title: string): void {
      db.query("update sessions set title = ? where id = ? and (title is null or title = '')").run(title, id)
      db.query("update tasks set title = ? where id = ? and title = ''").run(title, id)
    },

    rename(id: string, title: string): void {
      db.query('update sessions set title = ? where id = ?').run(title, id)
      db.query('update tasks set title = ? where id = ?').run(title, id)
    },

    offsetOf: (path: string) => db.query<{ offset: number }, [string]>('select offset from sources where path = ?').get(path)?.offset ?? 0,

    setOffset(path: string, sessionId: string, agentId: string | undefined, offset: number): void {
      db.query('insert into sources (path, session_id, agent_id, offset) values (?, ?, ?, ?) on conflict(path) do update set offset = excluded.offset').run(path, sessionId, agentId ?? null, offset)
    },

    openContext(sessionId: string, at: number, reason: string): void {
      const ordinal = (currentContext(sessionId)?.ordinal ?? 0) + 1
      db.query('insert into contexts (session_id, ordinal, opened_at, reason) values (?, ?, ?, ?)').run(sessionId, ordinal, at, reason)
    },

    contexts: (sessionId: string) => db.query<ContextRow, [string]>('select id, ordinal, opened_at, reason from contexts where session_id = ? order by ordinal').all(sessionId),

    openTurn(sessionId: string, promptId: string, at: number): void {
      const context = currentContext(sessionId)
      if (context === null) throw new Error(`session ${sessionId} has no context. Call ensureSession first.`)
      db.query('update turns set closed_at = coalesce(closed_at, ?) where session_id = ? and closed_at is null').run(at, sessionId)
      db.query('insert into turns (session_id, context_id, prompt_id, opened_at) values (?, ?, ?, ?)').run(sessionId, context.id, promptId, at)
    },

    closeTurn(sessionId: string, at: number): void {
      db.query('update turns set closed_at = ? where session_id = ? and closed_at is null').run(at, sessionId)
    },

    turns: (sessionId: string) => db.query<TurnRow, [string]>('select id, context_id, prompt_id, opened_at, closed_at from turns where session_id = ? order by id').all(sessionId),

    ensureTask(sessionId: string, task: { readonly id: string; readonly parentId: string; readonly agentType?: string; readonly title: string; readonly openedBy?: string; readonly at: number }): void {
      db.query('insert or ignore into tasks (id, session_id, parent_id, agent_type, title, opened_by, opened_at) values (?, ?, ?, ?, ?, ?, ?)').run(
        task.id,
        sessionId,
        task.parentId,
        task.agentType ?? null,
        task.title,
        task.openedBy ?? null,
        task.at,
      )
    },

    closeTask(id: string, at: number): void {
      db.query('update tasks set closed_at = coalesce(closed_at, ?) where id = ?').run(at, id)
    },

    closeOpenTasks(sessionId: string, at: number): void {
      db.query('update tasks set closed_at = ? where session_id = ? and closed_at is null and parent_id is not null').run(at, sessionId)
    },

    tasks: (sessionId: string) => db.query<TaskRow, [string]>('select id, parent_id, agent_type, title, opened_by, opened_at, closed_at from tasks where session_id = ? order by parent_id is not null, opened_at').all(sessionId),

    taskOfToolUse: (sessionId: string, toolUseId: string) =>
      db.query<{ task_id: string }, [string, string]>("select task_id from messages where session_id = ? and tool_use_id = ? and kind = 'tool call' limit 1").get(sessionId, toolUseId)?.task_id,

    addMessage(sessionId: string, message: NewMessage): void {
      const context = currentContext(sessionId)
      if (context === null) throw new Error(`session ${sessionId} has no context. Call ensureSession first.`)
      const turnId = currentTurn(sessionId)?.id ?? null
      db.query(
        'insert or ignore into messages (id, session_id, context_id, turn_id, task_id, kind, sender, name, tool_use_id, jump, text, is_error, at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(message.id, sessionId, context.id, turnId, message.task_id, message.kind, message.sender, message.name, message.tool_use_id, message.jump, message.text, message.is_error, message.at)
    },

    markToolError(sessionId: string, toolUseId: string): void {
      db.query("update messages set is_error = 1 where session_id = ? and tool_use_id = ? and kind = 'tool call'").run(sessionId, toolUseId)
    },

    messages: (sessionId: string) => db.query<MessageRow, [string]>('select seq, id, context_id, turn_id, task_id, kind, sender, name, tool_use_id, jump, text, is_error, at from messages where session_id = ? order by seq').all(sessionId),

    messagesAfter: (seq: number) =>
      db.query<MessageRow & { readonly session_id: string }, [number]>('select seq, id, session_id, context_id, turn_id, task_id, kind, sender, name, tool_use_id, jump, text, is_error, at from messages where seq > ? order by seq').all(seq),

    enter(sessionId: string, agentId: string | undefined, mode: string, cause: EntryCause, at: number): boolean {
      const key = agentId ?? ''
      if (latestEntry(sessionId, key)?.mode === mode) return false
      db.query('insert into modes (session_id, agent_id, mode, cause, at) values (?, ?, ?, ?, ?)').run(sessionId, key, mode, JSON.stringify(cause), at)
      return true
    },

    entries: (sessionId: string) => db.query<ModeRow, [string]>('select id, agent_id, mode, cause, at, is_delivered from modes where session_id = ? order by id').all(sessionId).map(entryOf),

    previousMode(sessionId: string, agentId: string | undefined): string | undefined {
      const rows = db.query<ModeRow, [string, string]>('select id, agent_id, mode, cause, at, is_delivered from modes where session_id = ? and agent_id = ? order by id desc').all(sessionId, agentId ?? '')
      const current = rows[0]?.mode
      return rows.find((row) => row.mode !== current)?.mode
    },

    modeState(sessionId: string): ModeState {
      const rows = db
        .query<{ agent_id: string; mode: string }, [string]>('select agent_id, mode from modes where id in (select max(id) from modes where session_id = ? group by agent_id)')
        .all(sessionId)
      const agents: Record<string, string> = {}
      let main: string | undefined
      for (const row of rows) {
        if (row.agent_id === '') main = row.mode
        else agents[row.agent_id] = row.mode
      }
      return { main, agents }
    },

    undeliveredMode(sessionId: string, agentId: string | undefined): { readonly id: number; readonly mode: string } | undefined {
      const row = latestEntry(sessionId, agentId ?? '')
      return row === null || row.is_delivered === 1 ? undefined : { id: row.id, mode: row.mode }
    },

    markDelivered(sessionId: string, agentId: string | undefined): void {
      db.query('update modes set is_delivered = 1 where session_id = ? and agent_id = ?').run(sessionId, agentId ?? '')
    },

    copyModes(from: string, to: string, at: number): void {
      const state = this.modeState(from)
      if (state.main !== undefined) this.enter(to, undefined, state.main, { kind: 'mod', name: `copied from ${from}` }, at)
    },

    lastSeq: () => db.query<{ seq: number | null }, []>('select max(seq) as seq from messages').get()?.seq ?? 0,

    deleteSession(id: string): void {
      db.query('delete from sessions where id = ?').run(id)
      db.query('delete from tasks where session_id = ?').run(id)
    },
  }
}
