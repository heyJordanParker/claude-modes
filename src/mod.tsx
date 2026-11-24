import { permissions } from '../node_modules/@cmodjs/core/jobs/permissions.js'
import { prompt } from '../node_modules/@cmodjs/core/jobs/prompt.js'
import { slashCommand } from '../node_modules/@cmodjs/core/jobs/slash-command.js'
import { defineMod, messageOf, sessions } from '../node_modules/@cmodjs/core/mod.js'
import { option } from '../node_modules/@cmodjs/core/options.js'
import { resolve } from '../node_modules/@cmodjs/core/path.js'
import { parseShell } from '../node_modules/@cmodjs/core/shell.js'
import { answersOf } from './answers.js'
import { connect } from './connection.js'
import { modeCommands, nextMode } from './jobs/mode-commands.js'
import { modeNameOf, modeOf, modeRules, modeTransitions } from './jobs/mode-gates.js'
import { ruleModes } from './jobs/rule-modes.js'
import { rulesOf, type EntryCause } from './protocol.js'
import { initialState } from './state.js'
import { modesView } from './views/modes.js'
import { modeWidget } from './widgets/mode.js'

type Fields = Readonly<Record<string, unknown>>

const causeText = (cause: EntryCause) => (cause.kind === 'start' || cause.kind === 'turn-end' ? cause.kind : `${cause.kind} ${cause.name}`)

const commandsOf = (name: string, input: Fields): string[][] => (name === 'Bash' && typeof input['command'] === 'string' ? parseShell(input['command']).commands.map(({ argv }) => argv) : [])

function filesOf(name: string, input: Fields, cwd: string): { readonly read: readonly string[]; readonly changed: readonly string[] } {
  const path = typeof input['file_path'] === 'string' ? [resolve(cwd, input['file_path'])] : typeof input['notebook_path'] === 'string' ? [resolve(cwd, input['notebook_path'])] : []
  if (name === 'Read') return { read: path, changed: [] }
  if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') return { read: [], changed: path }
  if (name !== 'Bash' || typeof input['command'] !== 'string') return { read: [], changed: [] }
  const { reads, writes } = parseShell(input['command'])
  return { read: reads.map((file) => resolve(cwd, file)), changed: writes.map((file) => resolve(cwd, file)) }
}

