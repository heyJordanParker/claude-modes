declare module 'claude-modes' {
  export type HookEvent =
    | 'SessionStart'
    | 'SessionEnd'
    | 'UserPromptSubmit'
    | 'PreToolUse'
    | 'PostToolUse'
    | 'PostToolUseFailure'
    | 'Stop'
    | 'SubagentStart'
    | 'SubagentStop'
    | 'PreCompact'
    | 'Notification'

  type Base<E extends HookEvent> = {
    readonly session_id: string
    readonly cwd: string
    readonly hook_event_name: E
    readonly agent_id?: string
    readonly agent_type?: string
  }

  type ToolEvent<E extends HookEvent> = Base<E> & {
    readonly tool_name: string
    readonly tool_input: Readonly<Record<string, unknown>>
    readonly tool_use_id: string
    readonly files: { readonly read: readonly string[]; readonly changed: readonly string[] }
  }

  export type HookInputs = {
    readonly SessionStart: Base<'SessionStart'> & { readonly source: 'startup' | 'resume' | 'clear' | 'compact' | 'fork' }
    readonly SessionEnd: Base<'SessionEnd'> & { readonly reason?: string }
    readonly UserPromptSubmit: Base<'UserPromptSubmit'> & { readonly prompt: string }
    readonly PreToolUse: ToolEvent<'PreToolUse'>
    readonly PostToolUse: ToolEvent<'PostToolUse'> & { readonly tool_response: unknown }
    readonly PostToolUseFailure: ToolEvent<'PostToolUseFailure'> & { readonly error?: string }
    readonly Stop: Base<'Stop'> & { readonly stop_hook_active: boolean; readonly last_assistant_message?: string }
    readonly SubagentStart: Base<'SubagentStart'> & { readonly agent_id: string; readonly agent_type: string }
    readonly SubagentStop: Base<'SubagentStop'> & { readonly agent_id: string; readonly agent_type: string; readonly last_assistant_message?: string }
    readonly PreCompact: Base<'PreCompact'> & { readonly trigger?: 'manual' | 'auto' }
    readonly Notification: Base<'Notification'> & { readonly message?: string }
  }

  export type Effect =
    | { readonly deny: string }
    | { readonly ask: string }
    | { readonly context: string }
    | { readonly block: string }
    | { readonly enter: string }

  export type HookContext = {
    readonly session: { readonly id: string; readonly projectRoot: string; readonly cwd: string }
    readonly mode: string | undefined
    readonly agentId: string | undefined
    readonly commands: readonly (readonly string[])[]
  }

  export type Hook<E extends HookEvent = HookEvent> = {
    readonly on: E | readonly E[]
    readonly mode?: string | readonly string[]
    run(input: HookInputs[E], context: HookContext): Effect | undefined | void | Promise<Effect | undefined | void>
  }

  export function defineHook<E extends HookEvent>(hook: Hook<E>): Hook<E>
}
