# How it works

Modes is two parts: a mod that runs inside Claude Code, and the `claude-modes` program it starts for each session.

```text
Claude Code
└── the Modes mod                 src/, registered by hooks/register.ts
    │  holds the mode of the session and of each subagent (src/mode-state.ts)
    │  switches modes: commands, shift+tab, Skills, Agents, transitions, lasts: turn
    │  decides each tool call against the current mode's rules (cmod's permissions job)
    │  gives Claude the mode's rules (cmod's prompt job)
    │  draws the Mode widget and the Modes view, answers other mods
    │  answers rulebook's Check with the rules outside each agent's mode
    │
    │  once per prompt, and on each event a hook script listens to in the current mode
    ▼
claude-modes serve                cli/, one per Claude Code process
├── definitions                   mode files, hook scripts, Agent and Skill metadata
└── engine                        runs hook scripts
```

## Why two parts

A mod runs in Claude Code's hooks environment, which has no Node, no Bun, and no file system of its own. The program runs in Bun, so it can import a hook script from your disk and give the script the network, processes, and files. The mod keeps everything else, the mode included, so an event no hook script listens to never waits on the program.

## Where the mode lives

The mod keeps the mode of the session and of each subagent in cmod's `session` state. It comes back on `--resume`, and a fork of the conversation starts with it. The same state keeps each mode entered, with what entered it, for the `entries` method of the API.

## Gates and rules

The mod's state holds the mode of the session and of each subagent. cmod's `permissions` job reads the rules from that state before every call, so a rule applies only while its mode is the caller's mode. A rule's `!` patterns are cmod's own, so a mode file writes what cmod's permissions write.

cmod's `prompt` job gives Claude the mode's rules at the start of the conversation, and adds them again as a note each time the mode changes. A subagent does not read the main conversation's notes, so the mod gives each subagent its mode's rules when it starts, and again with its next tool call after a Skill moves it to another mode.

## Talking to the program

The program listens on `127.0.0.1` on a free port, and prints the address for cmod's `program` job. The mod makes a random token for each session, hands it to the program in `CLAUDE_MODES_TOKEN`, and sends it on every request. The program refuses a request without it, so no other process and no web page runs your hook scripts.

## The key binding

Modes declares the hotkey `cycle`, `shift+tab` by default, in `defineMod`. cmod binds it in Claude Code's `keybindings.json`, keeps a key you bound yourself, and lets you change it in Settings, under modes, Hotkeys.

## Reloading

The mod reads the definitions from the program before each prompt. The program compares the time and size of every file it reads, and loads them again when one changed. A hook answer that carries a new version, such as after a script fails, makes the mod read them again too. The mod adds a command for each new mode. A mode command whose file is gone answers that it no longer applies, because Claude Code has no call that removes a command.

## rulebook's checks

rulebook runs every check, and asks each `beforeCheck` listener on its `rulebook/Rules` interface before it checks a call or a reply. Modes answers `'off'` for each rule whose `metadata.mode` names a mode other than the mode of the agent the check is for, the subagent's when the check names a `task`, else the main agent's. It answers within 1 second, and an answer that fails runs every rule. rulebook knows nothing of modes, and Modes runs no check of its own.

Modes lists rulebook's providers when it starts, and again at each `Change` that cmod's `cmod/Providers` tells for `rulebook/Rules`. Each time it removes its old listeners and listens on every provider in the list, so a rulebook that reloads gets a listener again.
