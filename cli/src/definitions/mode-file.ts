import { basename } from 'node:path'
import type { Gate, ModeSpec, Patterns, Target, Transition } from '../../../src/protocol.ts'
import { readFrontmatter } from './frontmatter.ts'

const targetKeys = ['command', 'read', 'write', 'fetch', 'subagent', 'tool'] as const
const exceptKeys = new Set(['read', 'write', 'fetch'])
const modeKeys = new Set(['order', 'description', 'deny', 'ask', 'lasts', 'after'])

export const modeName = /^[A-Za-z0-9_-]{1,64}$/

export function readModeFile(path: string, text: string): ModeSpec {
  const name = basename(path, '.md')
  if (!modeName.test(name)) throw new Error(`"${name}" is not a mode name. Name the file with 1 to 64 letters, digits, "_", or "-", such as review.md.`)
  const { data, body } = readFrontmatter(text)
  for (const key of Object.keys(data)) if (!modeKeys.has(key)) throw new Error(`"${key}" is not a mode key. Use ${[...modeKeys].join(', ')}.`)

  const order = data['order']
  if (order !== undefined && typeof order !== 'number') throw new Error('order is not a number. Write a number, such as order: 1.')
  const description = data['description']
  if (description !== undefined && typeof description !== 'string') throw new Error('description is not text.')
  const lasts = data['lasts']
  if (lasts !== undefined && lasts !== 'turn') throw new Error(`lasts is "${String(lasts)}". The one value is turn, or leave it out.`)

  return {
    name,
    order: order ?? Number.MAX_SAFE_INTEGER,
    description: description ?? '',
    rules: body,
    deny: listOf(data['deny'], 'deny').map((rule, index) => gateOf(rule, `deny[${index}]`)),
    ask: listOf(data['ask'], 'ask').map((rule, index) => gateOf(rule, `ask[${index}]`)),
    ...(lasts === undefined ? {} : { lasts }),
    after: listOf(data['after'], 'after').map((rule, index) => transitionOf(rule, `after[${index}]`)),
    source: path,
  }
}

function listOf(value: unknown, key: string): Record<string, unknown>[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${key} is not a list. Write each rule as an item that starts with "- ".`)
  return value.map((item: unknown, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error(`${key}[${index}] is not a rule. Write a key such as write: "src/**".`)
    return item as Record<string, unknown>
  })
}

function targetOf(rule: Record<string, unknown>, where: string): Target & { readonly key: (typeof targetKeys)[number] } {
  const keys = targetKeys.filter((key) => rule[key] !== undefined)
  const [key] = keys
  if (key === undefined || keys.length > 1) throw new Error(`${where} names ${keys.length === 0 ? 'no target' : keys.join(' and ')}. Name exactly one of ${targetKeys.join(', ')}.`)
  return { key, [key]: patternsOf(rule[key], `${where}.${key}`) }
}

function patternsOf(value: unknown, where: string): Patterns {
  if (typeof value === 'string' && value !== '') return value
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item !== '')) return value as string[]
  throw new Error(`${where} is not a pattern. Write one pattern, or a list of them.`)
}

function gateOf(rule: Record<string, unknown>, where: string): Gate {
  const { key, ...target } = targetOf(rule, where)
  for (const field of Object.keys(rule)) {
    if (field !== key && field !== 'except' && field !== 'reason') throw new Error(`${where} has "${field}". A rule holds one target, and may add except and reason.`)
  }
  const except = rule['except']
  if (except !== undefined && !exceptKeys.has(key)) throw new Error(`${where} has except on ${key}. except works on read, write, and fetch.`)
  const reason = rule['reason']
  if (reason !== undefined && typeof reason !== 'string') throw new Error(`${where}.reason is not text.`)
  return { ...target, ...(except === undefined ? {} : { except: patternsOf(except, `${where}.except`) }), ...(reason === undefined ? {} : { reason }) }
}

function transitionOf(rule: Record<string, unknown>, where: string): Transition {
  const { key, ...target } = targetOf(rule, where)
  for (const field of Object.keys(rule)) {
    if (field !== key && field !== 'enter') throw new Error(`${where} has "${field}". A transition holds one target and enter.`)
  }
  const enter = rule['enter']
  if (typeof enter !== 'string' || !modeName.test(enter)) throw new Error(`${where}.enter is not a mode name.`)
  return { ...target, enter }
}
