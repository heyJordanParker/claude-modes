import { afterCall, modOf, workspaceReader } from '../../node_modules/@cmodjs/core/jobs/context.js'
import { decidePermission, stricterVerdict, type PermissionRules, type Rule, type Verdict } from '../../node_modules/@cmodjs/core/jobs/permissions/decide-permission.js'
import { messageOf, type Job, type Mod } from '../../node_modules/@cmodjs/core/mod.js'
import type { Connection } from '../connection.js'
import type { Gate, ModeSpec, Patterns, Target } from '../protocol.js'
import type { ModesState } from '../state.js'

type ModRule = Rule<Mod<ModesState>>
type Use = Parameters<typeof decidePermission>[1]
type Workspace = Parameters<typeof decidePermission>[2]

const deadline: Parameters<typeof modOf>[3] = { ms: 2000, job: 'modes' }

const targetKeys = ['command', 'read', 'write', 'fetch', 'subagent', 'tool'] as const

export function modeOf(mod: Mod<ModesState>, agentId: string | undefined): ModeSpec | undefined {
  const { modes, definitions } = mod.state.memory
  const name = (agentId === undefined ? undefined : modes.agents[agentId]) ?? modes.main
  return definitions?.modes.find((mode) => mode.name === name)
}

export function describe(target: Target): string {
  const key = keyOf(target)
  const patterns = listOf(target[key] ?? [])
  const named = patterns.join(', ')
  if (key === 'command') return patterns.includes('*') ? 'every shell command' : named
  if (key === 'write') return `edits to ${named}`
  if (key === 'read') return `reads of ${named}`
  if (key === 'fetch') return `fetches of ${named}`
  if (key === 'subagent') return patterns.includes('*') ? 'every subagent' : `the ${named} subagent`
  return `the ${named} tool`
}

export function modeGates(connection: Connection): Job<void, ModesState> {
  return (job) => {
    const readWorkspace = workspaceReader(job)
    const decide = (rules: PermissionRules<Mod<ModesState>>, use: Use, workspace: Workspace): Promise<Verdict | undefined> =>
      decidePermission(rules, use, workspace, (call, folder) => modOf(job, { call, folder }, workspace, deadline))

    const ruleOf = (mode: ModeSpec, gate: Gate, workspace: Workspace): ModRule => {
      const { except, reason, ...target } = gate
      const rule = { ...target, reason: `${mode.name} mode refuses ${describe(target)}.${reason === undefined ? '' : ` ${reason}`}` } as ModRule
      if (except === undefined) return rule
      const key = keyOf(target)
      const excepted = exceptRule(key, listOf(except))
      return { ...rule, when: async (call: unknown) => (await decide({ deny: [excepted] }, exceptUse(key, call), workspace)) === undefined } as ModRule
    }

    job.on('tool.check', async (e, next) => {
      const [below, agent, workspace] = await Promise.all([next(e), job.toolCalls.agentOf(e.tool_use_id), readWorkspace()])
      const mode = modeOf(job.mod, agent.agentId)
      if (mode === undefined || mode.deny.length + mode.ask.length === 0) return below
      const rules = { deny: mode.deny.map((gate) => ruleOf(mode, gate, workspace)), ask: mode.ask.map((gate) => ruleOf(mode, gate, workspace)) }
      const verdict = await decide(rules, { tool: e.tool, input: e.input as Use['input'], ...agent }, workspace)
      return verdict === undefined ? below : stricterVerdict<Verdict>(below, verdict)
    })

    afterCall(
      job,
      async (use, workspace) => {
        const mode = modeOf(job.mod, use.agentId)
        for (const { enter, ...target } of mode?.after ?? []) {
          if ((await decide({ deny: [target as ModRule] }, use, workspace)) === undefined) continue
          await connection.enter(enter, use.agentId, { kind: 'transition', name: `${mode?.name ?? ''} after ${describe(target)}` })
          return [`The session is now in ${enter} mode.`]
        }
        return []
      },
      (error) => [`Modes could not check the mode's transitions: ${messageOf(error)}`],
    )
    job.announce('mode gates')
  }
}

function listOf(patterns: Patterns): readonly string[] {
  return typeof patterns === 'string' ? [patterns] : patterns
}

function keyOf(target: Target): (typeof targetKeys)[number] {
  return targetKeys.find((name) => target[name] !== undefined) ?? 'tool'
}

function exceptRule(key: (typeof targetKeys)[number], patterns: readonly string[]): ModRule {
  if (key === 'fetch') return { fetch: [...patterns] }
  if (key === 'read') return { read: [...patterns] }
  return { write: [...patterns] }
}

function exceptUse(key: (typeof targetKeys)[number], call: unknown): Use {
  const { path = '', url = '' } = call as { readonly path?: string; readonly url?: string }
  if (key === 'fetch') return { tool: 'WebFetch', input: { url, prompt: '' } }
  if (key === 'write') return { tool: 'Write', input: { file_path: path, content: '' } }
  return { tool: 'Read', input: { file_path: path } }
}
