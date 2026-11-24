import { messageOf, providers, type Job, type Subscription } from '../../node_modules/@cmodjs/core/mod.js'
import type { RulebookCheck } from '../../types/index.js'
import type { ModesState } from '../state.js'
import { modeNameOf } from './mode-gates.js'

export function offRules(state: ModesState, check: RulebookCheck): Readonly<Record<string, 'off'>> | undefined {
  const mode = modeNameOf(state, check.task)
  const off = check.rules.filter(({ metadata }) => typeof metadata['mode'] === 'string' && metadata['mode'] !== mode).map(({ id }) => [id, 'off'] as const)
  return off.length === 0 ? undefined : Object.fromEntries(off)
}

export function ruleModes(): Job<void, ModesState> {
  return ({ mod, announce }) => {
    let listeners: readonly Subscription[] = []
    const listen = async () => {
      const rulebooks = await providers('rulebook/Rules')
      for (const listener of listeners) listener.remove()
      listeners = rulebooks.map((rulebook) =>
        rulebook.beforeCheck(
          (check) => {
            const rules = offRules(mod.state, check)
            return rules === undefined ? undefined : { rules }
          },
          { timeoutMs: 1000 },
        ),
      )
    }
    const logFailure = (step: string) => (error: unknown) => mod.log(`Modes could not ${step}: ${messageOf(error)}`, { level: 'error' })
    const listFailure = logFailure("list rulebook's providers")
    void listen().catch(listFailure)
    void providers('cmod/Providers')
      .then(([watch]) => watch?.onChange({ interface: 'rulebook/Rules' }, () => listen().catch(listFailure)))
      .catch(logFailure('hear when rulebook starts or stops'))
    announce('the mode of each rulebook rule')
  }
}
