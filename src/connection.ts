import type { Job, Mod } from '../node_modules/@cmodjs/core/mod.js'
import { program } from '../node_modules/@cmodjs/core/jobs/program.js'
import type { EntryCause, EventAnswer, ModeState, SessionRef } from './protocol.js'
import type { ModesState } from './state.js'

export type Connection = {
  post<Answer>(path: string, body: Readonly<Record<string, unknown>>): Promise<Answer>
  session(): Promise<SessionRef>
  event(event: string, input: Readonly<Record<string, unknown>>): Promise<EventAnswer>
  enter(mode: string, agentId: string | undefined, cause: EntryCause): Promise<ModeState>
  refresh(): Promise<void>
  refreshHistory(): Promise<void>
}

const sessionId: Job<() => Promise<string>, ModesState> = ({ claude }) => () => claude.session.id()

export function connect(mod: Mod<ModesState>): Connection {
  const store = mod.use(program({ command: ['claude-modes', 'serve'] }))
  const idOf = mod.use(sessionId)
  let version = 0

  const post = async <Answer,>(path: string, body: Readonly<Record<string, unknown>>): Promise<Answer> => {
    const { url, socketPath } = await store.ready()
    const response = await mod.http.fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(socketPath === undefined ? {} : { socketPath }),
    })
    const answer = JSON.parse(response.text) as Answer & { readonly error?: string }
    if (!response.ok) throw new Error(answer.error ?? `${path} answered ${response.status}`)
    return answer
  }

  const session = async (): Promise<SessionRef> => ({ id: await idOf(), projectRoot: mod.projectRoot, cwd: mod.cwd, defaultMode: mod.state.global.defaultMode })

  const connection: Connection = {
    post,
    session,
    async event(event, input) {
      const answer = await post<EventAnswer>('/event', { session: await session(), event, input })
      mod.state.memory.modes = answer.modes
      if (answer.version !== version) await connection.refresh()
      return answer
    },
    async enter(mode, agentId, cause) {
      const { modes } = await post<{ readonly modes: ModeState }>('/enter', { session: await session(), mode, agentId, cause })
      mod.state.memory.modes = modes
      return modes
    },
    async refresh() {
      const definitions = await post<NonNullable<ModesState['memory']['definitions']>>('/definitions', { projectRoot: mod.projectRoot })
      version = definitions.version
      mod.state.memory.definitions = definitions
    },
    async refreshHistory() {
      const { history } = await post<{ readonly history: ModesState['memory']['history'] }>('/history', { sessionId: await idOf() })
      mod.state.memory.history = history
    },
  }
  return connection
}
