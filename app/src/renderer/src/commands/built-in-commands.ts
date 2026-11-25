/**
 * The command palette's commands: every built-in command of the shell (the menu's commands
 * plus new element, rename, go to definition, find usages, Edit as raw text and the AI
 * helper's entry points) and the
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
  'newProjectFromStarter',
  'openProject',
  'openRecent',
  'upgradeTarget',
  'save',
  'undo',
  'redo',
  'newElement',
  'addNamespace',
  'importAssets',
  'importStructure',
  'importBlockbench',
  'exportResourcePack',
  'exportDataPack',
  'exportCombined',
  'installResourcePack',
  'installDataPack',
  'exportStructures',
  'exportSchematics',
  'exportFabricJar',
  'exportJavaProject',
  'exportMap',
  'testInMinecraft',
  'renameElement',
  'goToDefinition',
  'findUsages',
  'toggleRawJson',
  'settings',
  'chooseInstallTarget',
  'examples',
  'whatsNew',
  'firstMod',
  'modpacks',
  'newWithAi',
  'pictureToTexture',
  'changeMinecraftTexture',
  'wishlist',
  'checkForUpdates',
  'aiHelper',
  'aiExplainProblem',
  'aiAskElement',
  'creator',
  'surpriseMe',
  'play',
  'reloadGame',
  'tryIt',
  'home',
  'showcase',
  'moreIdeas',
  'yourMods',
  // ADR 0124 D10: last, so the palette's empty list keeps its order.
  'searchEverything',
] as const;

/** A built-in command id. */
export type BuiltInCommandId = (typeof BUILT_IN_COMMAND_IDS)[number];

/**
 * Title and shortcut (with `Mod` for Ctrl or Cmd) of each built-in command, with one plain
 * sentence and the extra words people type for it (ADR 0124 D1; the search finds commands by
 * them, the palette shows titles only).
 */
export const BUILT_IN_COMMANDS: Readonly<
  Record<
    BuiltInCommandId,
    { title: string; shortcut?: string; sentence: string; words: readonly string[] }
  >
