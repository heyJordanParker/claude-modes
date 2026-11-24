---
name: write-modes
description: Write or change a Modes mode file or hook script. Use when the person asks for a new mode, a rule a mode should enforce, a hook that reacts to Claude Code events, or a Skill or Agent that enters a mode.
---

# Write modes and hooks

Modes reads plain files and applies a saved change on the next event. Nothing needs a build or a restart.

## Where the files go

- A personal mode: `~/.claude/cmods/modes/<mode>.md`. A team's: `<project>/.claude/cmods/modes/<mode>.md`.
- A hook script: `hooks/<name>.ts` inside either folder.
- The file name is the mode's name and its `/<name>` command: 1 to 64 letters, digits, `_`, or `-`.

## A mode file

```markdown
---
order: 2
description: one line for the Modes view
deny:
  - write: ["**", "!docs/**"]
    reason: why the mode refuses it
ask:
  - command: git push
lasts: turn
after:
  - command: git commit
    enter: propose
---
The rules Claude reads while the mode lasts, in plain sentences.
```

- Every key is optional. The keys are `order`, `description`, `color`, `deny`, `ask`, `lasts`, and `after`, and no other. `color` is one of an Agent's colors: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, or `cyan`.
- Each rule names exactly one target: `command`, `read`, `write`, `fetch`, `subagent`, or `tool`. A pattern is a string or a list.
- A pattern that starts with `!` leaves calls out, and a rule needs one pattern without `!`.
- `after` rules name one target and `enter`, a mode that a file defines.

## A hook script

```ts
import { defineHook } from 'claude-modes'

export default defineHook({
  on: 'PreToolUse',
  mode: 'build',
  run: (input, { commands, mode, session }) => (input.tool_name === 'Bash' && commands.length > 3 ? { ask: 'A long command chain. Check it first.' } : undefined),
})
```

- `on` is one or more of `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, and `Notification`.
- `run` returns one effect or nothing: `{ deny }` and `{ ask }` on `PreToolUse`, `{ context }` on most events, `{ block }` on `UserPromptSubmit`, `Stop`, and `SubagentStop`, and `{ enter }` on `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, and `Stop`.
- A script may import any module Bun can run, and has 5 seconds.

## Enter a mode from a Skill or an Agent

Add the mode under `metadata` in the Skill's or Agent's frontmatter:

```yaml
metadata:
  modes.mode: build
```

## Check the work

Run `claude-modes check` in the project. It lists each mode, each script, and every problem with its fix, and exits 1 when there is a problem. Fix each problem before you report the change as done.
