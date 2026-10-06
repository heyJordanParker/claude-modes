import type { HookAnswer, ModEvent } from '../node_modules/@cmodjs/core/mod.js'
import type { Effect } from './protocol.js'

export function answerOf(event: ModEvent, effects: readonly Effect[]): HookAnswer | undefined {
  const denies = effects.flatMap((effect) => ('deny' in effect ? [effect.deny] : []))
  const asks = effects.flatMap((effect) => ('ask' in effect ? [effect.ask] : []))
  const contexts = effects.flatMap((effect) => ('context' in effect ? [effect.context] : []))
  const blocks = effects.flatMap((effect) => ('block' in effect ? [effect.block] : []))

  const decision =
    denies.length > 0
      ? { permissionDecision: 'deny' as const, permissionDecisionReason: denies.join('\n') }
      : asks.length > 0
        ? { permissionDecision: 'ask' as const, permissionDecisionReason: asks.join('\n') }
        : {}
  const output = { ...decision, ...(contexts.length === 0 ? {} : { additionalContext: contexts.join('\n\n') }) }
  const answer: HookAnswer = {
    ...(blocks.length === 0 ? {} : { decision: 'block' as const, reason: blocks.join('\n') }),
    ...(Object.keys(output).length === 0 ? {} : { hookSpecificOutput: { hookEventName: event, ...output } }),
  }
  return Object.keys(answer).length === 0 ? undefined : answer
}
