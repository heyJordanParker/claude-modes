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
  readonly agentModes: Readonly<Record<string, string>>
  readonly skillModes: Readonly<Record<string, string>>
  readonly problems: readonly Problem[]
  readonly folders: readonly string[]
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
  | { readonly enter: string; readonly hook: string }

export type HookRequest = {
  readonly projectRoot: string
  readonly event: string
  readonly input: Readonly<Record<string, unknown>>
  readonly context: {
    readonly session: { readonly id: string; readonly projectRoot: string; readonly cwd: string }
    readonly mode: string | undefined
    readonly agentId: string | undefined
    readonly commands: readonly (readonly string[])[]
  }
}

export type HookAnswer = {
  readonly effects: readonly Effect[]
  readonly version: number
}

export function rulesOf(mode: ModeSpec): string {
  return [`Mode: ${mode.name}${mode.description === '' ? '' : ` (${mode.description})`}`, mode.rules].filter((part) => part !== '').join('\n\n')
}
