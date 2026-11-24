export type Patterns = string | readonly string[]

export type Target = {
  readonly command?: Patterns
  readonly read?: Patterns
  readonly write?: Patterns
  readonly fetch?: Patterns
  readonly subagent?: Patterns
  readonly tool?: Patterns
}

export type Gate = Target & {
  readonly reason?: string
}

export type Transition = Target & {
  readonly enter: string
}

export const modeColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'] as const

export type ModeColor = (typeof modeColors)[number]

export type ModeSpec = {
  readonly name: string
  readonly order: number
  readonly description: string
  readonly color?: ModeColor
  readonly rules: string
  readonly deny: readonly Gate[]
  readonly ask: readonly Gate[]
  readonly lasts?: 'turn'
  readonly after: readonly Transition[]
  readonly source: string
}

export type HookScript = {
  readonly name: string
  readonly source: string
  readonly events: readonly string[]
  readonly modes: readonly string[]
}

export type Problem = {
  readonly source: string
  readonly message: string
}

export type Definitions = {
  readonly version: number
  readonly modes: readonly ModeSpec[]
  readonly hooks: readonly HookScript[]
  readonly problems: readonly Problem[]
  readonly folders: readonly string[]
}

export type SessionRef = {
  readonly id: string
  readonly projectRoot: string
  readonly cwd: string
  readonly defaultMode: string
}

export type ModeState = {
  readonly main: string | undefined
  readonly agents: Readonly<Record<string, string>>
}

export type EntryCause =
  | { readonly kind: 'start' }
  | { readonly kind: 'command'; readonly name: string }
  | { readonly kind: 'skill'; readonly name: string }
  | { readonly kind: 'agent'; readonly name: string }
  | { readonly kind: 'transition'; readonly name: string }
  | { readonly kind: 'turn-end' }
  | { readonly kind: 'hook'; readonly name: string }
  | { readonly kind: 'mod'; readonly name: string }

export type ModeEntry = {
  readonly mode: string
  readonly agentId: string | undefined
  readonly cause: EntryCause
  readonly at: number
}

export type Effect =
  | { readonly deny: string }
  | { readonly ask: string }
  | { readonly context: string }
  | { readonly block: string }
  | { readonly enter: string }

export type EventRequest = {
  readonly session: SessionRef
  readonly event: string
  readonly input: Readonly<Record<string, unknown>>
  readonly commands: readonly (readonly string[])[]
}

export function rulesOf(mode: ModeSpec): string {
  return [`Mode: ${mode.name}${mode.description === '' ? '' : ` (${mode.description})`}`, mode.rules].filter((part) => part !== '').join('\n\n')
}

export type EventAnswer = {
  readonly effects: readonly Effect[]
  readonly modes: ModeState
  readonly version: number
}

export type EnterRequest = {
  readonly session: SessionRef
  readonly mode: string
  readonly agentId: string | undefined
  readonly cause: EntryCause
}

export type MessageKind = 'prompt' | 'reply' | 'tool call' | 'tool result' | 'skill' | 'document' | 'notice'

export type HistoryKind = 'goal' | 'context' | 'turn' | 'task' | 'mode' | MessageKind

export type HistoryNode = {
  readonly id: string
  readonly kind: HistoryKind
  readonly label: string
  readonly at: number
  readonly jump?: string
  readonly isError?: true
  readonly isRunning?: true
  readonly calls?: number
  readonly errors?: number
  readonly children?: readonly HistoryNode[]
}

export type History = {
  readonly root: HistoryNode
}
