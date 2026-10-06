# The Modes panel

`/modes` opens and closes the panel. In the fullscreen layout it docks beside the conversation, and otherwise it shows above the prompt. Its tabs answer to keys while the panel has focus: `h` for History, `s` for Settings, and `m` for a mode tab when one exists.

## History

History shows the session the way you worked it:

```text
Login work
mode build · 41 calls · 2 failed
Tasks  Show: all  Expand all  Collapse all
Find:
▸ you    Add a login page                     12 1✗
▾ you    Now style it                          9
    claude Reading the stylesheet first.
    tool   Read src/login.css
  ▸ agent  explorer: Find the theme tokens     4
    mode   build (command mode)
    tool   Edit src/login.css
```

- Each prompt is a turn. Under it sit Claude's replies, each tool call, the Skills and files it loaded, and each mode change.
- A subagent nests under the `Agent` call that dispatched it, with its own calls under it. `running` marks one that has not finished.
- A compaction starts a new context, labeled with what triggered it.
- A count after a row is its tool calls, then `✗` failures. A failed call says `failed`.
- `▸` opens a row, and `▾` closes it. The last turn starts open.

The toolbar:

| Control | Key | What it does |
| --- | --- | --- |
| Tasks / Timeline | `v` | Tasks nests rows by turn and subagent. Timeline lists every row in time order, with its time. |
| Show | `f` | Cycles all, prompts, tools, and errors. |
| Expand all | `e` | Opens every turn and subagent. |
| Collapse all | `c` | Closes them. |
| Find | | Keeps the rows whose text matches, and opens the rows above them. |

A press on a row scrolls the conversation to that message, while the message is still drawn there.

## Settings

- **Modes**: each mode, with what it refuses, what it asks about, whether it lasts one turn, and what it enters after a call. Press a mode, or its number key, to enter it.
- **New sessions start in**: the first mode, or the mode you pick. The pick is saved for every project.
- **Hook scripts**: each script, its events, and its modes.
- **Problems**: each mistake in a mode file, a script, or a frontmatter `mode:` key, with its fix.
- **Folders**: where Modes reads mode files and scripts.

## The mode tab

A mod built on Modes can show its own Markdown in a first tab, through `showTab`. The tab appears when a mod fills it and goes when the mod calls `hideTab`. [api.md](api.md) shows both.
