import { afterCall } from '../../node_modules/@cmodjs/core/jobs/context.js'
import type { PermissionRules, Rule } from '../../node_modules/@cmodjs/core/jobs/permissions.js'
import { decidePermission } from '../../node_modules/@cmodjs/core/jobs/permissions/decide-permission.js'
import { messageOf, type Job } from '../../node_modules/@cmodjs/core/mod.js'
import type { Connection } from '../connection.js'
import type { Gate, ModeSpec, Patterns, Target } from '../protocol.js'
import type { ModesState } from '../state.js'

const targetKeys = ['command', 'read', 'write', 'fetch', 'subagent', 'tool'] as const

export function modeNameOf(state: ModesState, agentId: string | undefined): string | undefined {
  const { modes } = state.memory
  return (agentId === undefined ? undefined : modes.agents[agentId]) ?? modes.main
}

export function modeOf(state: ModesState, agentId: string | undefined): ModeSpec | undefined {
  const name = modeNameOf(state, agentId)
  return state.memory.definitions?.modes.find((mode) => mode.name === name)
}

export function modeRules(state: ModesState): PermissionRules<ModesState> {
  const modes = state.memory.definitions?.modes ?? []
  const rulesOf = (gates: (mode: ModeSpec) => readonly Gate[], verb: string) =>
    modes.flatMap((mode) =>
      gates(mode).map(({ reason, ...target }): Rule<ModesState> => {
        const inMode = (call: { readonly agentId?: string }, mod: { readonly state: ModesState }) => modeNameOf(mod.state, call.agentId) === mode.name
        return { ...(target as Rule<ModesState>), when: inMode, reason: `${mode.name} mode ${verb} ${describe(target)}.${reason === undefined ? '' : ` ${reason}`}` }
      }),
    )
  return { deny: rulesOf(({ deny }) => deny, 'refuses'), ask: rulesOf(({ ask }) => ask, 'asks before') }
}

export function modeTransitions(connection: Connection): Job<void, ModesState> {
  return (job) => {
    afterCall(
      job,
      async (call, workspace) => {
        const mode = modeOf(job.mod.state, call.agentId)
        for (const { enter, ...target } of mode?.after ?? []) {
          if ((await decidePermission({ deny: [target as Rule<ModesState>] }, call, workspace, job.mod, async (run) => run())) === undefined) continue
          await connection.enter(enter, call.agentId, { kind: 'transition', name: `${mode?.name ?? ''} after ${describe(target)}` })
          return [`The session is now in ${enter} mode.`]
        }
        return []
      },
      (error) => [`Modes could not check the mode's transitions: ${messageOf(error)}`],
    )
    job.announce('mode transitions')
  }
}

export function describe(target: Target): string {
  const key = targetKeys.find((name) => target[name] !== undefined) ?? 'tool'
  const patterns = listOf(target[key] ?? [])
  const kept = patterns.filter((pattern) => !pattern.startsWith('!'))
  const left = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))
  const named = `${kept.join(', ')}${left.length === 0 ? '' : ` except ${left.join(', ')}`}`
  if (key === 'command') return kept.includes('*') && left.length === 0 ? 'every shell command' : named
  if (key === 'write') return `edits to ${named}`
  if (key === 'read') return `reads of ${named}`
  if (key === 'fetch') return `fetches of ${named}`
  if (key === 'subagent') return kept.includes('*') && left.length === 0 ? 'every subagent' : `the ${named} subagent`
  return `the ${named} tool`
}

function listOf(patterns: Patterns): readonly string[] {
  return typeof patterns === 'string' ? [patterns] : patterns
}
