# Hooks

A hook is one TypeScript or JavaScript file that answers Claude Code's events. It needs no plugin, no package, and no build.

```text
~/.claude/cmods/modes/hooks/<name>.ts          yours, in every project
<project>/.claude/cmods/modes/hooks/<name>.ts  your team's
```

A project script replaces a personal script of the same name. `.ts`, `.mts`, `.js`, and `.mjs` files load.

## defineHook

```ts
import { defineHook } from 'claude-modes'

export default defineHook({
  on: 'UserPromptSubmit',
  mode: ['propose', 'review'],
  run(input, context) {
    if (input.prompt.includes('deploy')) return { context: 'Deploys run from CI only.' }
  },
})
```

| Field | Value |
| --- | --- |
| `on` | One event, or a list. |
| `mode` | Optional. The script runs only while the agent that raised the event is in one of these modes. |
| `run(input, context)` | Returns one effect, or nothing. It may be `async`. It has 5 seconds. |

`claude-modes` is a module the Modes program supplies when it loads the script. Modes writes `claude-modes.d.ts` and, when none exists, a `tsconfig.json` into the `hooks/` folder, so your editor type-checks the script.

## Events and effects

| Event | `input` beyond `session_id`, `cwd`, and `hook_event_name` | Effects it takes |
| --- | --- | --- |
| `SessionStart` | `source`: `startup`, `resume`, `clear`, `compact`, or `fork` | `context`, `enter` |
| `UserPromptSubmit` | `prompt` | `context`, `block`, `enter` |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id`, `files` | `deny`, `ask`, `context` |
| `PostToolUse` | the same, and `tool_response` | `context`, `enter` |
| `PostToolUseFailure` | the same, and `error` | `context`, `enter` |
| `Stop` | `stop_hook_active`, `last_assistant_message` | `context`, `block`, `enter` |
| `SubagentStart` | `agent_id`, `agent_type` | `context` |
| `SubagentStop` | `agent_id`, `agent_type`, `last_assistant_message` | `context`, `block` |
| `PreCompact` | `trigger` | none |
| `SessionEnd` | `reason` | none |
| `Notification` | `message` | none |

`files` lists `read` and `changed`, the absolute paths the call reads and changes, Bash commands included. Inside a subagent, `agent_id` and `agent_type` name it.

| Effect | What happens |
| --- | --- |
| `{ deny: 'reason' }` | The call is refused, and Claude reads the reason. |
| `{ ask: 'reason' }` | Claude Code asks you before the call runs. |
| `{ context: 'text' }` | Claude reads the text with the event. |
| `{ block: 'reason' }` | The prompt is blocked, or Claude keeps working instead of stopping. |
| `{ enter: 'mode' }` | The agent that raised the event enters the mode. |

An effect the event does not take is dropped, and the panel's Settings tab lists it as a problem.

## context

```ts
type HookContext = {
  session: { id: string; projectRoot: string; cwd: string }
  mode: string | undefined
  agentId: string | undefined
  commands: readonly (readonly string[])[]
}
```

`commands` holds each command of a Bash call, split into words the way a shell splits them, so `cd app && git restore a.ts` is `[['cd', 'app'], ['git', 'restore', 'a.ts']]`. It is empty for any other tool.

## When a script fails

A script that throws, or runs past 5 seconds, is listed under Problems in the panel and in `claude-modes check`. On `PreToolUse` its failure refuses the call with `The <name> hook failed, so it denies the call: <error>`. On every other event the event goes on.

A script that does not load, such as one with no default export or an unknown event, is skipped and listed under Problems.

## Reloading

Before each event, Modes compares the times and sizes of the mode files, hook scripts, Agents, and Skills it reads. When one changed, it loads them again. A saved change applies to the next event, with no restart.
