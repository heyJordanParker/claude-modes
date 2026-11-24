# The Modes view

`/modes` shows and hides the Modes view, a tab of the Sidebar beside the conversation. It takes the keyboard when it opens.

## Settings

- **Modes**: each mode, with what it refuses, what it asks about, whether it lasts one turn, and what it enters after a call. Press a mode to enter it.
- **New sessions start in**: the **Starting mode** option, set under modes in `/config` or in a project's `.claude/cmods/modes/options.json`.
- **Hook scripts**: each script, its events, and its modes.
- **Problems**: each mistake in a mode file, a script, or a `modes.mode` metadata key, with its fix.
- **Folders**: where Modes reads mode files and scripts.

## The mode tab

A mod built on Modes can show its own Markdown in a first tab, through `showTab`. The tab appears when a mod fills it and goes when the mod calls `hideTab`. [api.md](api.md) shows both.