> = {
  newProject: {
    title: 'New project…',
    shortcut: 'Mod+Shift+N',
    sentence: 'Start a new mod from nothing or from a starter.',
    words: ['new mod', 'create mod', 'start', 'blank project', 'make a mod'],
  },
  newProjectFromStarter: {
    title: 'New project from starter…',
    sentence: 'Start a new mod from a ready-made starter.',
    words: ['template', 'starter mod', 'wizard', 'quick start', 'new mod'],
  },
  openProject: {
    title: 'Open project…',
    shortcut: 'Mod+O',
    sentence: 'Open a mod folder saved on this computer.',
    words: ['open mod', 'load', 'load project', 'folder'],
  },
  openRecent: {
    title: 'Open recent project…',
    sentence: 'Open one of the mods you worked on lately.',
    words: ['recent', 'last project', 'history', 'reopen'],
  },
  upgradeTarget: {
    title: 'Move to another Minecraft version…',
    sentence: 'Move the mod to another Minecraft version and see what changes.',
    words: [
      'minecraft version',
      'update version',
      'upgrade',
      'upgrade project target',
      'new version',
      'snapshot',
      'port',
      'migrate',
    ],
  },
  save: {
    title: 'Save',
    shortcut: 'Mod+S',
    sentence: "Save the changes to the mod's files.",
    words: ['save project', 'write', 'store', 'keep changes'],
  },
  undo: {
    title: 'Undo',
    shortcut: 'Mod+Z',
    sentence: 'Take back the last change.',
    words: ['revert', 'go back', 'oops', 'ctrl z'],
  },
  redo: {
    title: 'Redo',
    shortcut: 'Mod+Shift+Z',
    sentence: 'Make again the change you just took back.',
    words: ['repeat', 'redo change', 'ctrl y'],
  },
  newElement: {
    title: 'New element…',
    shortcut: 'Mod+N',
    sentence: 'Add a new thing to the mod from a template.',
    words: ['add', 'add element', 'new thing', 'create', 'template'],
  },
  addNamespace: {
    title: 'Add namespace…',
    sentence: 'Add another namespace, the first part of ids such as mymod:ruby.',
    words: ['namespace', 'mod id', 'id prefix', 'folder'],
  },
  importAssets: {
    title: 'Import assets…',
    sentence: 'Bring pictures, sounds and other files into the mod.',
    words: ['import', 'textures', 'sounds', 'png', 'ogg', 'add files'],
  },
  importStructure: {
    title: 'Import structure (.nbt, .schem)…',
    sentence: 'Bring a structure file saved in Minecraft or a schematic into the mod.',
    words: ['structure', 'nbt', 'schematic', 'schem', 'building', 'import build'],
  },
  importBlockbench: {
    title: 'Import Blockbench model…',
    sentence: 'Bring a model made in Blockbench into the mod.',
    words: ['blockbench', 'bbmodel', 'model', '3d model', 'import model'],
  },
  exportResourcePack: {
    title: 'Export resource pack (.zip)…',
    sentence: "Save the mod's pictures, models and sounds as a resource pack zip.",
    words: ['resource pack', 'texture pack', 'zip', 'export pack', 'share'],
  },
  exportDataPack: {
    title: 'Export data pack (.zip)…',
    sentence: "Save the mod's recipes, loot and other data as a data pack zip.",
    words: ['data pack', 'datapack', 'zip', 'export pack', 'share'],
  },
  exportCombined: {
    title: 'Export both packs into a folder…',
    sentence: 'Save the resource pack and the data pack together into one folder.',
    words: ['both packs', 'resource and data pack', 'export folder', 'packs'],
  },
  installResourcePack: {
    title: 'Install resource pack',
    sentence: "Put the resource pack straight into your Minecraft's resource packs folder.",
    words: ['install', 'resource pack', 'texture pack', 'copy to minecraft'],
  },
  installDataPack: {
    title: 'Install data pack to a world…',
    sentence: 'Put the data pack into one of your Minecraft worlds.',
    words: ['install', 'data pack', 'datapack', 'world', 'copy to world'],
  },
  exportStructures: {
    title: 'Export structures (.nbt) into a folder…',
    sentence: "Save the mod's structures as Minecraft structure files.",
    words: ['structure', 'nbt', 'export build', 'buildings'],
  },
  exportSchematics: {
    title: 'Export structures as Sponge schematics (.schem) into a folder…',
    sentence: "Save the mod's structures as Sponge schematics for other tools.",
    words: ['schematic', 'schem', 'worldedit', 'sponge', 'export build'],
  },
  exportFabricJar: {
    title: 'Export Fabric mod jar…',
    sentence: 'Build the mod as a Fabric jar to put in a mods folder.',
    words: ['jar', 'fabric', 'build mod', 'mod file', 'export mod', 'share'],
  },
  exportJavaProject: {
    title: 'Export Java project…',
    sentence: 'Turn the mod into a Java project to keep working on in code.',
    words: ['java', 'eject', 'source code', 'gradle', 'intellij', 'code'],
  },
  exportMap: {
    title: 'Export as a map…',
    sentence: 'Share a world from your game as a map, with or without the mod.',
    words: [
      'map',
      'world',
      'share world',
      'adventure map',
      'mrpack',
      'download world',
      'export world',
    ],
  },
  testInMinecraft: {
    title: 'Test in Minecraft…',
    sentence: 'Install the mod into a game folder to try it in Minecraft.',
    words: ['test', 'install mod', 'try in game', 'run'],
  },
  renameElement: {
    title: 'Rename element…',
    shortcut: 'F2',
    sentence: 'Give the selected thing a new name and id, and update what uses it.',
    words: ['rename', 'change name', 'change id', 'refactor'],
  },
  goToDefinition: {
    title: 'Go to definition of the focused reference',
    sentence: 'Open the thing that the id under the cursor names.',
    words: ['go to', 'jump', 'definition', 'open reference', 'follow'],
  },
  findUsages: {
    title: 'Find usages of the selected element',
    sentence: 'List everything in the mod that uses the selected thing.',
    words: ['usages', 'references', 'where used', 'who uses', 'find'],
  },
  toggleRawJson: {
    title: 'Edit as raw text',
    sentence: "Open the selected thing's raw text, in Where it goes under More options.",
    words: ['json', 'raw', 'raw json', 'source', 'code view', 'file', 'more options'],
  },
  settings: {
    title: 'Settings…',
    sentence: 'Open the settings: game folders, updates, the AI helper and more.',
    words: ['preferences', 'options', 'config', 'configuration', 'setup'],
  },
  chooseInstallTarget: {
    title: 'Choose install target…',
    sentence: 'Choose the game folder or launcher instance installs go to.',
    words: ['install target', 'instance', 'launcher', 'game folder', 'prism'],
  },
  examples: {
    title: 'Examples…',
    sentence: 'Browse finished example mods to open or learn from.',
    words: ['examples', 'samples', 'gallery', 'demo', 'inspiration'],
  },
  whatsNew: {
    title: "What's new…",
    sentence: 'See what changed in this version of MCSuperMods.',
    words: ['changelog', 'release notes', 'news', 'whats new', 'updates'],
  },
  firstMod: {
    title: 'Your first mod…',
    sentence: 'Follow the step-by-step guide to making your first mod.',
    words: ['tutorial', 'guide', 'beginner', 'first mod', 'help', 'walkthrough'],
  },
  modpacks: {
    title: 'Modpacks…',
    sentence: 'Make a modpack from your mod and others for a launcher.',
    words: ['modpack', 'pack', 'mrpack', 'curseforge', 'modrinth', 'prism'],
  },
  newWithAi: {
    title: 'Build with the AI helper (new project or this one)…',
    sentence: 'Describe what you want and let the AI helper build it.',
    words: ['ai', 'claude', 'build with ai', 'generate', 'describe'],
  },
  pictureToTexture: {
    title: 'Picture to texture (screenshot, image or skin)…',
    sentence: 'Turn a screenshot, picture or skin into a texture for the mod.',
    words: ['image', 'picture', 'photo', 'screenshot', 'skin', 'texture', 'convert'],
  },
  changeMinecraftTexture: {
    title: 'Change a Minecraft texture…',
    sentence:
      "Pick one of Minecraft's own textures, paint your version, and the game shows yours (a resource pack override).",
    words: [
      'minecraft texture',
      'retexture',
      'resource pack retexture',
      'edit stone texture',
      'change how dirt looks',
      'change how minecraft looks',
      'vanilla texture',
      'override texture',
      'repaint',
      'draw on minecraft textures',
      'texture pack',
    ],
  },
  wishlist: {
    title: 'Wishlist: what MCSuperMods could not make yet…',
    sentence: 'See and add the things MCSuperMods could not make yet.',
    words: ['wishlist', 'missing', 'feature request', 'request', 'cannot make'],
  },
  checkForUpdates: {
    title: 'Check for updates',
    sentence: 'Look now for a new release of MCSuperMods.',
    words: ['update', 'upgrade', 'new version', 'release', 'download'],
  },
  aiHelper: {
    title: 'Open AI helper',
    shortcut: 'Mod+Shift+A',
    sentence: 'Open the AI helper to ask questions or make changes.',
    words: ['ai', 'claude', 'assistant', 'chat', 'ask'],
  },
  aiExplainProblem: {
    title: 'Explain this problem with the AI helper',
    sentence: 'Ask the AI helper what the selected problem means and how to fix it.',
    words: ['explain', 'error', 'problem', 'fix', 'ai', 'why'],
  },
  aiAskElement: {
    title: 'Ask the AI helper about this element',
    sentence: 'Ask the AI helper about the selected thing.',
    words: ['ask', 'ai', 'explain', 'question', 'claude'],
  },
  creator: {
    title: 'Create with the Creator…',
    sentence: 'Make a thing step by step by answering a few questions.',
    words: ['creator', 'make', 'create', 'wizard', 'flow', 'guided'],
  },
  surpriseMe: {
    title: 'Surprise me: make a random mod',
    sentence: 'Make a random mod to look at and play with.',
    words: ['random', 'surprise', 'dice', 'idea', 'inspire me'],
  },
  play: {
    title: 'Play: test the mod in Minecraft',
    shortcut: 'F5',
    sentence: 'Start Minecraft with the mod to play it.',
    words: ['play', 'launch', 'run', 'start game', 'test in game'],
  },
  reloadGame: {
    title: 'Reload the mod in the running game',
    shortcut: 'Mod+R',
    sentence: 'Send your latest changes to the game that is already running.',
    words: ['reload', 'refresh', 'hot reload', 'live update', 'apply changes'],
  },
  tryIt: {
    title: 'Try it: walk around your blocks and mobs in the app',
    shortcut: 'F6',
    sentence: 'Walk around a small world in the app with your blocks and mobs.',
    words: ['try it', 'preview', 'walk', 'sandbox', 'test world', '3d'],
  },
  home: {
    title: 'Home: my things and what I can make',
    sentence: 'Go back to Home with your things and what you can make.',
    words: ['home', 'start page', 'dashboard', 'my things', 'main'],
  },
  showcase: {
    title: 'Showcase: see what you can make',
    sentence: 'See moving examples of what you can make.',
    words: ['showcase', 'ideas', 'inspiration', 'gallery', 'what can i make'],
  },
  moreIdeas: {
    title: 'More ideas: endless mods you could make',
    sentence: 'Scroll through mod ideas one after another and make the one you like.',
    words: ['more ideas', 'ideas', 'endless', 'inspiration', 'random mod', 'browse', 'scroll'],
  },
  yourMods: {
    title: 'Your mods: open a mod you made',
    sentence: 'See the mods you made lately with their pictures, and open one.',
    words: ['your mods', 'my mods', 'all my mods', 'mod list', 'mods i made', 'recent'],
  },
  searchEverything: {
    title: 'Search everything…',
    shortcut: 'Mod+K',
    sentence: 'Find anything you can make, your things, Minecraft ids, settings and the guide.',
    words: ['search', 'find', 'look up', 'search bar', 'what can i make'],
  },
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
