import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { NewMessage, Store } from './store/store.ts'

type Row = Readonly<Record<string, unknown>>

type Block = Readonly<Record<string, unknown>>

type Thread = { readonly sessionId: string; readonly agentId: string | undefined; readonly sender: string }

const skillPrefix = 'Base directory for this skill:'

export async function syncTranscript(store: Store, sessionId: string, transcriptPath: string): Promise<void> {
  if (!existsSync(transcriptPath)) return
  await importFile(store, transcriptPath, { sessionId, agentId: undefined, sender: 'claude' })
  const subagents = join(dirname(transcriptPath), basename(transcriptPath, '.jsonl'), 'subagents')
  if (!existsSync(subagents)) return
  for (const name of readdirSync(subagents).sort()) {
    const agentId = /^agent-(.+)\.jsonl$/.exec(name)?.[1]
    if (agentId === undefined) continue
    const meta = readMeta(join(subagents, `agent-${agentId}.meta.json`))
    const openedBy = meta.toolUseId
    store.ensureTask(sessionId, {
      id: agentId,
      parentId: (openedBy === undefined ? undefined : store.taskOfToolUse(sessionId, openedBy)) ?? sessionId,
      title: meta.description ?? meta.agentType ?? 'subagent',
      at: statSync(join(subagents, name)).birthtimeMs,
      ...(meta.agentType === undefined ? {} : { agentType: meta.agentType }),
      ...(openedBy === undefined ? {} : { openedBy }),
    })
    await importFile(store, join(subagents, name), { sessionId, agentId, sender: meta.agentType ?? 'subagent' })
  }
}

async function importFile(store: Store, path: string, thread: Thread): Promise<void> {
  const offset = store.offsetOf(path)
  const bytes = new Uint8Array(await Bun.file(path).slice(offset).arrayBuffer())
  const end = bytes.lastIndexOf(10)
  if (end < 0) return
  const text = new TextDecoder().decode(bytes.subarray(0, end + 1))
  store.transaction(() => {
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      importRow(store, JSON.parse(line) as Row, thread)
    }
    store.setOffset(path, thread.sessionId, thread.agentId, offset + end + 1)
  })
}

