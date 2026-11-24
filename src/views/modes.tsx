import type { Mod, ViewInit } from '../../node_modules/@cmodjs/core/mod.js'
import { Tabs } from '../../node_modules/@cmodjs/core/ui/components.js'
import { Markdown } from '../../node_modules/@cmodjs/core/ui/elements.js'
import { SettingsTab } from '../components/settings-tab.js'
import type { ModesState, Tab } from '../state.js'

export function modesView(enter: (mode: string) => void, defaultMode: () => string): ViewInit<ModesState> {
  return {
    id: 'modes',
    title: 'Modes',
    render: (mod) => {
      const tab = shownTab(mod)
      const { modeTab } = mod.state.memory
      const tabs = [...(modeTab === null ? [] : [{ key: 'mode', label: modeTab.title }]), { key: 'settings', label: 'Settings' }]
      return (
        <Tabs tabs={tabs} selected={tab} onSelect={(key) => void (mod.state.session.tab = key as Tab)}>
          {tab === 'mode' && modeTab !== null ? <Markdown text={modeTab.markdown.slice(0, 10000)} /> : <SettingsTab mod={mod} enter={enter} defaultMode={defaultMode()} />}
        </Tabs>
      )
    },
  }
}

function shownTab(mod: Mod<ModesState>): Tab {
  return mod.state.memory.modeTab === null ? 'settings' : mod.state.session.tab
}
