import type { Effect } from './protocol.js'

export type Answers = {
  readonly refuse: string | undefined
  readonly ask: string | undefined
  readonly note: string | undefined
}

export function answersOf(effects: readonly Effect[]): Answers {
  const texts = (keys: readonly string[], separator: string) => {
    const found = effects.flatMap((effect) => Object.entries(effect).flatMap(([key, text]) => (keys.includes(key) ? [String(text)] : [])))
    return found.length === 0 ? undefined : found.join(separator)
  }
  return { refuse: texts(['deny', 'block'], '\n'), ask: texts(['ask'], '\n'), note: texts(['context'], '\n\n') }
}
