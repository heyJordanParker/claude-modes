import type { On } from 'claude-code'
import { registerMod, registerPermissionCheck } from '../node_modules/@cmodjs/core/register.js'
import { modes } from '../src/mod.js'

export function register(addHook: On): void {
  addHook('ui.press', { plugin: 'modes', element: /^jump:/ }, async ($, e, next) => {
    const requestId = e.element.slice('jump:'.length, e.element.lastIndexOf('#'))
    const scrolled = await $.ui.scroll({ to: { requestId }, block: 'start' })
    if (scrolled.deny !== undefined) $.ui.toast(`That row is no longer drawn in the transcript: ${scrolled.deny}`)
    return next(e)
  })
  registerMod(addHook, modes)
  registerPermissionCheck(addHook)
}
