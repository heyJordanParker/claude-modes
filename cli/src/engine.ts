import type { Effect as ScriptEffect, HookContext } from 'claude-modes'
import type { Definitions, Effect, HookAnswer, HookRequest, Problem } from '../../src/protocol.ts'
import type { Catalog } from './definitions/catalog.ts'
import type { LoadedScript } from './definitions/scripts.ts'

const effectsOf: Readonly<Record<string, ReadonlySet<string>>> = {
  SessionStart: new Set(['context', 'enter']),
  UserPromptSubmit: new Set(['context', 'block', 'enter']),
  PreToolUse: new Set(['deny', 'ask', 'context']),
  PostToolUse: new Set(['context', 'enter']),
  PostToolUseFailure: new Set(['context', 'enter']),
  Stop: new Set(['context', 'block', 'enter']),
  SubagentStart: new Set(['context']),
  SubagentStop: new Set(['context', 'block']),
}

const scriptDeadlineMs = 5000

export type Engine = ReturnType<typeof createEngine>

export function createEngine(catalog: Catalog) {
  const failures: Problem[] = []
  let failureCount = 0

  const fail = (source: string, message: string) => {
    failureCount += 1
    failures.push({ source, message })
    failures.splice(0, Math.max(0, failures.length - 20))
    console.error(`${source}: ${message}`)
  }

  const revision = () => catalog.version + failureCount

  return {
    async hook({ projectRoot, event, input, context }: HookRequest): Promise<HookAnswer> {
      const loaded = await catalog.load(projectRoot)
      const allowed = effectsOf[event] ?? new Set<string>()
      const effects: Effect[] = []
      for (const script of loaded.scripts) {
        if (!script.events.includes(event as LoadedScript['events'][number])) continue
        if (script.modes.length > 0 && (context.mode === undefined || !script.modes.includes(context.mode))) continue
        try {
          const effect = await runScript(script, input, context)
          if (effect === undefined) continue
          const [kind] = Object.keys(effect)
          if (kind === undefined || !allowed.has(kind)) {
            fail(script.source, `it answered ${kind ?? 'an empty effect'} on ${event}, which takes ${[...allowed].join(', ') || 'no effect'}.`)
            continue
          }
          if (!('enter' in effect)) effects.push(effect)
          else if (loaded.definitions.modes.some(({ name }) => name === effect.enter)) effects.push({ enter: effect.enter, hook: script.name })
          else fail(script.source, `"${effect.enter}" is not a mode. Define it in a mode file first.`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          fail(script.source, message)
          if (event === 'PreToolUse') effects.push({ deny: `The ${script.name} hook failed, so it denies the call: ${message}` })
        }
      }
      return { effects, version: revision() }
    },

    async definitions(projectRoot: string): Promise<Definitions> {
      const { definitions } = await catalog.load(projectRoot)
      return { ...definitions, problems: [...definitions.problems, ...failures], version: revision() }
    },
  }
}

async function runScript(script: LoadedScript, input: Readonly<Record<string, unknown>>, context: HookContext): Promise<ScriptEffect | undefined> {
  let timer: Timer | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`it ran past ${scriptDeadlineMs / 1000} s.`)), scriptDeadlineMs)
  })
  try {
    const effect = await Promise.race([Promise.resolve(script.run(input as never, context)), deadline])
    return effect ?? undefined
  } finally {
    clearTimeout(timer)
  }
}
