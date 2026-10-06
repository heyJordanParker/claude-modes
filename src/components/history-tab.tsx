import type { RenderElement } from 'claude-code'
import type { Mod } from '../../node_modules/@cmodjs/core/mod.js'
import { Box, Button, Input, Text } from '../../node_modules/@cmodjs/core/ui/elements.js'
import { containerIds, visibleRows, toggled, type Row } from '../history/rows.js'
import type { HistoryKind } from '../protocol.js'
import type { Filter, ModesState } from '../state.js'

export const rowLimit = 400

const filters: readonly Filter[] = ['all', 'prompts', 'tools', 'errors']

const tags: Readonly<Record<HistoryKind, string>> = {
  goal: 'goal',
  context: 'context',
  turn: 'you',
  task: 'agent',
  mode: 'mode',
  prompt: 'prompt',
  reply: 'claude',
  'tool call': 'tool',
  'tool result': 'result',
  skill: 'skill',
  document: 'read',
  notice: 'note',
}

export function HistoryTab({ mod, columns }: { readonly mod: Mod<ModesState>; readonly columns: number }): RenderElement {
  const { history, open, search, selected, modes } = mod.state.memory
  const { view, filter } = mod.state.session
  if (history === null) return <Text dimColor>No history yet. It fills in as the session runs.</Text>

  const { root } = history
  const rows = visibleRows(root, { view, filter, search, open })
  const totals = [modes.main === undefined ? undefined : `mode ${modes.main}`, `${root.calls ?? 0} calls`, root.errors === undefined ? undefined : `${root.errors} failed`].filter((part) => part !== undefined)

  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate-end">{root.label}</Text>
      <Text dimColor>{totals.join(' · ')}</Text>
      <Box gap={1} flexWrap="wrap">
        <Button key="view" hotkey="v" label={view === 'tasks' ? 'Tasks' : 'Timeline'} onPress={() => { mod.state.session.view = view === 'tasks' ? 'timeline' : 'tasks' }} />
        <Button key="filter" hotkey="f" label={`Show: ${filter}`} onPress={() => { mod.state.session.filter = filters[(filters.indexOf(filter) + 1) % filters.length] ?? 'all' }} />
        <Button key="expand" hotkey="e" label="Expand all" onPress={() => { mod.state.memory.open = containerIds(root) }} />
        <Button key="collapse" hotkey="c" label="Collapse all" onPress={() => { mod.state.memory.open = [] }} />
      </Box>
      <Input key="search" label="Find:" placeholder="text in a row" value={search} submitLabel="find" onInput={(value) => { mod.state.memory.search = value }} onSubmit={(value) => { mod.state.memory.search = value }} />
      <Box flexDirection="column" marginTop={1}>
        {rows.length === 0 ? <Text dimColor>Nothing matches.</Text> : rows.slice(0, rowLimit).map((row) => <HistoryRow mod={mod} row={row} columns={columns} isSelected={row.node.id === selected} isTimeline={view === 'timeline'} />)}
        {rows.length > rowLimit ? <Text dimColor>{`${rows.length - rowLimit} more rows. Narrow them with Find or Show.`}</Text> : null}
      </Box>
    </Box>
  )
}

function HistoryRow({ mod, row, columns, isSelected, isTimeline }: { readonly mod: Mod<ModesState>; readonly row: Row; readonly columns: number; readonly isSelected: boolean; readonly isTimeline: boolean }): RenderElement {
  const { node, depth, isOpen, hasChildren } = row
  const isCall = node.kind === 'tool call'
  const counts = [isCall || node.calls === undefined ? undefined : `${node.calls}`, isCall || node.errors === undefined ? undefined : `${node.errors}✗`, node.isError === true ? 'failed' : undefined, node.isRunning === true ? 'running' : undefined].filter((part) => part !== undefined).join(' ')
  const time = isTimeline ? `${new Date(node.at).toTimeString().slice(0, 5)} ` : ''
  const width = Math.max(10, columns - depth * 2 - 12 - counts.length - time.length)
  const label = node.label.length > width ? `${node.label.slice(0, width - 1)}…` : node.label
  const press = () => { mod.state.memory.selected = node.id }

  return (
    <Box key={`row:${node.id}`} gap={1}>
      <Text>{'  '.repeat(depth)}</Text>
      {hasChildren ? (
        <Button key={`toggle:${node.id}`} plain label={isOpen ? '▾' : '▸'} onPress={() => { mod.state.memory.open = toggled(mod.state.memory.open, mod.state.memory.history?.root ?? node, node.id) }} />
      ) : (
        <Text> </Text>
      )}
      <Text dimColor>{`${time}${tags[node.kind].padEnd(6)}`}</Text>
      {node.jump === undefined ? (
        <Text bold={isSelected} {...(node.isError === true ? { color: 'red' } : {})}>{label}</Text>
      ) : (
        <Button key={`jump:${node.jump}#${node.id}`} plain dimColor={!isSelected && node.kind !== 'turn'} label={label} onPress={press} />
      )}
      {counts === '' ? null : <Text dimColor {...(node.errors === undefined && node.isError !== true ? {} : { color: 'red' })}>{counts}</Text>}
    </Box>
  )
}
