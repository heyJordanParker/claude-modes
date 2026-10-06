# Contributing

## Set up

You need [Bun](https://bun.sh) 1.2.21 or later, Claude Code 2.1.287 or later, and the cmod command (`npm i -g @cmodjs/cli`).

```sh
git clone https://github.com/heyJordanParker/claude-modes.git
cd claude-modes
bun install
bun install --cwd cli
cmod link
```

`cmod link` builds `claude-modes` into `~/.local/bin` and loads the checkout in every new Claude Code session. A save to the mod reloads it at the end of the current turn. `cmod unlink` stops it.

## Check your change

```sh
bun test                      # the mod against the real program
bun test --cwd cli            # the program
bunx tsc --noEmit -p cli      # the program's types
bunx tsc --noEmit -p tests    # the tests' types
cmod check                    # layout, imports, Claude Code's validator, types, lint, and tests
```

The mod's own type check needs `.claude-plugin/types/`, which Claude Code writes the first time a session loads the checkout. Start `claude` once after `cmod link`.

## Where things go

- A message between the mod and the program: `src/protocol.ts`.
- Anything that needs Node, Bun, SQLite, or the disk: `cli/src/`.
- Anything that needs Claude Code: the permission check, commands, drawing, and other mods: `src/`.
- A new example: `examples/`. `cli/tests/examples.test.ts` loads it, so it must have no problem.

Write a failing test first, then the change that passes it.

## Release

Bump `version` in `.claude-plugin/plugin.json` and `cli/package.json`, add the release to `CHANGELOG.md`, commit, then run `cmod publish`. It builds `claude-modes` for macOS and Linux and attaches each build to the GitHub release.
