import { homedir } from 'node:os'
import { join } from 'node:path'

export function configHome(env: NodeJS.ProcessEnv = process.env): string {
  return env['CLAUDE_CONFIG_DIR'] !== undefined && env['CLAUDE_CONFIG_DIR'] !== '' ? env['CLAUDE_CONFIG_DIR'] : join(homedir(), '.claude')
}
