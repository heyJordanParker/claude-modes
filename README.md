# Modes

[![CI](https://github.com/heyJordanParker/claude-modes/actions/workflows/ci.yml/badge.svg)](https://github.com/heyJordanParker/claude-modes/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Modes for Claude Code that you define in plain files. A mode says what Claude may do, what it reads while the mode lasts, and how the session moves to the next one. You switch modes with one key, and the Modes view lists every mode and hook script.

```text
❯ plan the login page
mode: propose                                     ← the Mode widget below the prompt; a press moves on
```

- **Modes are Markdown files.** The frontmatter names what the mode refuses or asks about. The body is the rules Claude reads when the mode starts.
- **Hooks are TypeScript files.** A script imports `defineHook` from `claude-modes` and answers Claude Code's events. No plugin, no build, no restart.
- **Agents and Skills enter modes.** `modes.mode: build` in a Skill's `metadata` enters build when the Skill loads.
- **A save applies to the next event.** Modes notices the change on the next prompt or tool call.
- **rulebook rules belong to modes.** A rule with `metadata: { mode: 'propose' }` runs only for an agent in propose mode.

Modes is a [Claude Mod Manager](https://github.com/heyJordanParker/cmod) mod. The plugin is named `modes`.

## Install

In Claude Code, add the Modes marketplace and install the plugin:

```text
/plugin marketplace add heyJordanParker/claude-modes
/plugin install modes@modes
```

Claude Code installs the cmod plugin with it, and Modes opens its installer, which lists what it asks for. Or, in a terminal:

```sh
npm i -g @cmodjs/cli
cmod install heyJordanParker/claude-modes
```

Type `/modes` to open the Modes view.

### What Modes asks for

The installer asks you to accept each of these, and `/mods modes` turns each one off again:

| Permission | Why |
| --- | --- |
| Run claude-modes on your computer | The program that keeps the session store and runs your hook scripts. cmod downloads it from this repository's release. |
| Connect to 127.0.0.1 | The mod talks to its own `claude-modes` program on a local port. The program answers only requests with the token its mod gave it. |
| Read this conversation | The program reads the session's transcript into its store, for `claude-modes show` and `export`. |
| Add text Claude reads and start turns | A mode's rules reach Claude, and your hook scripts can add context. |
| Approve Claude's tool calls for you | An `ask` rule asks you before a call, and a hook script can answer `ask`. Modes never allows a call by itself. |
| Bind shift+tab | shift+tab switches modes. It replaces shift+tab's built-in cycle of permission modes. A key you already bound stays yours, and you change the key in Settings, under modes, Hotkeys. |

## Define a mode

Each mode is one Markdown file in `~/.claude/cmods/modes/`, or in a project's `.claude/cmods/modes/` to share it with a team. The file name is the mode's name and its command.

`~/.claude/cmods/modes/propose.md`:

```markdown
---
order: 1
description: plan before you build
deny:
  - write: ["**", "!docs/plans/**"]
    reason: Write the plan in docs/plans/.
  - command: git commit
---
You are proposing. You change no file outside docs/plans/ and make no commit.
```

`~/.claude/cmods/modes/commit.md`:

```markdown
---
order: 3
lasts: turn
after:
  - command: git commit
    enter: propose
---
Commit the work, then stop.
```

| Key | What it does |
| --- | --- |
| `order` | The mode's place in the cycle. Lower comes first. |
| `description` | One line, shown in the Modes view and in `/<mode>`'s help. |
| `deny` | Calls the mode refuses. Each rule names one target, and may add a `reason`. |
| `ask` | Calls Claude Code asks you about first. Same rules as `deny`. |
| `lasts: turn` | The mode ends when the turn ends, and the session returns to the mode before it. |
| `after` | Rules that enter another mode once a matching call succeeds. |

A rule's target is one of `command`, `read`, `write`, `fetch`, `subagent`, or `tool`, with the pattern rules of cmod's permissions. A pattern that starts with `!` leaves calls out, as `"!docs/plans/**"` does. [docs/modes.md](docs/modes.md) has every rule.

## Write a hook

A hook is a TypeScript file in `~/.claude/cmods/modes/hooks/`, or a project's `.claude/cmods/modes/hooks/`.

```ts
import { defineHook } from 'claude-modes'

export default defineHook({
  on: 'PreToolUse',
  mode: 'build',
  run: (_input, { commands }) =>
    commands.some(([program, verb]) => program === 'git' && verb === 'restore')
      ? { deny: 'Reverting throws away work. Fix forward instead.' }
      : undefined,
})
```

`run` gets Claude Code's hook input and a context with the session, the current mode, and the Bash commands of a tool call. It answers one effect: `deny`, `ask`, `context`, `block`, or `enter`. Modes writes `claude-modes.d.ts` and a `tsconfig.json` beside your scripts, so your editor checks them. [docs/hooks.md](docs/hooks.md) lists each event and the effects it takes.

## Enter a mode from an Agent or a Skill

```yaml
---
name: ship
metadata:
  modes.mode: commit
---
```

A Skill enters its mode when it loads. An Agent sets the mode its session, or its subagent, starts in. The key sits under `metadata` with Modes' name in front, cmod's convention for a mod's own keys, so a Skill still uploads to claude.ai and the Skills API, which refuse unknown top-level keys.

## Switch modes

- `/mode` moves to the next mode, and `/mode <name>` enters one.
- `/<name>` enters that mode. Each mode file adds its command.
- shift+tab moves to the next mode.
- A press on `mode: <name>` below the prompt moves to the next mode.

Claude lists the modes with the `list_modes` tool: each mode in order, what it refuses, asks about, and enters, and the mode the session and each subagent is in.

## The Modes view

`/modes` opens the Modes view in the Sidebar beside the conversation. It lists each mode with what it refuses and how it ends, the hook scripts, every problem in your files, and the mode new sessions start in. A mod built on Modes can add a first tab of its own.

## rulebook rules in a mode

A [rulebook](https://github.com/heyJordanParker/rulebook) rule that names a mode in its `metadata` runs only for an agent in that mode, the main agent or a subagent. rulebook runs every check, and Modes answers each one with the rules to turn off:

```ts
export default defineRule({
  description: "Don't change code while proposing.",
  metadata: { mode: 'propose' },
  files: ['**', '!docs/plans/**'],
  create(context) {
    return { Document(node) { context.report({ node }) } }
  },
})
```

## Choose the starting mode

New sessions start in the first mode, or in the mode an Agent names. To start somewhere else, set **Starting mode** under modes in `/config`. A team sets it for everyone in a project, in `.claude/cmods/modes/options.json`:

```json
{ "defaultMode": "propose" }
```

## The claude-modes command

Modes keeps every session in one SQLite file, `~/.local/share/cmod/data/modes/sessions.db`. Set `CLAUDE_MODES_HOME` to keep it elsewhere.

```text
claude-modes sessions                     List the latest sessions
claude-modes show <session>               Print a session's history by task
claude-modes set <session> mode <mode>    Put a session in a mode
claude-modes current [--field mode]       The latest session in this folder
claude-modes watch                        Print every message as sessions record it
claude-modes import <transcript.jsonl>    Import a Claude Code transcript
claude-modes export <session>             Print a session as JSON
claude-modes export <session> --as claude Write a session back as a Claude Code transcript, to resume it
claude-modes check [<project>]            List the modes, hook scripts, and every problem
```

To move every session to another machine, copy the store folder there. `claude-modes export <session> --as claude` then writes the session's transcript where Claude Code looks for it, and `claude --resume <session>` continues it.

## Build on Modes

A mod that draws its own UI for a mode lists `"dependencies": ["cmod", { "name": "modes", "version": "^1.0.0" }]` and calls Modes:

```ts
const { mode } = await mod.dependencies.modes.current({})
await mod.dependencies.modes.showTab({ title: 'Review', markdown: '# Checklist\n- tests pass' })
```

[docs/api.md](docs/api.md) lists each method.

## Docs

- [Modes](docs/modes.md): every key of a mode file
- [Hooks](docs/hooks.md): events, inputs, effects, and the SDK
- [The Modes view](docs/view.md): Settings and the mode tab
- [The API](docs/api.md): calling Modes from another mod
- [How it works](docs/architecture.md): the mod, the program, and the store

## License

MIT. See [LICENSE](LICENSE).
