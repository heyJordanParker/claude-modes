import { homedir } from 'node:os'
import { join } from 'node:path'

export function storeRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env['CLAUDE_MODES_HOME'] !== undefined && env['CLAUDE_MODES_HOME'] !== '') return env['CLAUDE_MODES_HOME']
  const dataHome = env['XDG_DATA_HOME'] !== undefined && env['XDG_DATA_HOME'] !== '' ? env['XDG_DATA_HOME'] : join(homedir(), '.local', 'share')
  return join(dataHome, 'cmod', 'data', 'modes')
}

export function configHome(env: NodeJS.ProcessEnv = process.env): string {
  return env['CLAUDE_CONFIG_DIR'] !== undefined && env['CLAUDE_CONFIG_DIR'] !== '' ? env['CLAUDE_CONFIG_DIR'] : join(homedir(), '.claude')
}

export const databaseOf = (root: string) => join(root, 'sessions.db')

export const socketOf = (root: string, pid: number) => join(root, 'run', `${pid}.sock`)
