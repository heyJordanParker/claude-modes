import type { Mod } from '../../node_modules/@cmodjs/core/mod.js'
import { Box, Button, Text } from '../../node_modules/@cmodjs/core/ui/elements.js'
import { factsOf } from '../jobs/mode-gates.js'
import type { ModeSpec } from '../protocol.js'
import type { ModesState } from '../state.js'

export function SettingsTab({ mod, enter, defaultMode }: { readonly mod: Mod<ModesState>; readonly enter: (mode: string) => void; readonly defaultMode: string }): JSX.Element {
  const { definitions, modes, failure } = mod.state.memory
  if (definitions === null) return <Text dimColor>{failure === '' ? 'Loading the modes…' : failure}</Text>

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold>Modes</Text>
        {definitions.modes.length === 0 ? <Text dimColor>No modes yet. Add a Markdown file to one of the folders below, such as review.md.</Text> : null}
        {definitions.modes.map((mode) => (
          <ModeLine mode={mode} isCurrent={mode.name === modes.main} enter={enter} />
        ))}
      </Box>
      <Box flexDirection="column">
        <Text>{`New sessions start in ${defaultMode === '' ? 'the first mode' : defaultMode}.`}</Text>
        <Text dimColor wrap="wrap">Change it under modes in /config, or for a project in .claude/cmods/modes/options.json.</Text>
      </Box>
      <Box flexDirection="column">
        <Text bold>Hook scripts</Text>
        {definitions.hooks.length === 0 ? <Text dimColor>None. Add a .ts file to hooks/ in one of the folders below.</Text> : null}
        {definitions.hooks.map((hook) => (
          <Text wrap="truncate-end">{`${hook.name}  on ${hook.events.join(', ')}${hook.modes.length === 0 ? '' : `  in ${hook.modes.join(', ')}`}`}</Text>
        ))}
      </Box>
      {definitions.problems.length === 0 ? (
        <Text dimColor>No problems.</Text>
      ) : (
        <Box flexDirection="column">
          <Text bold color="red">Problems</Text>
          {definitions.problems.map((problem) => (
            <Text color="red">{`${problem.source}: ${problem.message}`}</Text>
          ))}
        </Box>
      )}
      <Box flexDirection="column">
        <Text bold>Folders</Text>
        {definitions.folders.map((folder) => (
          <Text dimColor wrap="truncate-start">{folder}</Text>
        ))}
        <Text dimColor>A saved change applies to the next event.</Text>
      </Box>
    </Box>
  )
}

function ModeLine({ mode, isCurrent, enter }: { readonly mode: ModeSpec; readonly isCurrent: boolean; readonly enter: (mode: string) => void }): JSX.Element {
  const facts = factsOf(mode)
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Button key={`enter:${mode.name}`} variant={isCurrent ? 'primary' : 'secondary'} label={mode.name} onPress={() => enter(mode.name)} />
        <Text dimColor wrap="truncate-end">{mode.description}</Text>
      </Box>
      {facts.map((fact) => (
        <Text dimColor>{`    ${fact}`}</Text>
      ))}
    </Box>
  )
}
