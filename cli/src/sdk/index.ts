import type { Hook, HookEvent } from 'claude-modes'

export const hookEvents: readonly HookEvent[] = [
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

export function defineHook<E extends HookEvent>(hook: Hook<E>): Hook<E> {
  return hook
}
