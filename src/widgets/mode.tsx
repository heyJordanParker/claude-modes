import { AbovePrompt, BelowPrompt, type WidgetInit } from '../../node_modules/@cmodjs/core/mod.js'
import { Button } from '../../node_modules/@cmodjs/core/ui/elements.js'
import type { ModesState } from '../state.js'

export function modeWidget(cycle: () => void): WidgetInit<ModesState> {
  return {
    id: 'mode',
    title: 'Mode',
    areas: [BelowPrompt, AbovePrompt],
    render: (mod) => {
      const { main } = mod.state.memory.modes
      return main === undefined ? undefined : <Button key="mode" plain label={`mode: ${main}`} onPress={cycle} />
    },
  }
}
