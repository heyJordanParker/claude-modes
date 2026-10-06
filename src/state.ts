import type { Definitions, History, ModeState } from './protocol.js'

export type Tab = 'mode' | 'history' | 'settings'

export type View = 'tasks' | 'timeline'

export type Filter = 'all' | 'prompts' | 'tools' | 'errors'

export type ModesState = {
  memory: {
    modes: ModeState
    definitions: Definitions | null
    history: History | null
    open: readonly string[] | null
    selected: string
    search: string
    modeTab: { readonly title: string; readonly markdown: string } | null
    failure: string
  }
  session: {
    tab: Tab
    view: View
    filter: Filter
  }
  global: {
    defaultMode: string
  }
}

export const initialState: ModesState = {
  memory: {
    modes: { main: undefined, agents: {} },
    definitions: null,
    history: null,
    open: null,
    selected: '',
    search: '',
    modeTab: null,
    failure: '',
  },
  session: {
    tab: 'history',
    view: 'tasks',
    filter: 'all',
  },
  global: {
    defaultMode: '',
  },
}
