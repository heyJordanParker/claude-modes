# Contributing

## Set up

You need [Bun](https://bun.sh) 1.2.21 or later, Claude Code 2.1.292 or later, and the cmod command 8.3.2 or later (`npm i -g @cmodjs/cli`).

```sh
git clone https://github.com/heyJordanParker/claude-modes.git
cd claude-modes
bun install
bun install --cwd cli
cmod link
```

`cmod link` builds `claude-modes` into cmod's programs folder and `~/.local/bin`, and loads the checkout in every new Claude Code session. A save to the mod reloads it at the end of the current turn. `cmod unlink` stops it.

## Check your change

```sh
bun test                      # the mod against the real program
bun test --cwd cli            # the program
bunx tsc --noEmit -p cli      # the program's types
cmod check                    # layout, imports, the bundle, Claude Code's validator, types, lint, and tests
```

The mod's own type check needs `.claude-plugin/types/`, which `cmod check` writes when it is missing, so run it once before `tsc` in a fresh clone.

## Where things go

- A message between the mod and the program: `src/protocol.ts`.
- Anything that needs Node, Bun, SQLite, or the disk: `cli/src/`.
- Anything that needs Claude Code: the permission check, the rules Claude reads, commands, drawing, and other mods: `src/`.
- A new kind of call the mod makes, such as to a new host: a row in the README's "What Modes asks for".
- A new example: `examples/`. `cli/tests/examples.test.ts` loads it, so it must have no problem.

Write a failing test first, then the change that passes it.

## Release

Bump `version` in `.claude-plugin/plugin.json` and `cli/package.json`, add the release to `CHANGELOG.md`, commit, and push to `main`. The Release workflow sees a version with no tag yet and runs `cmod publish`, which:

- builds the release from the files `package.json` lists, with the hooks module bundled
- builds `claude-modes` for macOS and Linux and attaches each build to the GitHub release `v<version>`
- writes and commits `.claude-plugin/marketplace.json`, which `/plugin marketplace add` reads

`cmod publish --dry-run` builds all of it locally and pushes nothing.
