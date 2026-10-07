# Changelog

## 0.1.0

The first release.

- Modes are Markdown files: `deny` and `ask` rules, `lasts: turn`, `after` transitions, and the rules Claude reads.
- Hooks are TypeScript files that import `defineHook` from `claude-modes`.
- Agents and Skills enter a mode with `mode:` in their frontmatter.
- A saved change applies to the next event, with no restart.
- shift+tab, `/mode`, `/<mode>`, and the band above the prompt switch modes. Installing binds shift+tab, with your consent, and uninstalling gives it back.
- The Modes panel (`/modes`): History by turn and subagent, Timeline, filters, Find, jump to a message, and Settings.
- Other mods read and enter modes and fill the panel's first tab through `mod.dependencies.modes`.
- `claude-modes` keeps every session in one SQLite store, with `sessions`, `show`, `set`, `copy`, `current`, `watch`, `import`, `export`, `check`, `bind`, and `unbind`. `export --as claude` writes a session back as a transcript to resume on another machine.