function importRow(store: Store, row: Row, thread: Thread): void {
  const at = timeOf(row)
  const uuid = typeof row['uuid'] === 'string' ? row['uuid'] : undefined
  const taskId = thread.agentId ?? thread.sessionId
  const add = (message: Omit<NewMessage, 'task_id' | 'at'>) => store.addMessage(thread.sessionId, { ...message, task_id: taskId, at })
  const isMain = thread.agentId === undefined

  if (row['type'] === 'custom-title' && typeof row['customTitle'] === 'string') return store.rename(thread.sessionId, row['customTitle'])
  if (uuid === undefined) return

  if (row['type'] === 'system' && row['subtype'] === 'compact_boundary' && isMain) {
    const trigger = (row['compactMetadata'] as Row | undefined)?.['trigger']
    store.openContext(thread.sessionId, at, typeof trigger === 'string' ? `compacted (${trigger})` : 'compacted')
    return add({ id: uuid, kind: 'notice', sender: 'harness', name: 'compaction', tool_use_id: null, jump: uuid, text: 'The conversation was compacted.', is_error: 0 })
  }

  if (row['type'] === 'attachment') {
    const attachment = row['attachment'] as Row | undefined
    if (attachment?.['type'] !== 'nested_memory' || typeof attachment['path'] !== 'string') return
    return add({ id: uuid, kind: 'document', sender: 'harness', name: basename(attachment['path']), tool_use_id: null, jump: null, text: attachment['path'], is_error: 0 })
  }

  const message = row['message'] as Row | undefined
  const content = message?.['content']

  if (row['type'] === 'user') {
    if (Array.isArray(content) && content.some((block: Block) => block['type'] === 'tool_result')) {
      for (const [index, block] of (content as Block[]).entries()) {
        if (block['type'] !== 'tool_result') continue
        const toolUseId = String(block['tool_use_id'])
        const isError = block['is_error'] === true
        if (isError) store.markToolError(thread.sessionId, toolUseId)
        add({ id: `${uuid}:${index}`, kind: 'tool result', sender: 'tool', name: null, tool_use_id: toolUseId, jump: toolUseId, text: textOf(block['content']), is_error: isError ? 1 : 0 })
      }
      return
    }
    const text = textOf(content).trim()
    if (text.startsWith(skillPrefix)) {
      const folder = text.slice(skillPrefix.length).split('\n')[0]?.trim() ?? ''
      return add({ id: uuid, kind: 'skill', sender: 'harness', name: basename(folder), tool_use_id: null, jump: uuid, text: folder, is_error: 0 })
    }
    if (row['isCompactSummary'] === true && isMain) {
      store.openTurn(thread.sessionId, uuid, at)
      return add({ id: uuid, kind: 'notice', sender: 'harness', name: 'compaction', tool_use_id: null, jump: uuid, text: 'Continued after compaction', is_error: 0 })
    }
    if (row['isMeta'] === true || text === '' || text.startsWith('<local-command')) return
    if (text.startsWith('<task-notification')) return add({ id: uuid, kind: 'notice', sender: 'harness', name: 'task notification', tool_use_id: null, jump: uuid, text: tagOf(text, 'summary') ?? text, is_error: 0 })
    const prompt = commandOf(text) ?? text
    if (isMain) {
      store.openTurn(thread.sessionId, uuid, at)
      store.setTitle(thread.sessionId, firstLine(prompt))
    }
    return add({ id: uuid, kind: 'prompt', sender: isMain ? 'person' : 'parent', name: null, tool_use_id: null, jump: uuid, text: prompt, is_error: 0 })
  }

  if (row['type'] === 'assistant' && Array.isArray(content)) {
    for (const [index, block] of (content as Block[]).entries()) {
      if (block['type'] === 'text' && typeof block['text'] === 'string' && block['text'].trim() !== '') {
        add({ id: `${uuid}:${index}`, kind: 'reply', sender: thread.sender, name: null, tool_use_id: null, jump: uuid, text: block['text'], is_error: 0 })
      }
      if (block['type'] === 'tool_use') {
        const toolUseId = String(block['id'])
        const name = String(block['name'])
        add({ id: `${uuid}:${index}`, kind: 'tool call', sender: thread.sender, name, tool_use_id: toolUseId, jump: toolUseId, text: summaryOf(block['input']), is_error: 0 })
      }
    }
  }
}

function readMeta(path: string): { readonly agentType?: string; readonly description?: string; readonly toolUseId?: string } {
  if (!existsSync(path)) return {}
  const meta = JSON.parse(readFileSync(path, 'utf8')) as Row
  const text = (key: string) => (typeof meta[key] === 'string' && meta[key] !== '' ? { [key]: meta[key] } : {})
  return { ...text('agentType'), ...text('description'), ...text('toolUseId') }
}

function timeOf(row: Row): number {
  const stamp = row['timestamp']
  return typeof stamp === 'string' ? Date.parse(stamp) : Date.now()
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as Block[])
    .map((block) => (block['type'] === 'text' && typeof block['text'] === 'string' ? block['text'] : ''))
    .filter((text) => text !== '')
    .join('\n')
}

function commandOf(text: string): string | undefined {
  const name = tagOf(text, 'command-name')
  if (name === undefined) return undefined
  const args = tagOf(text, 'command-args') ?? ''
  return args === '' ? name : `${name} ${args}`
}

function tagOf(text: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text)?.[1]?.trim()
}

function firstLine(text: string): string {
  return (text.split('\n')[0] ?? '').slice(0, 120)
}

function summaryOf(input: unknown): string {
  const fields = (input ?? {}) as Row
  for (const key of ['command', 'file_path', 'pattern', 'description', 'skill', 'url', 'query', 'prompt']) {
    const value = fields[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return JSON.stringify(fields).slice(0, 400)
}
