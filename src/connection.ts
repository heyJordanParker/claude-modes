import { program } from '../node_modules/@cmodjs/core/jobs/program.js'
import { http, sessions, type Mod } from '../node_modules/@cmodjs/core/mod.js'
import type { Definitions, EntryCause, EventAnswer, ModeState, SessionRef } from './protocol.js'
import type { ModesState } from './state.js'

export type Connection = {
  post<Answer>(path: string, body: Readonly<Record<string, unknown>>): Promise<Answer>
  session(): SessionRef
  event(event: string, input: Readonly<Record<string, unknown>>, commands: readonly (readonly string[])[]): Promise<EventAnswer>
  enter(mode: string, agentId: string | undefined, cause: EntryCause): Promise<ModeState>
  refresh(): Promise<void>
}

export function connect(mod: Mod<ModesState>, defaultMode: () => string): Connection {
  const token = crypto.randomUUID()
  const store = mod.use(program({ command: ['claude-modes', 'serve'], environment: { CLAUDE_MODES_TOKEN: token } }))
  let version = 0

  const post = async <Answer,>(path: string, body: Readonly<Record<string, unknown>>): Promise<Answer> => {
    const { url } = await store.ready()
    const response = await http.fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const answer = JSON.parse(response.text) as Answer & { readonly error?: string }
    if (!response.ok) throw new Error(answer.error ?? `${path} answered ${response.status}`)
    return answer
  }

  const session = (): SessionRef => ({ id: sessions.current.id, projectRoot: sessions.current.project, cwd: sessions.current.cwd, defaultMode: defaultMode() })

  const connection: Connection = {
    post,
    session,
    async event(event, input, commands) {
      const answer = await post<EventAnswer>('/event', { session: session(), event, input, commands })
      mod.state.memory.modes = answer.modes
      if (answer.version !== version) await connection.refresh()
      return answer
    },
    async enter(mode, agentId, cause) {
      const { modes } = await post<{ readonly modes: ModeState }>('/enter', { session: session(), mode, agentId, cause })
      mod.state.memory.modes = modes
      return modes
    },
    async refresh() {
      const definitions = await post<Definitions>('/definitions', { projectRoot: sessions.current.project })
      version = definitions.version
      mod.state.memory.definitions = definitions
    },
  }
  return connection
}
