# Modes

Modes for Claude Code that you define in plain files. A mode says what Claude may do, what it reads while the mode lasts, and how the session moves to the next one. You switch modes with one key, and a panel shows the whole session by task.

```text
mode: propose                                     ← the band above the prompt; a press moves on
❯ plan the login page
```

- **Modes are Markdown files.** The frontmatter names what the mode refuses or asks about. The body is the rules Claude reads when the mode starts.
- **Hooks are TypeScript files.** A script imports `defineHook` from `claude-modes` and answers Claude Code's events. No plugin, no build, no restart.
- **Agents and Skills enter modes.** `mode: build` in a Skill's frontmatter enters build when the Skill loads.
- **A save applies to the next event.** Modes notices the change on the next prompt or tool call.
- **The Modes panel** shows the session by turn and by subagent, and jumps the conversation to any row.

Modes is a [Claude Mod Manager](https://github.com/heyJordanParker/cmod) mod. The plugin is named `modes`.

## Install

```sh
npm i -g @cmodjs/cli
cmod install heyJordanParker/claude-modes
```

Start `claude`, then type `/modes` to open the panel.

To switch modes with shift+tab, bind it in `~/.claude/keybindings.json`. The binding replaces shift+tab's built-in cycle of permission modes:

```json
{
  "bindings": [
    { "context": "Chat", "bindings": { "shift+tab": "command:mode" } }
  ]
}
```

## Define a mode

Each mode is one Markdown file in `~/.claude/cmods/modes/`, or in a project's `.claude/cmods/modes/` to share it with a team. The file name is the mode's name and its command.

`~/.claude/cmods/modes/propose.md`:

```markdown
---
order: 1
description: plan before you build
deny:
  - write: "**"
    except: ["docs/plans/**"]
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
| `description` | One line, shown in the panel and in `/<mode>`'s help. |
| `deny` | Calls the mode refuses. Each rule names one target, and may add `except` and `reason`. |
| `ask` | Calls Claude Code asks you about first. Same rules as `deny`. |
| `lasts: turn` | The mode ends when the turn ends, and the session returns to the mode before it. |
| `after` | Rules that enter another mode once a matching call succeeds. |

A rule's target is one of `command`, `read`, `write`, `fetch`, `subagent`, or `tool`, with the pattern rules of cmod's permissions. `except` takes `read`, `write`, and `fetch` patterns. [docs/modes.md](docs/modes.md) has every rule.

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
mode: commit
---
```

A Skill enters its mode when it loads. An Agent sets the mode its session, or its subagent, starts in.

## Switch modes

- `/mode` moves to the next mode, and `/mode <name>` enters one.
- `/<name>` enters that mode. Each mode file adds its command.
- shift+tab, once bound, runs `/mode`.
- A press on `mode: <name>` above the prompt moves to the next mode.

## The Modes panel

`/modes` opens the panel beside the conversation.

- **History** shows the session as you worked it. Each prompt is a turn, with Claude's replies, every tool call, failed calls marked, mode changes, and each subagent nested under the call that dispatched it. A compaction starts a new context. Switch to **Timeline** for every row in order, filter to prompts, tools, or errors, and type in **Find** to narrow the rows. A press on a row scrolls the conversation to it.
- **Settings** lists each mode with what it refuses and how it ends, the hook scripts, every problem in your files, and the mode new sessions start in.
- A mod built on Modes can add a first tab of its own.

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
claude-modes check [<project>]            List the modes, hook scripts, and every problem
```

## Build on Modes

A mod that draws its own UI for a mode lists `"dependencies": ["cmod", "modes"]` and calls Modes:

```ts
const { mode } = await mod.dependencies.modes.current({})
await mod.dependencies.modes.showTab({ title: 'Review', markdown: '# Checklist\n- tests pass' })
```

[docs/api.md](docs/api.md) lists each method.

## Docs

- [Modes](docs/modes.md): every key of a mode file
- [Hooks](docs/hooks.md): events, inputs, effects, and the SDK
- [The panel](docs/panel.md): History, Settings, and the mode tab
- [The API](docs/api.md): calling Modes from another mod
- [How it works](docs/architecture.md): the mod, the program, and the store

## License

MIT. See [LICENSE](LICENSE).
