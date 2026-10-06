import { slashCommand } from '../node_modules/@cmodjs/core/jobs/slash-command.js'
import { defineMod, messageOf, type ModEvent } from '../node_modules/@cmodjs/core/mod.js'
import { Box, Button } from '../node_modules/@cmodjs/core/ui/elements.js'
import { slots } from '../node_modules/@cmodjs/core/ui/slots.js'
import { answerOf } from './answers.js'
import { connect, type Connection } from './connection.js'
import { modeCommands, nextMode } from './jobs/mode-commands.js'
import { modeGates } from './jobs/mode-gates.js'
import { modesPane } from './panes/modes.js'
import type { EntryCause, ModeEntry } from './protocol.js'
import { initialState } from './state.js'

const forwarded: readonly ModEvent[] = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'Notification',
]

const historyEvents: ReadonlySet<ModEvent> = new Set(['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SubagentStop'])

let live: Connection | undefined

const connection = (): Connection => {
  if (live === undefined) throw new Error('Modes has not started yet. Try again when the session is running.')
  return live
}

const causeText = (cause: EntryCause) => (cause.kind === 'start' || cause.kind === 'turn-end' ? cause.kind : `${cause.kind} ${cause.name}`)

export const modes = defineMod({
  name: 'modes',
  state: initialState,

  api: {
    current: async ({ agentId }: { readonly agentId?: string }, mod) => ({ mode: (agentId === undefined ? undefined : mod.state.memory.modes.agents[agentId]) ?? mod.state.memory.modes.main ?? null }),
    enter: async ({ mode, agentId, by }: { readonly mode: string; readonly agentId?: string; readonly by: string }) => {
      await connection().enter(mode, agentId, { kind: 'mod', name: by })
      return { mode }
    },
    modes: async (_input: Record<string, never>, mod) => ({ modes: (mod.state.memory.definitions?.modes ?? []).map(({ name, description, order }) => ({ name, description, order })) }),
    entries: async () => {
      const { entries } = await connection().post<{ readonly entries: readonly ModeEntry[] }>('/entries', { sessionId: (await connection().session()).id })
      return { entries: entries.map(({ mode, agentId, cause, at }) => ({ mode, cause: causeText(cause), at, ...(agentId === undefined ? {} : { agentId }) })) }
    },
    showTab: async ({ title, markdown }: { readonly title: string; readonly markdown: string }, mod) => {
      mod.state.memory.modeTab = { title, markdown }
      mod.state.session.tab = 'mode'
      return {}
    },
    hideTab: async (_input: Record<string, never>, mod) => {
      mod.state.memory.modeTab = null
      return {}
    },
  },

  setup(mod) {
    const link = connect(mod)
    live = link
    const commands = mod.use(modeCommands(link))
    mod.use(modeGates(link))

    const enter = (mode: string, cause: EntryCause) => {
      link.enter(mode, undefined, cause).catch((error: unknown) => mod.ui.toast(`Modes could not enter ${mode}: ${messageOf(error)}`))
    }
    const cycle = () => {
      const mode = nextMode(mod.state.memory.definitions, mod.state.memory.modes.main)
      if (mode !== undefined) enter(mode, { kind: 'command', name: 'band' })
    }

    const pane = mod.ui.pane(modesPane((mode) => enter(mode, { kind: 'command', name: 'panel' })))
    let isRefreshing = false
    let isStale = false
    const refreshHistory = async (): Promise<void> => {
      if (!pane.isOpen) return
      if (isRefreshing) {
        isStale = true
        return
      }
      isRefreshing = true
      try {
        await link.refreshHistory()
      } finally {
        isRefreshing = false
      }
      if (isStale) {
        isStale = false
        await refreshHistory()
      }
    }

    mod.use(
      slashCommand({
        name: 'modes',
        description: 'Show or hide the Modes panel: the mode, the history by task, and the settings',
        immediate: true,
        reply: async () => {
          await pane.toggle()
          await refreshHistory()
        },
      }),
    )

    const syncCommands = () => {
      const { definitions } = mod.state.memory
      if (definitions !== null) commands.sync(definitions)
    }

    for (const event of forwarded) {
      mod.on(event, async (input) => {
        const answer = await link.event(event, input as Readonly<Record<string, unknown>>)
        syncCommands()
        if (historyEvents.has(event)) void refreshHistory()
        return answerOf(event, answer.effects)
      })
    }
    mod.on('CwdChanged', async () => {
      await link.refresh()
    })

    mod.ui.render(slots.AbovePrompt, ({ hasSurvey, Default }) => {
      const { main } = mod.state.memory.modes
      if (hasSurvey || main === undefined) return <Default />
      return (
        <Box flexDirection="column">
          <Default />
          <Button key="mode" plain dimColor label={`mode: ${main}`} onPress={cycle} />
        </Box>
      )
    })

    void link.refresh().then(syncCommands, (error: unknown) => {
      mod.state.memory.failure = `The claude-modes program did not answer: ${messageOf(error)}`
    })
  },
})
