import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Output } from './commands.ts'

type Block = { context: string; bindings: Record<string, unknown> }

type Keybindings = { bindings: Block[] } & Record<string, unknown>

const key = 'shift+tab'

const action = 'command:mode'

export function bindModeKey(configHome: string): Output {
  const path = join(configHome, 'keybindings.json')
  const read = readKeybindings(path)
  if ('failure' in read) return read.failure
  const { file } = read
  let chat = file.bindings.find((block) => block.context === 'Chat')
  if (chat === undefined) {
    chat = { context: 'Chat', bindings: {} }
    file.bindings.push(chat)
  }
  const current = chat.bindings[key]
  if (current !== undefined && current !== action) {
    return { code: 0, text: `${key} already runs ${String(current)}, so Modes left it. Bind "${key}": "${action}" in the Chat context to switch modes with it.` }
  }
  chat.bindings[key] = action
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`)
  return { code: 0, text: `${key} now runs /mode. ${path} holds the binding.` }
}

export function unbindModeKey(configHome: string): Output {
  const path = join(configHome, 'keybindings.json')
  if (!existsSync(path)) return { code: 0, text: `${path} does not exist, so there is no binding to remove.` }
  const read = readKeybindings(path)
  if ('failure' in read) return read.failure
  const { file } = read
  const chat = file.bindings.find((block) => block.context === 'Chat')
  if (chat?.bindings[key] !== action) return { code: 0, text: `${key} does not run /mode, so Modes left ${path} as it is.` }
  delete chat.bindings[key]
  if (Object.keys(chat.bindings).length === 0) file.bindings = file.bindings.filter((block) => block !== chat)
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`)
  return { code: 0, text: `${key} is back to Claude Code's own binding.` }
}

function readKeybindings(path: string): { readonly file: Keybindings } | { readonly failure: Output } {
  if (!existsSync(path)) return { file: { $schema: 'https://www.schemastore.org/claude-code-keybindings.json', $docs: 'https://code.claude.com/docs/en/keybindings', bindings: [] } }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return { failure: { code: 1, text: `${path} is not JSON, so Modes cannot add its binding: ${error instanceof Error ? error.message : String(error)}` } }
  }
  const bindings = (parsed as { bindings?: unknown } | null)?.bindings
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(bindings)) return { failure: { code: 1, text: `${path} has no "bindings" list, so Modes cannot add its binding.` } }
  return { file: parsed as Keybindings }
}
