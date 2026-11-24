# Modes

- The root is the Modes mod, the plugin named `modes`. `cli/` is the `claude-modes` program it starts, one per Claude Code session.
- `node_modules/@cmodjs/core/docs/` holds the docs of the installed `@cmodjs/core`. Read the doc for the part you change, starting at `index.md`, before mod work.
- `src/protocol.ts` holds every message between the mod and the program. The program imports it as `../../src/protocol.ts`. Nothing in `src/` or `tests/` imports from `cli/`, because the release leaves `cli/` out.
- Mod code in `src/` runs with no Node or Bun. The program in `cli/` runs in Bun, and owns SQLite, the definition files, and hook scripts.
- The mod reaches the program on `127.0.0.1` with a per-session token in `CLAUDE_MODES_TOKEN`.
- `package.json`'s `cmod` key declares the program, `approve`, and the hotkeys `cmod check` writes from `defineMod`.
- `types/index.d.ts` copies rulebook's `rulebook/Rules` interface, because Modes does not list rulebook as a dependency. A rule's `metadata.mode` is Modes' key, and rulebook never reads it.
- cmod lists no `rulebook/Rules` provider during `setup` when rulebook starts after Modes, so `src/jobs/rule-modes.ts` lists rulebook's providers again at each `cmod/Providers` `Change`.
- `tsc` for the mod needs `.claude-plugin/types/`, which `cmod check` writes when it is missing. `tests/tsconfig.json` type-checks the tests, which use Bun to start the real program.
- `bun test` in the root runs the mod against the real program. `bun test` in `cli/` runs the program's own tests.
- `cmod check` checks the mod. `cmod link` loads this checkout in new Claude Code sessions and builds `claude-modes` into cmod's programs folder.
- `examples/` must load with no problem: `cli/tests/examples.test.ts` loads every file in it.
