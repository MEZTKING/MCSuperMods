/**
 * The commands source (ADR 0124 D3, D10; B660): one entry per palette command, the shell's
 * built-in commands (with the sentence and extra words B662 gives them, when it has) and then the
 * registered plugins' `commands`, first id wins. The app hands in its list (the built-in table
 * lives with the palette); whether a command can run now is the action's business, so every
 * command is available.
 *
 * @packageDocumentation
 */

import type { SearchEntry } from '@msm/search';
import {
  asAction,
  asPreview,
  entryIds,
  type StaticSourceInput,
  sentenceField,
  wordsField,
} from './shared';

/** One command line as the app knows it. */
export interface CommandLine {
  readonly id: string;
  readonly title: string;
  readonly sentence?: string;
  readonly words?: readonly string[];
}

/** The command entries: `builtIn` (the shell's) then every plugin's commands. */
export function commandEntries(
  input: Pick<StaticSourceInput, 'plugins'>,
  builtIn: readonly CommandLine[],
): SearchEntry[] {
  const seen = new Set<string>();
  const out: SearchEntry[] = [];
  const add = (line: CommandLine, plugin?: string): void => {
    if (seen.has(line.id) || typeof line.title !== 'string') return;
    seen.add(line.id);
    const action = { type: 'command', command: line.id } as const;
    out.push({
      id: entryIds.command(line.id),
      source: 'command',
      title: line.title.replace(/…$/, '').trim(),
      ...sentenceField(line.sentence),
      ...wordsField(line.words ?? []),
      available: true,
      ...(plugin !== undefined ? { plugin } : {}),
      action: asAction(action),
      preview: asPreview(action),
    });
  };
  for (const line of builtIn) add(line);
  for (const plugin of input.plugins) {
    for (const command of plugin.contributes.commands ?? []) {
      add({ id: command.id, title: command.title }, plugin.id);
    }
  }
  return out;
}
