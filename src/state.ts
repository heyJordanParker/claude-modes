import type { Definitions, ModeEntry, ModeState } from './protocol.js'

export type Tab = 'mode' | 'settings'

export type ModesState = {
  memory: {
    definitions: Definitions | null
    modeTab: { readonly title: string; readonly markdown: string } | null
    failure: string
  }
  session: {
    tab: Tab
    modes: ModeState
    previous: string | null
    told: Record<string, string>
    entries: ModeEntry[]
  }
}

export const initialState: ModesState = {
  memory: {
    definitions: null,
    modeTab: null,
    failure: '',
  },
  session: {
    tab: 'settings',
    modes: { main: undefined, agents: {} },
    previous: null,
    told: {},
    entries: [],
  },
}
