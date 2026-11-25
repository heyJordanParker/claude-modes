#!/usr/bin/env bun
import packageJson from '../package.json' with { type: 'json' }
import { serve } from './serve.ts'

const [command] = process.argv.slice(2)

if (command === 'serve') serve()
else if (command === '--version' || command === '-v') console.log(packageJson.version)
else {
  console.error(`claude-modes ${packageJson.version} runs Modes' hook scripts for one Claude Code session. The Modes mod starts it with: claude-modes serve`)
  process.exit(2)
}
