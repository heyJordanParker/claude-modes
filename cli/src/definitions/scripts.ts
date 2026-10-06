import type { Hook, HookEvent } from 'claude-modes'
import { statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { defineHook, hookEvents } from '../sdk/index.ts'
import { modeName } from './mode-file.ts'

export type LoadedScript = {
  readonly name: string
  readonly source: string
  readonly events: readonly HookEvent[]
  readonly modes: readonly string[]
  readonly run: Hook['run']
}

let isInstalled = false

export function installSdk(): void {
  if (isInstalled) return
  isInstalled = true
  Bun.plugin({
    name: 'claude-modes',
    setup(build) {
      build.module('claude-modes', () => ({ exports: { defineHook }, loader: 'object' }))
    },
  })
}

export const scriptExtensions = new Set(['.ts', '.js', '.mts', '.mjs'])

export async function loadScript(path: string): Promise<LoadedScript> {
  installSdk()
  const module = (await import(`${path}?v=${statSync(path).mtimeMs}`)) as { readonly default?: unknown }
  const hook = module.default
  if (typeof hook !== 'object' || hook === null) throw new Error('it has no default export. End it with export default defineHook({ on, run }).')
  const { on, mode, run } = hook as Record<string, unknown>
  const events = typeof on === 'string' ? [on] : on
  if (!Array.isArray(events) || events.length === 0 || !events.every((event): event is HookEvent => hookEvents.includes(event as HookEvent))) {
    throw new Error(`on is ${JSON.stringify(on)}. Name one or more of ${hookEvents.join(', ')}.`)
  }
  const modes = mode === undefined ? [] : typeof mode === 'string' ? [mode] : mode
  if (!Array.isArray(modes) || !modes.every((name) => typeof name === 'string' && modeName.test(name))) throw new Error(`mode is ${JSON.stringify(mode)}. Name a mode, or a list of them.`)
  if (typeof run !== 'function') throw new Error('run is not a function.')
  return { name: basename(path, extname(path)), source: path, events, modes: modes as string[], run: run as Hook['run'] }
}
