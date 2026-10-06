#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import packageJson from '../package.json' with { type: 'json' }
import { check, copy, current, exportSession, importTranscript, sessions, setMode, show, type Output } from './commands.ts'
import { configHome, databaseOf, storeRoot } from './paths.ts'
import { serve } from './serve.ts'
import { openStore } from './store/store.ts'

const usage = `claude-modes ${packageJson.version}: the Modes program for Claude Code

Usage:
  claude-modes sessions [--limit <n>]           List the latest sessions, newest first
  claude-modes show <session> [--json]          Print a session's history by task
  claude-modes set <session> mode <mode>        Put a session in a mode
  claude-modes copy <from> <to>                 Give one session the mode of another
  claude-modes current [--field <field>]        The latest session in this folder: session, mode, or transcript
  claude-modes watch                            Print every message as sessions record it
  claude-modes import <transcript.jsonl>        Import a Claude Code transcript
  claude-modes export <session>                 Print a session as JSON
  claude-modes check [<project>]                Load the modes and hook scripts, and list each problem
  claude-modes serve                            Run the store for one Claude Code session (the Modes mod starts it)

The store lives in $CLAUDE_MODES_HOME, by default ~/.local/share/cmod/data/modes.`

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    json: { type: 'boolean' },
    limit: { type: 'string' },
    field: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
})

const [command, ...rest] = positionals

if (values.version === true) {
  console.log(packageJson.version)
} else if (values.help === true || command === undefined || command === 'help') {
  console.log(usage)
} else if (command === 'serve') {
  serve()
} else {
  const output = await run(command, rest)
  if (output.text !== '') (output.code === 0 ? console.log : console.error)(output.text)
  process.exit(output.code)
}

async function run(name: string, args: readonly string[]): Promise<Output> {
  const store = openStore(databaseOf(storeRoot()))
  const needs = (count: number, form: string): Output | undefined => (args.length < count ? { text: `Usage: claude-modes ${form}`, code: 2 } : undefined)
  switch (name) {
    case 'sessions':
      return sessions(store, Number(values.limit ?? 20))
    case 'show':
      return needs(1, 'show <session> [--json]') ?? show(store, args[0] as string, values.json === true)
    case 'set':
      return args[1] !== 'mode' ? { text: 'Usage: claude-modes set <session> mode <mode>', code: 2 } : (needs(3, 'set <session> mode <mode>') ?? setMode(store, configHome(), args[0] as string, args[2] as string))
    case 'copy':
      return needs(2, 'copy <from> <to>') ?? copy(store, args[0] as string, args[1] as string)
    case 'current':
      return current(store, process.cwd(), values.field)
    case 'import':
      return needs(1, 'import <transcript.jsonl>') ?? importTranscript(store, args[0] as string)
    case 'export':
      return needs(1, 'export <session>') ?? exportSession(store, args[0] as string)
    case 'check':
      return check(configHome(), args[0] ?? process.cwd())
    case 'watch':
      return watch(store)
    default:
      return { text: `"${name}" is not a command.\n\n${usage}`, code: 2 }
  }
}

async function watch(store: ReturnType<typeof openStore>): Promise<Output> {
  let seq = store.lastSeq()
  for (;;) {
    for (const message of store.messagesAfter(seq)) {
      seq = message.seq
      const label = message.kind === 'tool call' ? `${message.name ?? 'tool'} ${message.text}` : message.text
      console.log(`${message.session_id.slice(0, 8)}  ${message.kind.padEnd(11)}  ${label.split('\n')[0]?.slice(0, 160) ?? ''}`)
    }
    await Bun.sleep(500)
  }
}
