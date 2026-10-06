import type { Job } from '../../node_modules/@cmodjs/core/mod.js'
import { messageOf } from '../../node_modules/@cmodjs/core/mod.js'
import type { Connection } from '../connection.js'
import type { Definitions } from '../protocol.js'
import type { ModesState } from '../state.js'

export type ModeCommands = {
  sync(definitions: Definitions): void
}

export function nextMode(definitions: Definitions | null, current: string | undefined): string | undefined {
  const names = definitions?.modes.map(({ name }) => name) ?? []
  const index = current === undefined ? -1 : names.indexOf(current)
  return names[(index + 1) % names.length]
}

export function modeCommands(connection: Connection): Job<ModeCommands, ModesState> {
  return ({ mod, claude, on, announce }) => {
    const registered = new Map<string, string>()
    const requested = new Set<string>()

    const enter = async (mode: string, command: string) => {
      try {
        await connection.enter(mode, undefined, { kind: 'command', name: command })
        return {}
      } catch (error) {
        return { text: `/${command} failed: ${messageOf(error)}` }
      }
    }

    void claude.command.register({ name: 'mode', description: 'Switch to the next mode, or to the mode you name', argumentHint: '[mode]', immediate: true }).then(
      ({ command }) => void registered.set(command, ''),
      (error: unknown) => claude.ui.log(`${mod.name}: /mode is not added: ${messageOf(error)}`),
    )
    announce('/mode')

    on('command.run', async (e, next) => {
      if (!registered.has(e.command)) return next(e)
      const named = registered.get(e.command) ?? ''
      if (named !== '') return enter(named, named)
      const wanted = e.args.trim()
      const mode = wanted === '' ? nextMode(mod.state.memory.definitions, mod.state.memory.modes.main) : wanted
      if (mode === undefined) return { text: 'No modes yet. Add a mode file to ~/.claude/cmods/modes/, such as review.md.' }
      return enter(mode, 'mode')
    })

    return {
      sync(definitions) {
        for (const mode of definitions.modes) {
          if (requested.has(mode.name) || mode.name === 'mode') continue
          requested.add(mode.name)
          const description = mode.description === '' ? `Switch to ${mode.name} mode` : `Switch to ${mode.name} mode: ${mode.description}`
          claude.command.register({ name: mode.name, description, immediate: true }).then(
            ({ command }) => void registered.set(command, mode.name),
            (error: unknown) => claude.ui.log(`${mod.name}: /${mode.name} is not added: ${messageOf(error)}`, { to: 'debug' }),
          )
        }
      },
    }
  }
}
