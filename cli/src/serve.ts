import { createCatalog } from './definitions/catalog.ts'
import { createEngine } from './engine.ts'
import { configHome, databaseOf, storeRoot } from './paths.ts'
import { createHandler } from './server.ts'
import { openStore } from './store/store.ts'

const parentCheckMs = 5000

export function serve(): void {
  const token = process.env['CLAUDE_MODES_TOKEN']
  if (token === undefined || token === '') {
    console.error('claude-modes serve answers only the Modes mod that started it, which sets CLAUDE_MODES_TOKEN. Start Claude Code with Modes installed instead.')
    process.exit(2)
  }

  const store = openStore(databaseOf(storeRoot()))
  const handle = createHandler(createEngine(store, createCatalog(configHome())))
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => (request.headers.get('authorization') === `Bearer ${token}` ? handle(request) : Response.json({ error: 'The request has no Modes token.' }, { status: 401 })),
  })
  const parent = process.ppid

  const stop = () => {
    clearInterval(watchParent)
    void server.stop(true)
    store.close()
    process.exit(0)
  }
  const watchParent = setInterval(() => {
    if (process.ppid !== parent) stop()
  }, parentCheckMs)
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)

  console.log(`127.0.0.1:${server.port}`)
}
