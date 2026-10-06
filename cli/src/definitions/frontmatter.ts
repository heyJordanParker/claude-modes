export type Frontmatter = {
  readonly data: Readonly<Record<string, unknown>>
  readonly body: string
}

const fence = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function readFrontmatter(text: string): Frontmatter {
  const match = fence.exec(text)
  if (match === null) return { data: {}, body: text.trim() }
  const parsed: unknown = Bun.YAML.parse(match[1] ?? '')
  if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('the frontmatter is not a YAML mapping of keys to values.')
  return { data: (parsed ?? {}) as Record<string, unknown>, body: text.slice(match[0].length).trim() }
}