export const modes = defineMod({
  name: 'modes',
  state: initialState,
  options: {
    defaultMode: option.text({ title: 'Starting mode', description: 'The mode a new session starts in. Leave it empty to start in the first mode.', default: '' }),
  },
  hotkeys: {
    cycle: { title: 'Switch to the next mode', default: 'shift+tab' },
  },

  setup(mod) {
    const defaultMode = () => mod.options.defaultMode
    const link = connect(mod, defaultMode)
    const commands = mod.use(modeCommands(link))
    mod.use(permissions(modeRules))
    mod.use(modeTransitions(link))
    mod.use(ruleModes())
    mod.use(prompt({ name: 'Mode', prompt: (_input, current) => {
      const mode = modeOf(current.state, undefined)
      return mode === undefined ? undefined : rulesOf(mode)
    } }))

    const enter = async (mode: string, cause: EntryCause): Promise<string | undefined> => {
      try {
        await link.enter(mode, undefined, cause)
        return undefined
      } catch (error) {
        return messageOf(error)
      }
    }
    const cycle = async (by: string) => {
      const mode = nextMode(mod.state.memory.definitions, mod.state.memory.modes.main)
      if (mode === undefined) return 'No modes yet. Add a mode file to ~/.claude/cmods/modes/, such as review.md.'
      return enter(mode, { kind: 'command', name: by })
    }
    const toastFailure = (mode: string) => (failure: string | undefined) => void (failure === undefined || mod.toast.error(`Modes could not enter ${mode}`, { description: failure }))

    const view = mod.views.add(modesView((mode) => void enter(mode, { kind: 'command', name: 'panel' }).then(toastFailure(mode)), defaultMode))
    mod.widgets.add(modeWidget(() => void cycle('band').then(toastFailure('the next mode'))))
    mod.hotkeys.cycle.onPress(() => cycle('hotkey').then(toastFailure('the next mode')))

    mod.use(
      slashCommand({
        name: 'mode',
        description: 'Switch to the next mode, or to the mode you name',
        argumentHint: '[mode]',
        immediate: true,
        reply: async ({ args }) => {
          const named = args.trim()
          const failure = named === '' ? await cycle('mode') : await enter(named, { kind: 'command', name: 'mode' })
          return failure === undefined ? undefined : `/mode failed: ${failure}`
        },
      }),
    )
    mod.use(
      slashCommand({
        name: 'modes',
        description: 'Show or hide the Modes view: the modes, the hook scripts, and their problems',
        immediate: true,
        reply: () => view.toggle({ focus: true }),
      }),
    )

    const event = async (name: string, place: { readonly task?: string | undefined; readonly agentType?: string | undefined; readonly cwd?: string | undefined }, fields: Fields, commandLines: readonly (readonly string[])[] = []) => {
      const input = {
        hook_event_name: name,
        session_id: sessions.current.id,
        cwd: place.cwd ?? sessions.current.cwd,
        ...(sessions.current.transcriptPath === undefined ? {} : { transcript_path: sessions.current.transcriptPath }),
        ...(place.task === undefined ? {} : { agent_id: place.task }),
        ...(place.agentType === undefined ? {} : { agent_type: place.agentType }),
        ...fields,
      }
      const answer = await link.event(name, input, commandLines)
      syncCommands()
      return answersOf(answer.effects)
    }
    const toolFields = (call: { readonly callId?: string | undefined; readonly name: string; readonly input: Fields }, cwd: string) => ({
      tool_name: call.name,
      tool_input: call.input,
      tool_use_id: call.callId ?? '',
      files: filesOf(call.name, call.input, cwd),
    })

    sessions.current.beforeSessionStart(async (start) => {
      const { note } = await event('SessionStart', start, { source: start.source })
      return note === undefined ? undefined : { note }
    })
    sessions.current.onSessionEnd((end) => event('SessionEnd', end, { reason: end.reason }))

    const startedTasks = new Set<string>()
    sessions.current.goal.beforePrompt(async (message) => {
      if (message.task === undefined) {
        const { refuse, note } = await event('UserPromptSubmit', {}, { prompt: message.text })
        return refuse !== undefined ? { refuse } : note === undefined ? undefined : { note }
      }
      if (startedTasks.has(message.task)) return undefined
      startedTasks.add(message.task)
      const { note } = await event('SubagentStart', message, { agent_type: message.agentType })
      return note === undefined ? undefined : { note }
    })

    sessions.current.beforePermissionCheck(async (check) => {
      const { refuse, ask, note } = await event('PreToolUse', check, toolFields(check, check.cwd), commandsOf(check.name, check.input))
      const withNote = note === undefined ? {} : { note }
      return refuse !== undefined ? { refuse, ...withNote } : ask !== undefined ? { ask, ...withNote } : note === undefined ? undefined : { note }
    })
    sessions.current.goal.beforeToolResult(async (result) => {
      const outcome = result.isError ? { error: typeof result.output === 'string' ? result.output : JSON.stringify(result.output) } : { tool_response: result.output }
      const { note } = await event(result.isError ? 'PostToolUseFailure' : 'PostToolUse', { task: result.task, cwd: result.cwd }, { ...toolFields(result, result.cwd), ...outcome }, commandsOf(result.name, result.input))
      return note === undefined ? undefined : { note }
    })

    sessions.current.goal.beforeTurnEnd(async (turn) => {
      const { task, agentType } = turn.prompt
      const ending = turn.answer === undefined ? {} : { last_assistant_message: turn.answer }
      const { refuse, note } =
        task === undefined
          ? await event('Stop', {}, { stop_hook_active: turn.isAfterRefusal === true, ...ending })
          : await event('SubagentStop', turn.prompt, { agent_type: agentType, stop_hook_active: turn.isAfterRefusal === true, ...ending })
      return refuse !== undefined ? { refuse } : note === undefined ? undefined : { note }
    })
    sessions.current.beforeContextEnd(async () => {
      await event('PreCompact', {}, {})
      return undefined
    })
    sessions.current.onNotification((notification) => event('Notification', notification, { message: notification.text }))
    sessions.current.onCwdChange(() => link.refresh())

    const syncCommands = () => {
      const { definitions } = mod.state.memory
      if (definitions !== null) commands.sync(definitions)
    }

    void link.refresh().then(syncCommands, (error: unknown) => {
      mod.state.memory.failure = `The claude-modes program did not answer: ${messageOf(error)}`
    })

    return {
      current: async ({ agentId }: { readonly agentId?: string }) => ({ mode: modeNameOf(mod.state, agentId) ?? null }),
      enter: async ({ mode, agentId, by }: { readonly mode: string; readonly agentId?: string; readonly by: string }) => {
        await link.enter(mode, agentId, { kind: 'mod', name: by })
        return { mode }
      },
      modes: async () => ({ modes: (mod.state.memory.definitions?.modes ?? []).map(({ name, description, order }) => ({ name, description, order })) }),
      entries: async () => {
        const { entries } = await link.post<{ readonly entries: readonly { readonly mode: string; readonly agentId?: string; readonly cause: EntryCause; readonly at: number }[] }>('/entries', { sessionId: sessions.current.id })
        return { entries: entries.map(({ mode, agentId, cause, at }) => ({ mode, cause: causeText(cause), at, ...(agentId === undefined ? {} : { agentId }) })) }
      },
      showTab: async ({ title, markdown }: { readonly title: string; readonly markdown: string }) => {
        mod.state.memory.modeTab = { title, markdown }
        mod.state.session.tab = 'mode'
        return {}
      },
      hideTab: async () => {
        mod.state.memory.modeTab = null
        return {}
      },
    }
  },
})
