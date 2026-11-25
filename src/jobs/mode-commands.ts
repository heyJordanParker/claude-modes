import { slashCommand } from '../../node_modules/@cmodjs/core/jobs/slash-command.js'
import { messageOf, type Job } from '../../node_modules/@cmodjs/core/mod.js'
import { enterMode } from '../mode-state.js'
import type { Definitions } from '../protocol.js'
import type { ModesState } from '../state.js'

export type ModeCommands = {
  sync(definitions: Definitions): void
}

const ownCommands = new Set(['mode', 'modes'])

export function nextMode(definitions: Definitions | null, current: string | undefined): string | undefined {
  const names = definitions?.modes.map(({ name }) => name) ?? []
  const index = current === undefined ? -1 : names.indexOf(current)
  return names[(index + 1) % names.length]
}

export function modeCommands(): Job<ModeCommands, ModesState> {
  return ({ mod, announce }) => {
    const added = new Set<string>()
    announce('a command for each mode')

    return {
      sync(definitions) {
        for (const mode of definitions.modes) {
          if (added.has(mode.name) || ownCommands.has(mode.name)) continue
          added.add(mode.name)
          try {
            mod.use(
              slashCommand({
                name: mode.name,
                description: mode.description === '' ? `Switch to ${mode.name} mode` : `Switch to ${mode.name} mode: ${mode.description}`,
                immediate: true,
                reply: async () => {
                  if (!mod.state.memory.definitions?.modes.some(({ name }) => name === mode.name)) return `/${mode.name} no longer applies: its mode file is gone.`
                  try {
                    enterMode(mod.state, mode.name, undefined, { kind: 'command', name: mode.name })
                    return undefined
                  } catch (error) {
                    return `/${mode.name} failed: ${messageOf(error)}`
                  }
                },
              }),
            )
          } catch (error) {
            mod.log(`/${mode.name} is not added: ${messageOf(error)}`, { level: 'warning' })
          }
        }
      },
    }
  }
}
