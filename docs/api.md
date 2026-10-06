# The API

Another mod calls Modes through cmod's `mod.dependencies`. List Modes in your mod's `.claude-plugin/plugin.json`, and Claude Code installs it with your mod:

```json
"dependencies": ["cmod", "modes"]
```

Claude Code then lays Modes' types beside your mod's, so each call is typed.

## Methods

| Method | Input | Answer |
| --- | --- | --- |
| `current` | `{ agentId? }` | `{ mode }`: the agent's mode, else the session's, or `null` |
| `enter` | `{ mode, agentId?, by }` | `{ mode }`. `by` names your mod in the session's history. |
| `modes` | `{}` | `{ modes }`: each mode's `name`, `description`, and `order` |
| `entries` | `{}` | `{ entries }`: every mode the session entered, with its cause and time |
| `showTab` | `{ title, markdown }` | `{}`. Fills the panel's first tab and shows it. Markdown past 10000 characters is cut. |
| `hideTab` | `{}` | `{}`. Removes the tab. |

`enter` rejects a mode no file defines, naming the modes there are.

## Example

A mod that draws a checklist while the session is in review mode:

```ts
import { defineMod } from '../node_modules/@cmodjs/core/mod.js'

export const review = defineMod({
  name: 'review-checklist',
  setup(mod) {
    mod.on('UserPromptSubmit', async () => {
      const { mode } = await mod.dependencies.modes.current({})
      if (mode === 'review') await mod.dependencies.modes.showTab({ title: 'Review', markdown: '# Checklist\n- [ ] tests pass\n- [ ] docs updated' })
      else await mod.dependencies.modes.hideTab({})
    })
  },
})
```

A UI that needs more than Markdown, such as its own pane or a band above the prompt, belongs in your mod, which reads the mode through `current`.
