import type { EntryCause, ModeSpec } from './protocol.js'
import type { ModesState } from './state.js'

export function modeNameOf(state: ModesState, agentId: string | undefined): string | undefined {
  const { modes } = state.session
  return (agentId === undefined ? undefined : modes.agents[agentId]) ?? modes.main
}

export function modeOf(state: ModesState, agentId: string | undefined): ModeSpec | undefined {
  const name = modeNameOf(state, agentId)
  return state.memory.definitions?.modes.find((mode) => mode.name === name)
}

export function enterMode(state: ModesState, mode: string, agentId: string | undefined, cause: EntryCause): void {
  const names = state.memory.definitions?.modes.map(({ name }) => name) ?? []
  if (!names.includes(mode)) throw new Error(`"${mode}" is not a mode. The modes are ${names.join(', ') || 'not defined yet'}.`)
  const { modes } = state.session
  const current = agentId === undefined ? modes.main : modes.agents[agentId]
  if (current === mode) return
  if (agentId === undefined) {
    state.session.previous = current ?? null
    state.session.modes = { ...modes, main: mode }
  } else {
    state.session.modes = { ...modes, agents: { ...modes.agents, [agentId]: mode } }
  }
  state.session.entries = [...state.session.entries, { mode, agentId, cause, at: Date.now() }]
}

export function skillModeOf(state: ModesState, skill: string): string | undefined {
  const skillModes = state.memory.definitions?.skillModes ?? {}
  return skillModes[skill] ?? skillModes[skill.slice(skill.lastIndexOf(':') + 1)]
}

export function rulesToTell(state: ModesState, agentId: string, always: boolean): ModeSpec | undefined {
  const own = state.session.modes.agents[agentId]
  if (!always && (own === undefined || state.session.told[agentId] === own)) return undefined
  const mode = modeOf(state, agentId)
  if (mode !== undefined) state.session.told = { ...state.session.told, [agentId]: mode.name }
  return mode
}
