import { defineHook } from 'claude-modes'

const reverts = [
  ['git', 'restore'],
  ['git', 'checkout', '--'],
  ['git', 'reset', '--hard'],
  ['git', 'clean'],
]

export default defineHook({
  on: 'PreToolUse',
  run: (_input, { commands }) =>
    commands.some((words) => reverts.some((revert) => revert.every((word, index) => words[index] === word)))
      ? { deny: 'Reverting files throws away work that other agents may share. Fix forward instead.' }
      : undefined,
})
