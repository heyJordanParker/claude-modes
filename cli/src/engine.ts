import type { Effect as ScriptEffect, HookContext } from 'claude-modes'
import { rulesOf, type Definitions, type Effect, type EnterRequest, type EntryCause, type EventAnswer, type EventRequest, type ModeState, type Problem } from '../../src/protocol.ts'
import type { Catalog } from './definitions/catalog.ts'
import type { LoadedScript } from './definitions/scripts.ts'
import type { Store } from './store/store.ts'
import { syncTranscript } from './transcript.ts'

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

export function createEngine(store: Store, catalog: Catalog, now: () => number = Date.now) {
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
    async event(request: EventRequest): Promise<EventAnswer> {
      const { session, event, input } = request
      const at = now()
      const text = (key: string) => (typeof input[key] === 'string' && input[key] !== '' ? (input[key] as string) : undefined)
      const transcript = text('transcript_path')
      const agentType = event === 'SessionStart' ? text('agent_type') : undefined
      const agentId = text('agent_id')

      store.ensureSession(session.id, session.projectRoot, at, { ...(transcript === undefined ? {} : { transcript }), ...(agentType === undefined ? {} : { agentType }) })
      if (transcript !== undefined) await syncTranscript(store, session.id, transcript)

      const loaded = await catalog.load(session.projectRoot)
      const modes = new Map(loaded.definitions.modes.map((mode) => [mode.name, mode]))
      const enter = (mode: string, agent: string | undefined, cause: EntryCause) => {
        if (!modes.has(mode)) return fail(cause.kind === 'hook' ? cause.name : session.id, `"${mode}" is not a mode. Define it in a mode file first.`)
        store.enter(session.id, agent, mode, cause, at)
      }
      const modeOf = (agent: string | undefined) => {
        const state = store.modeState(session.id)
        return (agent === undefined ? undefined : state.agents[agent]) ?? state.main
      }

      if (event === 'SessionStart' && store.modeState(session.id).main === undefined) {
        const fromAgent = agentType === undefined ? undefined : loaded.agentModes.get(agentType)
        const initial = fromAgent ?? (modes.has(session.defaultMode) ? session.defaultMode : loaded.definitions.modes[0]?.name)
        if (initial !== undefined) enter(initial, undefined, fromAgent === undefined ? { kind: 'start' } : { kind: 'agent', name: agentType as string })
      }
      if (event === 'UserPromptSubmit') {
        const skill = /^\/([^\s]+)/.exec(text('prompt') ?? '')?.[1]
        const mode = skill === undefined ? undefined : skillMode(loaded.skillModes, skill)
        if (mode !== undefined) enter(mode, undefined, { kind: 'skill', name: skill as string })
      }
      if (event === 'PostToolUse' && input['tool_name'] === 'Skill') {
        const skill = (input['tool_input'] as Record<string, unknown> | undefined)?.['skill']
        const mode = typeof skill === 'string' ? skillMode(loaded.skillModes, skill) : undefined
        if (mode !== undefined) enter(mode, agentId, { kind: 'skill', name: skill as string })
      }
      if (event === 'SubagentStart' && agentId !== undefined) {
        const name = text('agent_type')
        const mode = name === undefined ? undefined : loaded.agentModes.get(name)
        if (mode !== undefined) enter(mode, agentId, { kind: 'agent', name: name as string })
      }
      if (event === 'SubagentStop' && agentId !== undefined) store.closeTask(agentId, at)
      if (event === 'Stop') {
        store.closeTurn(session.id, at)
        const current = modeOf(undefined)
        const previous = store.previousMode(session.id, undefined)
        if (current !== undefined && modes.get(current)?.lasts === 'turn' && previous !== undefined) enter(previous, undefined, { kind: 'turn-end' })
      }

      const effects: Effect[] = []
      const allowed = effectsOf[event] ?? new Set<string>()
      const mode = modeOf(agentId)
      const context: HookContext = {
        session: { id: session.id, projectRoot: session.projectRoot, cwd: session.cwd },
        mode,
        agentId,
        commands: request.commands,
      }
      for (const script of loaded.scripts) {
        if (!script.events.includes(event as LoadedScript['events'][number])) continue
        if (script.modes.length > 0 && (mode === undefined || !script.modes.includes(mode))) continue
        try {
          const effect = await runScript(script, input, context)
          if (effect === undefined) continue
          const [kind] = Object.keys(effect)
          if (kind === undefined || !allowed.has(kind)) {
            fail(script.source, `it answered ${kind ?? 'an empty effect'} on ${event}, which takes ${[...allowed].join(', ') || 'no effect'}.`)
            continue
          }
          if ('enter' in effect) enter(effect.enter, agentId, { kind: 'hook', name: script.name })
          else effects.push(effect)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          fail(script.source, message)
          if (event === 'PreToolUse') effects.push({ deny: `The ${script.name} hook failed, so it denies the call: ${message}` })
        }
      }

      const deliver = (agent: string, always: boolean) => {
        const pending = store.undeliveredMode(session.id, agent)
        const name = always ? modeOf(agent) : pending?.mode
        const spec = name === undefined ? undefined : modes.get(name)
        if (spec !== undefined) effects.push({ context: rulesOf(spec) })
        store.markDelivered(session.id, agent)
      }
      if (agentId !== undefined && event === 'SubagentStart') deliver(agentId, true)
      else if (agentId !== undefined && allowed.has('context') && event !== 'SubagentStop') deliver(agentId, false)

      return { effects, modes: store.modeState(session.id), version: revision() }
    },

    async enter(request: EnterRequest): Promise<{ readonly modes: ModeState }> {
      const { session, mode, agentId, cause } = request
      const loaded = await catalog.load(session.projectRoot)
      if (!loaded.definitions.modes.some(({ name }) => name === mode)) throw new Error(`"${mode}" is not a mode. The modes are ${loaded.definitions.modes.map(({ name }) => name).join(', ') || 'not defined yet'}.`)
      store.ensureSession(session.id, session.projectRoot, now())
      store.enter(session.id, agentId, mode, cause, now())
      return { modes: store.modeState(session.id) }
    },

    async definitions(projectRoot: string): Promise<Definitions> {
      const { definitions } = await catalog.load(projectRoot)
      return { ...definitions, problems: [...definitions.problems, ...failures], version: revision() }
    },

    entries: (sessionId: string) => store.entries(sessionId),
  }
}

function skillMode(skillModes: ReadonlyMap<string, string>, skill: string): string | undefined {
  return skillModes.get(skill) ?? skillModes.get(skill.slice(skill.lastIndexOf(':') + 1))
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
