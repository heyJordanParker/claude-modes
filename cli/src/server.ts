import type { HookRequest } from '../../src/protocol.ts'
import type { Engine } from './engine.ts'

type Routes = Readonly<Record<string, (body: Record<string, unknown>) => unknown>>

export function createHandler(engine: Engine): (request: Request) => Promise<Response> {
  const routes: Routes = {
    '/hook': (body) => engine.hook(body as HookRequest),
    '/definitions': (body) => engine.definitions(String(body['projectRoot'])),
  }

  return async (request) => {
    const route = routes[new URL(request.url).pathname]
    if (route === undefined || request.method !== 'POST') return Response.json({ error: `${request.method} ${new URL(request.url).pathname} is not a route.` }, { status: 404 })
    try {
      return Response.json(await route((await request.json()) as Record<string, unknown>))
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
    }
  }
}
