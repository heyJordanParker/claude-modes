import { expect, test } from 'bun:test'
import { containerIds, visibleRows } from '../src/history/rows.js'
import type { HistoryNode } from '../src/protocol.js'

const root: HistoryNode = {
  id: 'goal',
  kind: 'goal',
  label: 'Login work',
  at: 0,
  children: [
    {
      id: 'turn:1',
      kind: 'turn',
      label: 'Add a login page',
      at: 1,
      children: [
        { id: 'm1', kind: 'tool call', label: 'Bash ls src', at: 2, isError: true },
        { id: 'task:a', kind: 'task', label: 'explorer: Find the router', at: 3, children: [{ id: 'm2', kind: 'tool call', label: 'Grep router', at: 4 }] },
      ],
    },
    { id: 'turn:2', kind: 'turn', label: 'Now style it', at: 5, children: [{ id: 'm3', kind: 'reply', label: 'Styled.', at: 6 }] },
  ],
}

const labels = (rows: ReturnType<typeof visibleRows>) => rows.map(({ node, depth, isOpen }) => `${'  '.repeat(depth)}${isOpen ? '-' : '+'} ${node.label}`)

test('by default the last turn is open and the others are closed', () => {
  expect(labels(visibleRows(root, { view: 'tasks', filter: 'all', search: '', open: null }))).toEqual(['+ Add a login page', '- Now style it', '  + Styled.'])
})

test('Find keeps the rows that match and opens the rows above them', () => {
  expect(labels(visibleRows(root, { view: 'tasks', filter: 'all', search: 'ROUTER', open: [] }))).toEqual(['- Add a login page', '  - explorer: Find the router', '    + Grep router'])
})

test('Show errors keeps only failed calls and the turns that hold them', () => {
  expect(labels(visibleRows(root, { view: 'tasks', filter: 'errors', search: '', open: [] }))).toEqual(['- Add a login page', '  + Bash ls src'])
})

test('Timeline lists every row in the order it happened, with no nesting', () => {
  expect(labels(visibleRows(root, { view: 'timeline', filter: 'tools', search: '', open: [] }))).toEqual(['+ Bash ls src', '+ explorer: Find the router', '+ Grep router'])
})

test('Expand all opens every turn and task', () => {
  expect(containerIds(root)).toEqual(['turn:1', 'task:a', 'turn:2'])
})
