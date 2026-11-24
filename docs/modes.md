# Modes

A mode is one Markdown file. The file name is the mode's name, such as `review.md` for the `review` mode, and it must be 1 to 64 letters, digits, `_`, or `-`.

## Where mode files live

```text
~/.claude/cmods/modes/<mode>.md          yours, in every project
<project>/.claude/cmods/modes/<mode>.md  your team's, committed with the repository
```

A project file replaces a personal file of the same name. `CLAUDE_CONFIG_DIR` moves `~/.claude`.

## The keys

```markdown
---
order: 2
description: review before you merge
deny:
  - write: "**"
    reason: Review mode reads; it does not change files.
ask:
  - command: git push
lasts: turn
after:
  - command: gh pr merge
    enter: build
---
You are reviewing. Read the diff, run the tests, and list every problem you find.
```

| Key | Value | Default |
| --- | --- | --- |
| `order` | A number. `/mode`, shift+tab, and the Mode widget move through the modes from the lowest. Ties sort by name. | after every numbered mode |
| `description` | One line of text. | none |
| `deny` | A list of rules. A matching call is refused. | none |
| `ask` | A list of rules. Claude Code asks you before a matching call runs. | none |
| `lasts` | `turn`: the mode ends with the turn it ran in, and the session returns to the mode before it. | the mode lasts until another is entered |
| `after` | A list of transitions. Once a matching call succeeds, the session enters the named mode. | none |

The body is the mode's rules. Claude reads them, headed `Mode: <name> (<description>)`, when the conversation starts, and again as a note when the session enters the mode. A subagent reads its own mode's rules when it starts.

A key Modes does not know is a problem. `claude-modes check` and the Modes view list every problem with its fix.

## Rules

A rule names exactly one target. The patterns follow cmod's permission rules.

| Target | Matches |
| --- | --- |
| `command: git push` | A Bash command. Words must appear in order, flags anywhere. `'*'` matches every command. |
| `read: "src/**"` | A read of a matching file, by `Read`, `Grep`, `Glob`, or a Bash command. |
| `write: "**/*.md"` | A change to a matching file, by `Edit`, `Write`, `NotebookEdit`, or a Bash command. |
| `fetch: "https://api.example.com/**"` | A `WebFetch`, or a Bash command that fetches the URL. |
| `subagent: explorer` | An `Agent` call that starts a matching subagent. `'*'` matches every subagent. |
| `tool: "mcp__github__*"` | A call of a matching tool. |

A pattern is one string or a list. A `read` or `write` pattern is relative to the project, `~/` starts at your home folder, and `/` starts at the root.

A pattern that starts with `!` leaves calls out. `write: ["**", "!docs/**"]` refuses every edit outside `docs/`, and `command: ["git", "!git status", "!git log"]` refuses every git command but those two. A rule needs one pattern without `!`.

A rule may also hold `reason`: text added to the refusal Claude reads, after `<mode> mode refuses <target>.`

## Transitions

`after` holds rules with a target and `enter`:

```yaml
after:
  - command: git commit
    enter: propose
```

When a call matches and succeeds, the session enters `propose`, and Claude reads `The session is now in propose mode.` with the call's result. A refused or failed call enters nothing.

## Entering a mode

- `/mode` moves to the next mode. `/mode <name>` enters that mode.
- `/<name>` enters that mode. Modes adds the command when it first sees the file. A name that another command or Skill already uses is not added; use `/mode <name>`.
- A press on `mode: <name>` above the prompt moves to the next mode.
- A Skill with `modes.mode: <name>` in its frontmatter's `metadata` enters the mode when it loads, typed as `/<skill>` or called by Claude.
- An Agent with `modes.mode: <name>` in its `metadata` starts there: a session run as that Agent, or a subagent of that type.
- shift+tab moves to the next mode.
- A hook script answers `{ enter: '<name>' }`.
- Another mod calls `mod.dependencies.modes.enter`.
- `claude-modes set <session> mode <name>` from a terminal.

A new session starts in the Agent's mode, else in the **Starting mode** option, else in the first mode. Set the option under modes in `/config`, or for a project in `.claude/cmods/modes/options.json` as `{ "defaultMode": "<name>" }`. A subagent whose Agent names no mode works in the session's mode.
