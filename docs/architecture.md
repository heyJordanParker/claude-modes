# How it works

Modes is two parts: a mod that runs inside Claude Code, and the `claude-modes` program it starts for each session.

```text
Claude Code
└── the Modes mod                 src/, registered by hooks/register.ts
    │  decides each tool call against the current mode's rules (cmod's permissions job)
    │  gives Claude the mode's rules (cmod's prompt job)
    │  switches modes, draws the Mode widget and the Modes view, answers other mods
    │  answers rulebook's Check with the rules outside each agent's mode
    │
    │  every event, over a local port, with the session's token
    ▼
claude-modes serve                cli/, one per Claude Code process
├── definitions                   mode files, hook scripts, Agent and Skill metadata
├── engine                        moves between modes, runs hook scripts
└── store                         sessions.db: sessions, contexts, turns, tasks, messages, modes
```

## Why two parts

A mod runs in Claude Code's hooks environment, which has no Node, no Bun, and no file system of its own. The program runs in Bun, so it can open SQLite, import a hook script from your disk, and give the script the network, processes, and files. The mod keeps what needs Claude Code: the permission check, the rules Claude reads, commands, and drawing.

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

The program builds the model from the session's transcript, at the `transcript_path` the mod sends with each event from cmod's `sessions.current.transcriptPath`. On each event it reads the rows written since the last one, from the main transcript and each subagent's, so the store holds the whole session, sessions from before Modes was installed included. `claude-modes import` does the same for any transcript file.

## Gates and rules

The mod's state holds the mode of the session and of each subagent. cmod's `permissions` job reads the rules from that state before every call, so a rule applies only while its mode is the caller's mode. A rule's `!` patterns are cmod's own, so a mode file writes what cmod's permissions write.

cmod's `prompt` job gives Claude the mode's rules at the start of the conversation, and adds them again as a note each time the mode changes. A subagent does not read the main conversation's notes, so the program gives each subagent its mode's rules when it starts, and again when a Skill moves it to another mode.

## Talking to the program

The program listens on `127.0.0.1` on a free port, and prints the address for cmod's `program` job. The mod makes a random token for each session, hands it to the program in `CLAUDE_MODES_TOKEN`, and sends it on every request. The program refuses a request without it, so no other process and no web page reaches the store.

## The store

`sessions.db` is SQLite in WAL mode with a busy timeout, so every session's program writes the one file at once. It lives in cmod's data folder for Modes, `~/.local/share/cmod/data/modes/`, or in `CLAUDE_MODES_HOME`. Moving the folder moves every session.

Beside the model, the store keeps each transcript row as Claude Code wrote it. `claude-modes export <session> --as claude` writes those rows back into Claude Code's projects folder, with each subagent's rows, so a session copied from another machine resumes with `claude --resume`.

## The key binding

Modes declares the hotkey `cycle`, `shift+tab` by default, in `defineMod`. cmod binds it in Claude Code's `keybindings.json`, keeps a key you bound yourself, and lets you change it in Settings, under modes, Hotkeys.

## Reloading

Before each event the program compares the time and size of every file it reads. When one changed it loads them again and raises its version. The mod reads the new definitions when an answer carries a new version, and adds a command for each new mode. A mode command whose file is gone answers that it no longer applies, because Claude Code has no call that removes a command.

## rulebook's checks

rulebook runs every check, and asks each `beforeCheck` listener on its `rulebook/Rules` interface before it checks a call or a reply. Modes answers `'off'` for each rule whose `metadata.mode` names a mode other than the mode of the agent the check is for, the subagent's when the check names a `task`, else the main agent's. It answers within 1 second, and an answer that fails runs every rule. rulebook knows nothing of modes, and Modes runs no check of its own.

Modes lists rulebook's providers when it starts, and again at each `Change` that cmod's `cmod/Providers` tells for `rulebook/Rules`. Each time it removes its old listeners and listens on every provider in the list, so a rulebook that reloads gets a listener again.
