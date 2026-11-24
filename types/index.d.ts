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

export type RuleSeverity = 'error' | 'warn' | 'ask'
export type ListedRule = { readonly id: string; readonly description: string; readonly severity: RuleSeverity; readonly metadata: Readonly<Record<string, unknown>> }
export type RulebookCheck = { readonly path: string; readonly session: string; readonly task?: string; readonly agentType?: string; readonly tool?: string; readonly rules: readonly ListedRule[] }

declare module 'claude-code' {
  interface CmodDependencies {
    modes: Modes
  }
  interface CmodInterfaces {
    'rulebook/Rules': {
      methods: { rules(folder: string): readonly ListedRule[] }
      events: { Check: RulebookCheck }
    }
  }
}
