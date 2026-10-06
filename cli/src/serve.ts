import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { createCatalog } from './definitions/catalog.ts'
import { createEngine } from './engine.ts'
import { configHome, databaseOf, socketOf, storeRoot } from './paths.ts'
import { createHandler } from './server.ts'
import { openStore } from './store/store.ts'

const parentCheckMs = 5000

export function serve(): void {
  const root = storeRoot()
  const socket = socketOf(root, process.pid)
  mkdirSync(dirname(socket), { recursive: true })
  rmSync(socket, { force: true })

  const store = openStore(databaseOf(root))
  const server = Bun.serve({ unix: socket, fetch: createHandler(createEngine(store, createCatalog(configHome()))) })
  const parent = process.ppid

  const stop = () => {
    clearInterval(watchParent)
    void server.stop(true)
    store.close()
    rmSync(socket, { force: true })
    process.exit(0)
  }
  const watchParent = setInterval(() => {
    if (process.ppid !== parent) stop()
  }, parentCheckMs)
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)

  console.log(`unix:${socket}`)
}
