import type { HistoryKind, HistoryNode } from '../protocol.js'
import type { Filter, View } from '../state.js'

export type Row = {
  readonly node: HistoryNode
  readonly depth: number
  readonly isOpen: boolean
  readonly hasChildren: boolean
}

export type RowOptions = {
  readonly view: View
  readonly filter: Filter
  readonly search: string
  readonly open: readonly string[] | null
}

const containers: ReadonlySet<HistoryKind> = new Set(['goal', 'context', 'turn', 'task'])

const filterKinds: Readonly<Record<Exclude<Filter, 'all' | 'errors'>, ReadonlySet<HistoryKind>>> = {
  prompts: new Set(['turn', 'prompt']),
  tools: new Set(['tool call', 'task']),
}

export function isContainer(node: HistoryNode): boolean {
  return containers.has(node.kind)
}

export function defaultOpen(root: HistoryNode): string[] {
  const open: string[] = []
  let lastTurn: string | undefined
  const walk = (node: HistoryNode) => {
    if (node.kind === 'context') open.push(node.id)
    if (node.kind === 'turn') lastTurn = node.id
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return lastTurn === undefined ? open : [...open, lastTurn]
}

export function containerIds(root: HistoryNode): string[] {
  const ids: string[] = []
  const walk = (node: HistoryNode) => {
    if (isContainer(node) && node !== root) ids.push(node.id)
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return ids
}

export function visibleRows(root: HistoryNode, options: RowOptions): Row[] {
  const search = options.search.trim().toLowerCase()
  const matches = (node: HistoryNode) =>
    (search === '' || node.label.toLowerCase().includes(search)) &&
    (options.filter === 'all' || (options.filter === 'errors' ? node.isError === true : filterKinds[options.filter].has(node.kind)))
  const isNarrowed = search !== '' || options.filter !== 'all'

  if (options.view === 'timeline') {
    const rows: Row[] = []
    const walk = (node: HistoryNode) => {
      if (node !== root && node.kind !== 'context' && matches(node)) rows.push({ node, depth: 0, isOpen: false, hasChildren: false })
      for (const child of node.children ?? []) walk(child)
    }
    walk(root)
    return rows.sort((first, second) => first.node.at - second.node.at)
  }

  const open = new Set(options.open ?? defaultOpen(root))
  const kept = new Map<HistoryNode, boolean>()
  const keep = (node: HistoryNode): boolean => {
    const known = kept.get(node)
    if (known !== undefined) return known
    const result = matches(node) || (node.children ?? []).some(keep)
    kept.set(node, result)
    return result
  }

  const rows: Row[] = []
  const walk = (node: HistoryNode, depth: number) => {
    for (const child of node.children ?? []) {
      if (isNarrowed && !keep(child)) continue
      const hasChildren = (child.children ?? []).length > 0
      const isOpen = hasChildren && (open.has(child.id) || (isNarrowed && (child.children ?? []).some(keep)))
      rows.push({ node: child, depth, isOpen, hasChildren })
      if (isOpen) walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return rows
}

export function toggled(open: readonly string[] | null, root: HistoryNode, id: string): string[] {
  const current = open ?? defaultOpen(root)
  return current.includes(id) ? current.filter((known) => known !== id) : [...current, id]
}
