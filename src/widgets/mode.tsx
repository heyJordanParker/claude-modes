import { AbovePrompt, BelowPrompt, type WidgetInit } from '../../node_modules/@cmodjs/core/mod.js'
import { Button, Text } from '../../node_modules/@cmodjs/core/ui/elements.js'
import { modeOf } from '../mode-state.js'
import type { ModesState } from '../state.js'

export function modeWidget(cycle: () => void): WidgetInit<ModesState> {
  return {
    id: 'mode',
    title: 'Mode',
    areas: [BelowPrompt, AbovePrompt],
    render: (mod) => {
      const { main } = mod.state.session.modes
      if (main === undefined) return undefined
      const color = modeOf(mod.state, undefined)?.color
      return (
        <Button key="mode" plain label={`mode: ${main}`} onPress={cycle}>
          mode: <Text {...(color === undefined ? {} : { color })}>{main}</Text>
        </Button>
      )
    },
  }
}
