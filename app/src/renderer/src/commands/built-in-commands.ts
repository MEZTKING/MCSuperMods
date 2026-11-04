/**
 * The command palette's commands: every built-in command of the shell (the menu's commands
 * plus new element, rename, go to definition, find usages and the Raw JSON toggle) and the
 * registered plugins' `commands` contributions. Pure: the host supplies a handler per
 * available command; a command without one is left out of the palette.
 *
 * @packageDocumentation
 */

import type { Element, Project, Reference } from '@msm/core';
import type { Command } from '@msm/plugin-api';
import type { PaletteCommand } from '../components/CommandPalette';

/** The ids of the built-in commands (`data-testid="command-<id>"` in the palette). */
export const BUILT_IN_COMMAND_IDS = [
  'newProject',
  'openProject',
  'save',
  'undo',
  'redo',
  'newElement',
  'addNamespace',
  'importAssets',
  'exportResourcePack',
  'exportDataPack',
  'exportCombined',
  'installResourcePack',
  'installDataPack',
  'renameElement',
  'goToDefinition',
  'findUsages',
  'toggleRawJson',
  'settings',
  'chooseInstallTarget',
  'checkForUpdates',
] as const;

/** A built-in command id. */
export type BuiltInCommandId = (typeof BUILT_IN_COMMAND_IDS)[number];

/** Title and shortcut (with `Mod` for Ctrl or Cmd) of each built-in command. */
export const BUILT_IN_COMMANDS: Readonly<
  Record<BuiltInCommandId, { title: string; shortcut?: string }>
> = {
  newProject: { title: 'New project…', shortcut: 'Mod+Shift+N' },
  openProject: { title: 'Open project…', shortcut: 'Mod+O' },
  save: { title: 'Save', shortcut: 'Mod+S' },
  undo: { title: 'Undo', shortcut: 'Mod+Z' },
  redo: { title: 'Redo', shortcut: 'Mod+Shift+Z' },
  newElement: { title: 'New element…', shortcut: 'Mod+N' },
  addNamespace: { title: 'Add namespace…' },
  importAssets: { title: 'Import assets…' },
  exportResourcePack: { title: 'Export resource pack (.zip)…' },
  exportDataPack: { title: 'Export data pack (.zip)…' },
  exportCombined: { title: 'Export both packs into a folder…' },
  installResourcePack: { title: 'Install resource pack' },
  installDataPack: { title: 'Install data pack to a world…' },
  renameElement: { title: 'Rename element…', shortcut: 'F2' },
  goToDefinition: { title: 'Go to definition of the focused reference' },
  findUsages: { title: 'Find usages of the selected element' },
  toggleRawJson: { title: 'Toggle Raw JSON' },
  settings: { title: 'Settings…' },
  chooseInstallTarget: { title: 'Choose install target…' },
  checkForUpdates: { title: 'Check for updates' },
};

/** Handlers of the available built-in commands; a missing or `null` one is unavailable. */
export type CommandHandlers = Partial<Record<BuiltInCommandId, (() => void) | null>>;

/**
 * The palette's commands: available built-in commands in {@link BUILT_IN_COMMAND_IDS} order,
 * then the plugins' commands. A plugin command's failure (thrown or rejected) goes to
 * `onError` with its title.
 *
 * @param handlers - The available built-in commands.
 * @param pluginCommands - The registered plugins' command contributions.
 * @param options - `modKey` replaces `Mod` in shortcuts (`Ctrl` or `Cmd`); `onError`
 *   reports plugin command failures.
 */
export function paletteCommands(
  handlers: CommandHandlers,
  pluginCommands: readonly Command[],
  options: { modKey: string; onError(title: string, error: unknown): void },
): PaletteCommand[] {
  const out: PaletteCommand[] = [];
  for (const id of BUILT_IN_COMMAND_IDS) {
    const run = handlers[id];
    if (run === undefined || run === null) continue;
    const { title, shortcut } = BUILT_IN_COMMANDS[id];
    const command: PaletteCommand = { id, title, run };
    if (shortcut !== undefined) command.shortcut = shortcut.replace('Mod', options.modKey);
    out.push(command);
  }
  for (const contribution of pluginCommands) {
    out.push({
      id: contribution.id,
      title: contribution.title,
      run: () => {
        try {
          const result = contribution.run();
          if (result instanceof Promise) {
            result.catch((error: unknown) => options.onError(contribution.title, error));
          }
        } catch (error) {
          options.onError(contribution.title, error);
        }
      },
    });
  }
  return out;
}

// Go to definition ---------------------------------------------------------------------------

/** Where the caret was when a command was invoked: a form field or a function line. */
export interface FocusedLocation {
  /** RFC 6901 pointer of the focused field, or `/lines/<n>` in the function editor. */
  pointer: string;
  /** Caret offset within the function line, for text references. */
  column?: number;
}

/**
 * The reference at `focus` among one element's references: the reference at exactly that
 * pointer (for a function line, the one whose range holds the caret, else the line's first),
 * else the first one inside it.
 */
export function referenceAt(
  references: readonly Reference[],
  focus: FocusedLocation,
): Reference | undefined {
  const exact = references.filter((reference) => reference.path === focus.pointer);
  const column = focus.column;
  if (exact.length > 0) {
    const holding =
      column === undefined
        ? undefined
        : exact.find(
            (reference) =>
              reference.range !== undefined &&
              column >= reference.range.start &&
              column <= reference.range.end,
          );
    return holding ?? exact[0];
  }
  const inside = `${focus.pointer}/`;
  return references.find((reference) => reference.path.startsWith(inside));
}

/**
 * The project element a reference points at: an element with the referenced id whose kind
 * matches the registry (`minecraft:<registry>`; tags `minecraft:tag/<registry>`), or any
 * element with that id for untyped text references and registries no kind matches.
 */
export function definitionOf(project: Project, reference: Reference): Element | undefined {
  const candidates = project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((element) => element.id === reference.to);
  if (reference.registry === '') return candidates[0];
  const kind = `minecraft:${reference.registry}`;
  return candidates.find((element) => element.kind === kind) ?? candidates[0];
}
