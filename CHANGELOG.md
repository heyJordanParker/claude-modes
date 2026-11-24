# Changelog

## [1.0.0]

The first release, built on Claude Mod Manager 8.3.

- Modes are Markdown files: `deny` and `ask` rules with cmod's `!` patterns, `lasts: turn`, `after` transitions, and the rules Claude reads.
- Claude reads the mode's rules when the conversation starts, and again as a note each time the mode changes. Each subagent reads its own mode's rules.
- Hooks are TypeScript files that import `defineHook` from `claude-modes`.
- Agents and Skills enter a mode with `modes.mode` in their frontmatter's `metadata`, so a Skill still uploads to claude.ai and the Skills API.
- A saved change applies to the next event, with no restart.
- shift+tab, `/mode`, `/<mode>`, and the Mode widget switch modes. shift+tab is the `cycle` hotkey, which you change in Settings, under modes, Hotkeys. You place the Mode widget above the prompt in Settings, under cmod, Widgets.
- The **Starting mode** option, in `/config` or a project's `options.json`, names the mode new sessions start in.
- `/modes` opens the Modes view in the Sidebar: each mode with what it refuses and how it ends, the hook scripts, every problem in your files, and the starting mode.
- A rulebook rule with `metadata: { mode: <name> }` runs only for an agent in that mode. Modes answers rulebook's `Check` with the rules outside the agent's mode, and rulebook runs every check.
- Other mods read and enter modes and fill the Modes view's mode tab through `mod.dependencies.modes`.
- `claude-modes` keeps every session in one SQLite store, with `sessions`, `show`, `set`, `copy`, `current`, `watch`, `import`, `export`, and `check`. `export --as claude` writes a session back as a transcript to resume on another machine.
