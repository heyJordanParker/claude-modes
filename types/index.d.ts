export type ModesEntry = {
  readonly mode: string
  readonly agentId?: string
  readonly cause: string
  readonly at: number
}

export type ModesSummary = {
  readonly name: string
  readonly description: string
  readonly order: number
}

export type Modes = {
  current(input: { readonly agentId?: string }): Promise<{ readonly mode: string | null }>
  enter(input: { readonly mode: string; readonly agentId?: string; readonly by: string }): Promise<{ readonly mode: string }>
  modes(input: Record<string, never>): Promise<{ readonly modes: readonly ModesSummary[] }>
  entries(input: Record<string, never>): Promise<{ readonly entries: readonly ModesEntry[] }>
  showTab(input: { readonly title: string; readonly markdown: string }): Promise<Record<string, never>>
  hideTab(input: Record<string, never>): Promise<Record<string, never>>
}

declare module 'claude-code' {
  interface CmodDependencies {
    modes: Modes
  }
}
