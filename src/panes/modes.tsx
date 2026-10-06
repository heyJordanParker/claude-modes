import type { Mod } from '../../node_modules/@cmodjs/core/mod.js'
import { definePane } from '../../node_modules/@cmodjs/core/ui/define-pane.js'
import { Box, Button, Markdown } from '../../node_modules/@cmodjs/core/ui/elements.js'
import { HistoryTab } from '../components/history-tab.js'
import { SettingsTab } from '../components/settings-tab.js'
import type { ModesState, Tab } from '../state.js'

export const paneId = 'modes'

export function modesPane(enter: (mode: string) => void) {
  return definePane<ModesState>({
    id: paneId,
    title: 'Modes',
    columns: 64,
    render: (mod, { bodyColumns }) => {
      const tab = shownTab(mod)
      const { modeTab } = mod.state.memory
      const choose = (next: Tab) => () => {
        mod.state.session.tab = next
      }
      return (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            {modeTab === null ? null : <Button key="tab-mode" hotkey="m" variant={tab === 'mode' ? 'primary' : 'secondary'} label={modeTab.title} onPress={choose('mode')} />}
            <Button key="tab-history" hotkey="h" variant={tab === 'history' ? 'primary' : 'secondary'} label="History" onPress={choose('history')} />
            <Button key="tab-settings" hotkey="s" variant={tab === 'settings' ? 'primary' : 'secondary'} label="Settings" onPress={choose('settings')} />
          </Box>
          {tab === 'mode' && modeTab !== null ? <Markdown text={modeTab.markdown.slice(0, 10000)} /> : null}
          {tab === 'history' ? <HistoryTab mod={mod} columns={bodyColumns} /> : null}
          {tab === 'settings' ? <SettingsTab mod={mod} enter={enter} /> : null}
        </Box>
      )
    },
  })
}

export function shownTab(mod: Mod<ModesState>): Tab {
  const { tab } = mod.state.session
  return tab === 'mode' && mod.state.memory.modeTab === null ? 'history' : tab
}
