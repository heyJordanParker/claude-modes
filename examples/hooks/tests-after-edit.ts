import { defineHook } from 'claude-modes'

export default defineHook({
  on: 'PostToolUse',
  mode: 'build',
  run: (input) =>
    input.files.changed.some((path) => /\.(ts|tsx)$/.test(path))
      ? { context: 'You changed TypeScript. Run the tests before you report the change as done.' }
      : undefined,
})
