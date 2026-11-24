import { registerMod, registerPermissionCheck, type AddHook, type PluginOptions } from '../node_modules/@cmodjs/core/register.js'
import { modes } from '../src/mod.js'

export function register(addHook: AddHook, options: PluginOptions): void {
  registerMod(addHook, modes, options)
  registerPermissionCheck(addHook)
}
