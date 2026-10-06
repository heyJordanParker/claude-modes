import type { History, HistoryNode, ModeEntry } from '../../src/protocol.ts'
import type { MessageRow, Store, TaskRow, TurnRow } from './store/store.ts'

const labelLength = 160

type Draft = {
  id: string
  kind: HistoryNode['kind']
  label: string
  at: number
  jump?: string
  isError?: true
  isRunning?: true
  children: Draft[]
}

export function historyOf(store: Store, sessionId: string): History | undefined {
  const session = store.session(sessionId)
  if (session === null) return undefined
  const messages = store.messages(sessionId)
  const tasks = store.tasks(sessionId)
  const contexts = store.contexts(sessionId)
  const turns = store.turns(sessionId)
  const entries = store.entries(sessionId).filter((entry) => entry.agentId === undefined)

  const messagesOf = new Map<string, MessageRow[]>()
  for (const message of messages) messagesOf.set(message.task_id, [...(messagesOf.get(message.task_id) ?? []), message])
  const taskOpenedBy = new Map<string, TaskRow>()
  for (const task of tasks) if (task.opened_by !== null) taskOpenedBy.set(task.opened_by, task)

  const nodeOfMessage = (message: MessageRow): Draft | undefined => {
    if (message.kind === 'tool result') return undefined
    const opened = message.tool_use_id === null ? undefined : taskOpenedBy.get(message.tool_use_id)
    if (opened !== undefined) return taskNode(opened)
    return {
      id: message.id,
      kind: message.kind,
      label: labelOf(message),
      at: message.at,
      ...(message.jump === null ? {} : { jump: message.jump }),
      ...(message.is_error === 1 ? { isError: true as const } : {}),
      children: [],
    }
  }

  const taskNode = (task: TaskRow): Draft => ({
    id: `task:${task.id}`,
    kind: 'task',
    label: clip(`${task.agent_type ?? 'subagent'}: ${task.title}`),
    at: task.opened_at,
    ...(task.opened_by === null ? {} : { jump: task.opened_by }),
    ...(task.closed_at === null ? { isRunning: true as const } : {}),
    children: (messagesOf.get(task.id) ?? []).flatMap((message) => nodeOfMessage(message) ?? []),
  })

  const modeNode = (entry: ModeEntry, index: number): Draft => ({
    id: `mode:${index}`,
    kind: 'mode',
    label: `${entry.mode} (${causeOf(entry)})`,
    at: entry.at,
    children: [],
  })

  const turnNodes = new Map<number, Draft>()
  const turnNode = (turn: TurnRow, prompt: MessageRow | undefined): Draft => ({
    id: `turn:${turn.id}`,
    kind: 'turn',
    label: clip(firstLine(prompt?.text ?? '')),
    at: turn.opened_at,
    ...(prompt?.jump === null || prompt === undefined ? {} : { jump: prompt.jump }),
    children: [],
  })

  const contextNodes = contexts.map(
    (context): Draft => ({ id: `context:${context.id}`, kind: 'context', label: `Context ${context.ordinal}: ${context.reason}`, at: context.opened_at, children: [] }),
  )
  const contextNodeOf = new Map(contexts.map((context, index) => [context.id, contextNodes[index] as Draft]))
  const promptOf = new Map(messages.map((message) => [message.id, message]))
  for (const turn of turns) {
    const node = turnNode(turn, promptOf.get(turn.prompt_id))
    turnNodes.set(turn.id, node)
    contextNodeOf.get(turn.context_id)?.children.push(node)
  }

  const turnPrompts = new Set(turns.map((turn) => turn.prompt_id))
  for (const message of messagesOf.get(sessionId) ?? []) {
    if (turnPrompts.has(message.id)) continue
    const turn = message.turn_id === null ? undefined : turnNodes.get(message.turn_id)
    const node = nodeOfMessage(message)
    if (node === undefined) continue
    const parent = turn ?? contextNodeOf.get(message.context_id)
    parent?.children.push(node)
  }

  const orderedTurns = turns.map((turn) => ({ turn, node: turnNodes.get(turn.id) as Draft }))
  for (const [index, entry] of entries.entries()) {
    const holder = orderedTurns.findLast(({ turn }) => turn.opened_at <= entry.at)
    const parent = holder?.node ?? contextNodes[0]
    parent?.children.push(modeNode(entry, index))
  }
  for (const node of [...contextNodes, ...turnNodes.values()]) node.children.sort((first, second) => first.at - second.at)

  const filled = contextNodes.filter((node) => node.children.length > 0)
  const goal: Draft = {
    id: `goal:${sessionId}`,
    kind: 'goal',
    label: clip(session.title ?? 'Untitled session'),
    at: session.started_at,
    children: filled.length <= 1 ? (filled[0]?.children ?? []) : filled,
  }
  return { root: finish(goal) }
}

function finish(draft: Draft): HistoryNode {
  const children = draft.children.map(finish)
  const ownCall = draft.kind === 'tool call' ? 1 : 0
  const ownError = draft.isError === true ? 1 : 0
  const calls = ownCall + children.reduce((sum, child) => sum + (child.calls ?? 0), 0)
  const errors = ownError + children.reduce((sum, child) => sum + (child.errors ?? 0), 0)
  return {
    id: draft.id,
    kind: draft.kind,
    label: draft.label,
    at: draft.at,
    ...(draft.jump === undefined ? {} : { jump: draft.jump }),
    ...(draft.isError === undefined ? {} : { isError: draft.isError }),
    ...(draft.isRunning === undefined ? {} : { isRunning: draft.isRunning }),
    ...(calls === 0 ? {} : { calls }),
    ...(errors === 0 ? {} : { errors }),
    ...(children.length === 0 ? {} : { children }),
  }
}

function labelOf(message: MessageRow): string {
  if (message.kind === 'tool call') return clip(`${message.name ?? 'tool'} ${firstLine(message.text)}`)
  if (message.kind === 'skill') return `skill ${message.name ?? message.text}`
  if (message.kind === 'document') return `read ${message.text}`
  if (message.kind === 'prompt') return clip(`prompt: ${firstLine(message.text)}`)
  return clip(firstLine(message.text))
}

function causeOf(entry: ModeEntry): string {
  const { cause } = entry
  if (cause.kind === 'start') return 'session start'
  if (cause.kind === 'turn-end') return 'turn ended'
  return `${cause.kind} ${cause.name}`
}

function firstLine(text: string): string {
  return text.split('\n').find((line) => line.trim() !== '')?.trim() ?? ''
}

function clip(text: string): string {
  return text.length > labelLength ? `${text.slice(0, labelLength - 1)}…` : text
}
