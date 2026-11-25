import { permissions } from '../node_modules/@cmodjs/core/jobs/permissions.js'
import { prompt } from '../node_modules/@cmodjs/core/jobs/prompt.js'
import { slashCommand } from '../node_modules/@cmodjs/core/jobs/slash-command.js'
import { tool } from '../node_modules/@cmodjs/core/jobs/tool.js'
import { defineMod, messageOf, sessions } from '../node_modules/@cmodjs/core/mod.js'
import { option } from '../node_modules/@cmodjs/core/options.js'
import { resolve } from '../node_modules/@cmodjs/core/path.js'
import { parseShell } from '../node_modules/@cmodjs/core/shell.js'
import { answersOf } from './answers.js'
import { connect } from './connection.js'
import { modeCommands, nextMode } from './jobs/mode-commands.js'
import { factsOf, modeRules, modeTransitions } from './jobs/mode-gates.js'
import { ruleModes } from './jobs/rule-modes.js'
import { enterMode, modeNameOf, modeOf, rulesToTell, skillModeOf } from './mode-state.js'
import { rulesOf, type EntryCause } from './protocol.js'
import { initialState, type ModesState } from './state.js'
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

function listOfModes(state: ModesState): string {
  const defined = state.memory.definitions?.modes ?? []
  if (defined.length === 0) return 'No modes are defined. A mode is a Markdown file in ~/.claude/cmods/modes/ or a project\'s .claude/cmods/modes/.'
  const { main, agents } = state.session.modes
  const lines = defined.flatMap((mode) => [
    `- ${mode.name}${mode.description === '' ? '' : `: ${mode.description}`}${mode.name === main ? ' (the session is in it)' : ''}`,
    ...factsOf(mode).map((fact) => `  ${fact}`),
  ])
  const subagents = Object.entries(agents).map(([agent, mode]) => `- ${agent} is in ${mode}`)
  const problems = (state.memory.definitions?.problems ?? []).map(({ source, message }) => `- ${source}: ${message}`)
  return [
    `The modes, in order. The session is ${main === undefined ? 'in no mode' : `in ${main}`}.`,
    ...lines,
    ...(subagents.length === 0 ? [] : ['', 'Subagents:', ...subagents]),
    ...(problems.length === 0 ? [] : ['', 'Problems:', ...problems]),
  ].join('\n')
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
    const link = connect(mod)
    const commands = mod.use(modeCommands())
    mod.use(permissions(modeRules))
    mod.use(modeTransitions())
    mod.use(ruleModes())
    mod.use(prompt({ name: 'Mode', prompt: (_input, current) => {
      const mode = modeOf(current.state, undefined)
      return mode === undefined ? undefined : rulesOf(mode)
    } }))

    const enter = (mode: string, cause: EntryCause): string | undefined => {
      try {
        enterMode(mod.state, mode, undefined, cause)
        return undefined
      } catch (error) {
        return messageOf(error)
      }
    }
    const cycle = (by: string) => {
      const mode = nextMode(mod.state.memory.definitions, mod.state.session.modes.main)
      if (mode === undefined) return 'No modes yet. Add a mode file to ~/.claude/cmods/modes/, such as review.md.'
      return enter(mode, { kind: 'command', name: by })
    }
    const toastFailure = (mode: string, failure: string | undefined) => void (failure === undefined || mod.toast.error(`Modes could not enter ${mode}`, { description: failure }))

    const view = mod.views.add(modesView((mode) => toastFailure(mode, enter(mode, { kind: 'command', name: 'panel' })), defaultMode))
    mod.widgets.add(modeWidget(() => toastFailure('the next mode', cycle('band'))))
    mod.hotkeys.cycle.onPress(() => toastFailure('the next mode', cycle('hotkey')))

    mod.use(
      slashCommand({
        name: 'mode',
        description: 'Switch to the next mode, or to the mode you name',
        argumentHint: '[mode]',
        immediate: true,
        reply: ({ args }) => {
          const named = args.trim()
          const failure = named === '' ? cycle('mode') : enter(named, { kind: 'command', name: 'mode' })
          return failure === undefined ? undefined : `/mode failed: ${failure}`
        },
      }),
    )
    mod.use(
      tool({
        name: 'list_modes',
        description: "List Modes' modes in order, with what each refuses, asks about, and enters, the mode the session and each subagent is in, and each problem in the mode files and hook scripts.",
        isDeferred: true,
        execute: async () => {
          await refresh()
          return listOfModes(mod.state)
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

    const syncCommands = () => {
      const { definitions } = mod.state.memory
      if (definitions !== null) commands.sync(definitions)
    }
    const refresh = async () => {
      try {
        await link.refresh()
        syncCommands()
      } catch (error) {
        mod.state.memory.failure = `The claude-modes program did not answer: ${messageOf(error)}`
      }
    }
    const enterAs = (mode: string | undefined, agentId: string | undefined, cause: EntryCause) => {
      if (mode !== undefined) enterMode(mod.state, mode, agentId, cause)
    }

    const runHooks = async (name: string, place: { readonly task?: string | undefined; readonly agentType?: string | undefined; readonly cwd?: string | undefined }, fields: Fields, commandLines: readonly (readonly string[])[] = []) => {
      const mode = modeNameOf(mod.state, place.task)
      const hooks = mod.state.memory.definitions?.hooks ?? []
      if (!hooks.some(({ events, modes: names }) => events.includes(name) && (names.length === 0 || (mode !== undefined && names.includes(mode))))) return []
      const cwd = place.cwd ?? sessions.current.cwd
      const input = {
        hook_event_name: name,
        session_id: sessions.current.id,
        cwd,
        ...(place.task === undefined ? {} : { agent_id: place.task }),
        ...(place.agentType === undefined ? {} : { agent_type: place.agentType }),
        ...fields,
      }
      const effects = await link.hook(name, input, { session: { id: sessions.current.id, projectRoot: sessions.current.project, cwd }, mode, agentId: place.task, commands: commandLines })
      for (const effect of effects) if ('enter' in effect) enterMode(mod.state, effect.enter, place.task, { kind: 'hook', name: effect.hook })
      return effects
    }
    const toldRules = (agentId: string | undefined, always: boolean) => {
      const mode = agentId === undefined ? undefined : rulesToTell(mod.state, agentId, always)
      return mode === undefined ? [] : [{ context: rulesOf(mode) }]
    }
    const toolFields = (call: { readonly callId?: string | undefined; readonly name: string; readonly input: Fields }, cwd: string) => ({
      tool_name: call.name,
      tool_input: call.input,
      tool_use_id: call.callId ?? '',
      files: filesOf(call.name, call.input, cwd),
    })

    sessions.current.beforeSessionStart(async (start) => {
      await refresh()
      const definitions = mod.state.memory.definitions
      if (mod.state.session.modes.main === undefined && definitions !== null) {
        const fromAgent = start.agentType === undefined ? undefined : definitions.agentModes[start.agentType]
        const names = definitions.modes.map(({ name }) => name)
        const initial = fromAgent ?? (names.includes(defaultMode()) ? defaultMode() : names[0])
        enterAs(initial, undefined, fromAgent === undefined ? { kind: 'start' } : { kind: 'agent', name: start.agentType ?? '' })
      }
      const { note } = answersOf(await runHooks('SessionStart', start, { source: start.source }))
      return note === undefined ? undefined : { note }
    })
    sessions.current.onSessionEnd((end) => runHooks('SessionEnd', end, { reason: end.reason }))

    const startedTasks = new Set<string>()
    sessions.current.goal.beforePrompt(async (message) => {
      if (message.task === undefined) {
        await refresh()
        const skill = /^\/([^\s]+)/.exec(message.text)?.[1]
        if (skill !== undefined) enterAs(skillModeOf(mod.state, skill), undefined, { kind: 'skill', name: skill })
        const { refuse, note } = answersOf(await runHooks('UserPromptSubmit', {}, { prompt: message.text }))
        return refuse !== undefined ? { refuse } : note === undefined ? undefined : { note }
      }
      if (startedTasks.has(message.task)) return undefined
      startedTasks.add(message.task)
      const agentType = message.agentType
      if (agentType !== undefined) enterAs(mod.state.memory.definitions?.agentModes[agentType], message.task, { kind: 'agent', name: agentType })
      const { note } = answersOf([...(await runHooks('SubagentStart', message, { agent_type: agentType })), ...toldRules(message.task, true)])
      return note === undefined ? undefined : { note }
    })

    sessions.current.beforePermissionCheck(async (check) => {
      const effects = [...(await runHooks('PreToolUse', check, toolFields(check, check.cwd), commandsOf(check.name, check.input))), ...toldRules(check.task, false)]
      const { refuse, ask, note } = answersOf(effects)
      const withNote = note === undefined ? {} : { note }
      return refuse !== undefined ? { refuse, ...withNote } : ask !== undefined ? { ask, ...withNote } : note === undefined ? undefined : { note }
    })
    sessions.current.goal.beforeToolResult(async (result) => {
      const skill = result.name === 'Skill' ? result.input['skill'] : undefined
      if (typeof skill === 'string') enterAs(skillModeOf(mod.state, skill), result.task, { kind: 'skill', name: skill })
      const outcome = result.isError ? { error: typeof result.output === 'string' ? result.output : JSON.stringify(result.output) } : { tool_response: result.output }
      const event = result.isError ? 'PostToolUseFailure' : 'PostToolUse'
      const effects = [...(await runHooks(event, { task: result.task, cwd: result.cwd }, { ...toolFields(result, result.cwd), ...outcome }, commandsOf(result.name, result.input))), ...toldRules(result.task, false)]
      const { note } = answersOf(effects)
      return note === undefined ? undefined : { note }
    })

    sessions.current.goal.beforeTurnEnd(async (turn) => {
      const { task, agentType } = turn.prompt
      const ending = turn.answer === undefined ? {} : { last_assistant_message: turn.answer }
      if (task !== undefined) {
        const { refuse, note } = answersOf(await runHooks('SubagentStop', turn.prompt, { agent_type: agentType, stop_hook_active: turn.isAfterRefusal === true, ...ending }))
        return refuse !== undefined ? { refuse } : note === undefined ? undefined : { note }
      }
      const { previous } = mod.state.session
      if (modeOf(mod.state, undefined)?.lasts === 'turn' && previous !== null) enterAs(previous, undefined, { kind: 'turn-end' })
      const { refuse, note } = answersOf(await runHooks('Stop', {}, { stop_hook_active: turn.isAfterRefusal === true, ...ending }))
      return refuse !== undefined ? { refuse } : note === undefined ? undefined : { note }
    })
    sessions.current.beforeContextEnd(async () => {
      await runHooks('PreCompact', {}, {})
      return undefined
    })
    sessions.current.onNotification((notification) => runHooks('Notification', notification, { message: notification.text }))
    sessions.current.onCwdChange(() => refresh())

    void refresh()

    return {
      current: async ({ agentId }: { readonly agentId?: string }) => ({ mode: modeNameOf(mod.state, agentId) ?? null }),
      enter: async ({ mode, agentId, by }: { readonly mode: string; readonly agentId?: string; readonly by: string }) => {
        enterMode(mod.state, mode, agentId, { kind: 'mod', name: by })
        return { mode }
      },
      modes: async () => ({ modes: (mod.state.memory.definitions?.modes ?? []).map(({ name, description, order }) => ({ name, description, order })) }),
      entries: async () => ({ entries: mod.state.session.entries.map(({ mode, agentId, cause, at }) => ({ mode, cause: causeText(cause), at, ...(agentId === undefined ? {} : { agentId }) })) }),
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
