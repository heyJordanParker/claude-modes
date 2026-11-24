import type { Definitions, ModeState } from './protocol.js'

export type Tab = 'mode' | 'settings'

export type ModesState = {
  memory: {
    modes: ModeState
    definitions: Definitions | null
    modeTab: { readonly title: string; readonly markdown: string } | null
    failure: string
  }
  session: {
    tab: Tab
  }
}

export const initialState: ModesState = {
  memory: {
    modes: { main: undefined, agents: {} },
    definitions: null,
    modeTab: null,
    failure: '',
  },
  session: {
    tab: 'settings',
  },
}
