# Modes

- The root is the Modes mod, the plugin named `modes`. `cli/` is the `claude-modes` program it starts, one per Claude Code session.
- `node_modules/@cmodjs/core/docs/` holds the docs of the installed `@cmodjs/core`. Read the doc for the part you change, starting at `index.md`, before mod work.
- `src/protocol.ts` holds every message between the mod and the program. The program imports it as `../../src/protocol.ts`. Nothing in `src/` or `tests/` imports from `cli/`, because the release leaves `cli/` out.
- Mod code in `src/` runs with no Node or Bun. The program in `cli/` runs in Bun, and owns SQLite, the definition files, and hook scripts.
- `hooks/register.ts` registers the mod and one raw `ui.press` hook, which scrolls the conversation to a History row. cmod's API has no scroll call.
- `tsc` for the mod needs `.claude-plugin/types/`, which Claude Code writes the first time a session loads the mod. `tests/tsconfig.json` type-checks the tests, which use Bun to start the real program.
- `bun test` in the root runs the mod against the real program. `bun test` in `cli/` runs the program's own tests.
- `cmod check` checks the mod. `cmod link` loads this checkout in new Claude Code sessions and builds `claude-modes` into `~/.local/bin`.
- `examples/` must load with no problem: `cli/tests/examples.test.ts` loads every file in it.
