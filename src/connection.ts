import { program } from '../node_modules/@cmodjs/core/jobs/program.js'
import { http, sessions, type Mod } from '../node_modules/@cmodjs/core/mod.js'
import type { Definitions, Effect, HookAnswer, HookRequest } from './protocol.js'
import type { ModesState } from './state.js'

export type Connection = {
  hook(event: string, input: Readonly<Record<string, unknown>>, context: HookRequest['context']): Promise<readonly Effect[]>
  refresh(): Promise<void>
}

export function connect(mod: Mod<ModesState>): Connection {
  const token = crypto.randomUUID()
  const claudeModes = mod.use(program({ command: ['claude-modes', 'serve'], environment: { CLAUDE_MODES_TOKEN: token } }))

  const post = async <Answer,>(path: string, body: Readonly<Record<string, unknown>>): Promise<Answer> => {
    const { url } = await claudeModes.ready()
    const response = await http.fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const answer = JSON.parse(response.text) as Answer & { readonly error?: string }
    if (!response.ok) throw new Error(answer.error ?? `${path} answered ${response.status}`)
    return answer
  }

  const connection: Connection = {
    async hook(event, input, context) {
      const request: HookRequest = { projectRoot: sessions.current.project, event, input, context }
      const answer = await post<HookAnswer>('/hook', request)
      if (answer.version !== mod.state.memory.definitions?.version) await connection.refresh()
      return answer.effects
    },
    async refresh() {
      mod.state.memory.definitions = await post<Definitions>('/definitions', { projectRoot: sessions.current.project })
      mod.state.memory.failure = ''
    },
  }
  return connection
}
