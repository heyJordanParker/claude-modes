# How it works

Modes is two parts: a mod that runs inside Claude Code, and the `claude-modes` program it starts for each session.

```text
Claude Code
└── the Modes mod                 src/, registered by hooks/register.ts
    │  decides each tool call against the current mode's rules (cmod's permission check)
    │  switches modes, draws the band and the panel, answers other mods
    │
    │  every event, over a Unix socket
    ▼
claude-modes serve                cli/, one per Claude Code process
├── definitions                   mode files, hook scripts, Agent and Skill frontmatter
├── engine                        moves between modes, runs hook scripts, sends the rules
└── store                         sessions.db: sessions, contexts, turns, tasks, messages, modes
```

## Why two parts

A mod runs in Claude Code's hooks environment, which has no Node, no Bun, and no file system of its own. The program runs in Bun, so it can open SQLite, import a hook script from your disk, and give the script the network, processes, and files. The mod keeps what needs Claude Code: the permission check, commands, and drawing.

## The model

```text
Session          one conversation, across resumes
├── Context*     one compaction window
│   └── Turn*    from a prompt to the next prompt
│       └── Message*   a prompt, reply, tool call, tool result, Skill, document, or notice
├── Mode*        each mode entered, with what entered it
└── Goal         the root task
    └── Task*    a subagent, opened by the Agent call that dispatched it
```

The program builds the model from the session's transcript. On each event it reads the rows written since the last one, from the main transcript and each subagent's, so the store holds the whole session, sessions from before Modes was installed included. `claude-modes import` does the same for any transcript file.

## The store

`sessions.db` is SQLite in WAL mode with a busy timeout, so every session's program writes the one file at once. It lives in cmod's data folder for Modes, `~/.local/share/cmod/data/modes/`, or in `CLAUDE_MODES_HOME`. Moving the folder moves every session.

Beside the model, the store keeps each transcript row as Claude Code wrote it. `claude-modes export <session> --as claude` writes those rows back into Claude Code's projects folder, with each subagent's rows, so a session copied from another machine resumes with `claude --resume`.

## The install step

A mod cannot bind a key: Claude Code reads bindings only from `~/.claude/keybindings.json`. So Modes' cmod install step, `setup/install.sh`, runs `claude-modes bind`, which adds `"shift+tab": "command:mode"` to the `Chat` context, and `setup/uninstall.sh` runs `claude-modes unbind`. cmod asks your consent before either runs. Both edit the file in place, so a `keybindings.json` that is a symbolic link stays one.

## Reloading

Before each event the program compares the time and size of every file it reads. When one changed it loads them again and raises its version. The mod reads the new definitions when an answer carries a new version, and adds a command for each new mode.

## Scrolling to a row

`hooks/register.ts` adds one hook beside the mod: a press on a History row calls Claude Code's `$.ui.scroll` with the row's message id. cmod's mod API has no scroll call, and Claude Code moves the conversation only while it answers a press of the person's.
