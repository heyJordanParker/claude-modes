import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { Definitions, ModeSpec, Problem } from '../../../src/protocol.ts'
import { writeEditorTypes } from './editor-types.ts'
import { readFrontmatter } from './frontmatter.ts'
import { readModeFile } from './mode-file.ts'
import { loadScript, scriptExtensions, type LoadedScript } from './scripts.ts'

export type Loaded = {
  readonly definitions: Definitions
  readonly scripts: readonly LoadedScript[]
  readonly agentModes: ReadonlyMap<string, string>
  readonly skillModes: ReadonlyMap<string, string>
}

export type Catalog = {
  load(projectRoot: string): Promise<Loaded>
  readonly version: number
}

export function foldersOf(configHome: string, projectRoot: string) {
  const project = join(projectRoot, '.claude')
  return {
    modes: [join(configHome, 'cmods', 'modes'), join(project, 'cmods', 'modes')],
    agents: [join(configHome, 'agents'), join(project, 'agents')],
    skills: [join(configHome, 'skills'), join(project, 'skills')],
  }
}

export function createCatalog(configHome: string): Catalog {
  let version = 1
  const cache = new Map<string, { readonly signature: string; readonly loaded: Loaded }>()

  return {
    get version() {
      return version
    },
    async load(projectRoot) {
      const folders = foldersOf(configHome, projectRoot)
      const known = cache.get(projectRoot)
      if (known !== undefined && known.signature === signatureOf(folders)) return known.loaded
      if (known !== undefined) version += 1
      const loaded = await loadAll(folders, version)
      cache.set(projectRoot, { signature: signatureOf(folders), loaded })
      return loaded
    },
  }
}

function signatureOf(folders: ReturnType<typeof foldersOf>): string {
  const files = [
    ...folders.modes.flatMap((folder) => [...filesIn(folder, (name) => name.endsWith('.md')), ...filesIn(join(folder, 'hooks'), () => true)]),
    ...folders.agents.flatMap((folder) => filesIn(folder, (name) => name.endsWith('.md'), true)),
    ...folders.skills.flatMap((folder) => directoriesIn(folder).map((skill) => join(skill, 'SKILL.md')).filter((path) => existsSync(path))),
  ]
  return files
    .map((path) => {
      const { mtimeMs, size } = statSync(path)
      return `${path}:${mtimeMs}:${size}`
    })
    .join('\n')
}

async function loadAll(folders: ReturnType<typeof foldersOf>, version: number): Promise<Loaded> {
  const problems: Problem[] = []
  const attempt = <Value>(source: string, read: () => Value): Value | undefined => {
    try {
      return read()
    } catch (error) {
      problems.push({ source, message: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }

  const modes = new Map<string, ModeSpec>()
  for (const folder of folders.modes) {
    for (const path of filesIn(folder, (name) => name.endsWith('.md'))) {
      const mode = attempt(path, () => readModeFile(path, readFileSync(path, 'utf8')))
      if (mode !== undefined) modes.set(mode.name, mode)
    }
  }
  const ordered = [...modes.values()].sort((first, second) => first.order - second.order || first.name.localeCompare(second.name))
  for (const mode of ordered) {
    for (const transition of mode.after) if (!modes.has(transition.enter)) problems.push({ source: mode.source, message: `after enters "${transition.enter}", which no mode file defines.` })
  }

  const scripts = new Map<string, LoadedScript>()
  for (const folder of folders.modes) {
    const hooks = join(folder, 'hooks')
    if (existsSync(hooks)) attempt(hooks, () => writeEditorTypes(hooks))
    for (const path of filesIn(hooks, (name) => scriptExtensions.has(extname(name)) && !name.endsWith('.d.ts'))) {
      try {
        const script = await loadScript(path)
        scripts.set(script.name, script)
        for (const name of script.modes) if (!modes.has(name)) problems.push({ source: path, message: `mode names "${name}", which no mode file defines.` })
      } catch (error) {
        problems.push({ source: path, message: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  const promptModes = (paths: readonly string[], nameOf: (path: string) => string) => {
    const found = new Map<string, string>()
    for (const path of paths) {
      const data = attempt(path, () => readFrontmatter(readFileSync(path, 'utf8')).data)
      const mode = data?.['mode']
      if (mode === undefined) continue
      if (typeof mode !== 'string' || !modes.has(mode)) {
        problems.push({ source: path, message: `mode: ${String(mode)} names no mode file. Use one of ${ordered.map(({ name }) => name).join(', ') || 'the modes you define'}.` })
        continue
      }
      const name = typeof data?.['name'] === 'string' ? data['name'] : nameOf(path)
      found.set(name, mode)
    }
    return found
  }
  const agentFiles = folders.agents.flatMap((folder) => filesIn(folder, (name) => name.endsWith('.md'), true))
  const skillFiles = folders.skills.flatMap((folder) => directoriesIn(folder).map((skill) => join(skill, 'SKILL.md')).filter((path) => existsSync(path)))

  return {
    definitions: {
      version,
      modes: ordered,
      hooks: [...scripts.values()].map(({ name, source, events, modes: names }) => ({ name, source, events, modes: names })),
      problems,
      folders: folders.modes,
    },
    scripts: [...scripts.values()],
    agentModes: promptModes(agentFiles, (path) => basename(path, '.md')),
    skillModes: promptModes(skillFiles, (path) => basename(dirname(path))),
  }
}

function filesIn(folder: string, accepts: (name: string) => boolean, isRecursive = false): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder, { recursive: isRecursive, encoding: 'utf8' })
    .filter((name) => accepts(name) && statSync(join(folder, name)).isFile())
    .sort()
    .map((name) => join(folder, name))
}

function directoriesIn(folder: string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .map((name) => join(folder, name))
    .filter((path) => statSync(path).isDirectory())
}
