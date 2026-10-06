import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error Bun imports the declaration file as text, and tsc reads a declaration file only as types.
import sdkText from '../sdk/claude-modes.d.ts' with { type: 'text' }

const sdkTypes: string = sdkText

const tsconfig = `${JSON.stringify({ compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2023', noEmit: true, types: [] }, include: ['*.ts', 'claude-modes.d.ts'] }, null, 2)}\n`

export function writeEditorTypes(hooksFolder: string): void {
  writeWhenChanged(join(hooksFolder, 'claude-modes.d.ts'), sdkTypes)
  if (!existsSync(join(hooksFolder, 'tsconfig.json'))) writeFileSync(join(hooksFolder, 'tsconfig.json'), tsconfig)
}

function writeWhenChanged(path: string, text: string): void {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return
  writeFileSync(path, text)
}
