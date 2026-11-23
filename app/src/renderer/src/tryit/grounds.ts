/**
 * Try it's grounds (ADR 0087 D1, B405), the app side: what the user chose, the blocks it makes
 * (through `@msm/sim`'s pure generators, or from a world area main read), the user's own Quick
 * world presets and the plain words the picker shows.
 *
 * B584 adds "My world generation" (ADR 0119 D8): the worlds of the project a ground can be cut
 * from ({@link generatedSources}), the side panel's words, and the notes that say what the
 * ground draws only about right and what it leaves out (limits WL3 to WL5, WL8, WL15 to WL17).
 * The land itself is made in the terrain worker (`session-source.ts` `GeneratedGround`).
 *
 * B558 adds the games grounds (ADR 0117 D4): "Empty sky" (`void`: the world setup's start
 * structure in empty sky, the player on it holding the kit) and "One of my buildings"
 * (`structure`: a project structure template as the ground), made by `@msm/sim`'s
 * `voidGamesGround` and `structureGamesGround` from {@link gamesProjectOf}.
 *
 * The user's presets are kept in the renderer's local storage beside the app's other view
 * preferences (`store/preferences.ts`): per user of this computer, never in the project.
 */

import type { Project } from '@msm/plugin-api';
import {
  AREA_KIND,
  flatGround,
  type GamesElement,
  type GamesGroundMade,
  type GamesProject,
  type GroundBlocks,
  type GroundKind,
  idWords,
  normaliseQuickOptions,
  OBJECTIVE_KIND,
  ONE_BLOCK_KIND,
  QUICK_PRESETS,
  type QuickWorldOptions,
  quickWorld,
  readTemplate,
  type StructureTemplateBlocks,
  structureGamesGround,
  TEAM_KIND,
  TIMER_KIND,
  voidGamesGround,
  WORLD_SETUP_KIND,
} from '@msm/sim';
import { create } from 'zustand';
import type { TryItAreaCentre, TryItWorldArea, TryItWorldInfo } from '../../../shared/platform';
import { thingWords } from '../components/thing-picker/thing-sources';
import { useUiStore } from '../store/ui-store';
import type { TerrainFacts, TerrainSource, Unsupported, WorldSummary } from '../terrain/client';
import { presetDimensions, withNamespace } from '../terrain/hosts';

/** What the user chose. */
export type GroundChoice =
  | { readonly kind: 'grid' }
  | { readonly kind: 'flat' }
  | { readonly kind: 'quick'; readonly options: QuickWorldOptions; readonly preset?: string }
  | {
      readonly kind: 'world';
      readonly worldId: string;
      readonly worldName: string;
      readonly centre: TryItAreaCentre;
    }
  | {
      readonly kind: 'generated';
      /** The world the land comes from. */
      readonly world: GeneratedSourceChoice;
      /** The seed as typed (shared with the world map, `terrain/view-store.ts`). */
      readonly seed: string;
      /** The block the window is centred on. */
      readonly centre: { readonly x: number; readonly z: number };
    }
  | { readonly kind: 'void' }
  | {
      readonly kind: 'structure';
      /** The structure template's id. */
      readonly structure: string;
    };

/** One world of the project a generated ground can be cut from. */
export interface GeneratedSourceChoice {
  /** Stable key (picker and storage). */
  readonly key: string;
  /** What the picker shows: plain words (no ids, ADR 0083 D7). */
  readonly label: string;
  /** The ids it comes from (the picker's tooltip). */
  readonly ids: string;
  /** The element that makes it (the dimension or the world preset), for Show on the map. */
  readonly elementId: string;
  readonly source: TerrainSource;
}

/** The grounds' names and one line each, in the picker's order. */
export const GROUND_CHOICES: readonly { kind: GroundKind; label: string; line: string }[] = [
  { kind: 'grid', label: 'Grid', line: 'MSM’s own floor: nothing in the way of your blocks.' },
  {
    kind: 'flat',
    label: 'Flat world',
    line: 'Bedrock, two dirt and grass, like a superflat world.',
  },
  {
    kind: 'quick',
    label: 'Quick world',
    line: 'A small landscape you set up: hills, an island or a valley, layers, water and trees.',
  },
  {
    kind: 'world',
    label: 'From my world',
    line: 'An area copied from one of your own saves. Your save is only read, never changed.',
  },
  {
    kind: 'generated',
    label: 'My world generation',
    line: 'The land your own world makes, around where you stand.',
  },
  {
    kind: 'void',
    label: 'Empty sky',
    line: 'Your game’s start island in empty sky, holding what new players get.',
  },
  {
    kind: 'structure',
    label: 'One of my buildings',
    line: 'One of your project’s structures as the ground, where your game puts it.',
  },
];

/** The label of a ground kind. */
export function groundLabel(kind: GroundKind): string {
  return GROUND_CHOICES.find((choice) => choice.kind === kind)?.label ?? kind;
}

/** The shapes' labels. */
export const SHAPE_LABELS: Readonly<Record<QuickWorldOptions['shape'], string>> = {
  flat: 'Flat',
  hills: 'Gentle hills',
  island: 'Island in water',
  valley: 'Valley',
};

/** The tree settings' labels. */
export const TREE_LABELS: Readonly<Record<QuickWorldOptions['trees'], string>> = {
  none: 'None',
  few: 'A few',
  many: 'Many',
};

/** A short description of a choice, for the side panel. */
export function describeGround(choice: GroundChoice): string {
  switch (choice.kind) {
    case 'grid':
    case 'flat':
      return groundLabel(choice.kind);
    case 'quick':
      return `Quick world: ${choice.preset ?? SHAPE_LABELS[choice.options.shape]}, seed ${choice.options.seed}`;
    case 'world': {
      const where =
        choice.centre === 'spawn'
          ? 'around the spawn'
          : `around X ${choice.centre.x}, Z ${choice.centre.z}`;
      return `${choice.worldName}, ${where}`;
    }
    case 'generated':
      return `${choice.world.label}, seed ${choice.seed}`;
    case 'void':
      return 'Empty sky';
    case 'structure':
      return `${idWords(choice.structure)}`;
  }
}

/** The blocks of a ground that needs nothing from main (`world` needs {@link worldGround}). */
export function groundBlocksFor(
  choice: Exclude<GroundChoice, { kind: 'world' | 'generated' | 'void' | 'structure' }>,
): GroundBlocks | undefined {
  switch (choice.kind) {
    case 'grid':
      return undefined;
    case 'flat':
      return flatGround();
    case 'quick':
      return quickWorld(choice.options);
  }
}

/** A world area main read, as a ground. */
export function worldGround(area: TryItWorldArea): GroundBlocks {
  return { size: area.size, palette: area.palette, blocks: area.blocks };
}

// ---- The games grounds (B558) ------------------------------------------------------------------

const GAMES_KINDS: ReadonlySet<string> = new Set([
  WORLD_SETUP_KIND,
  ONE_BLOCK_KIND,
  TEAM_KIND,
  OBJECTIVE_KIND,
  TIMER_KIND,
  AREA_KIND,
]);

const STRUCTURE_TEMPLATE_KIND = 'minecraft:structure_template';

/** Whether a project has any games element (Try it then loads its games side panel). */
export function projectHasGames(project: Project | null | undefined): boolean {
  return (
    project?.namespaces?.some((namespace) =>
      (namespace.elements ?? []).some((element) => GAMES_KINDS.has(element.kind)),
    ) ?? false
  );
}

/** The project's games elements and structure templates, as `@msm/sim` reads them. */
export function gamesProjectOf(project: Project | null | undefined): GamesProject {
  const elements: GamesElement[] = [];
  const templates = new Map<string, StructureTemplateBlocks>();
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements ?? []) {
      if (GAMES_KINDS.has(element.kind)) {
        elements.push({ id: element.id, kind: element.kind, data: element.data });
      } else if (element.kind === STRUCTURE_TEMPLATE_KIND) {
        const template = readTemplate(element.data);
        if (template !== undefined) templates.set(element.id, template);
      }
    }
  }
  return { elements, templates };
}

/** The project's buildings the structure ground offers, in plain words. */
export function groundBuildings(games: GamesProject): { id: string; label: string }[] {
  return [...games.templates.keys()].sort().map((id) => ({ id, label: idWords(id) }));
}

/** Words for the void ground's tab: what it will show for this project. */
export function voidGroundWords(games: GamesProject): string {
  const setup = games.elements.find((element) => element.kind === WORLD_SETUP_KIND);
  if (setup === undefined) {
    return 'Your project has no world setup yet ("How my world starts"): the sky will be empty.';
  }
  return 'Your start island floats in the middle; you stand where new players start, holding what they get. The magic block, timers and areas work as your game’s functions run them.';
}

/** The ground and plan of a games choice, or the reason it cannot be made. */
export function gamesGroundFor(
  choice: Extract<GroundChoice, { kind: 'void' | 'structure' }>,
  games: GamesProject,
): GamesGroundMade | string {
  if (choice.kind === 'void') return voidGamesGround(games);
  return (
    structureGamesGround(games, choice.structure) ??
    'That building is no longer in your project. Choose another.'
  );
}

/** An outline the view draws: boxes in block units from `pos` (`render/camera.ts`'s shape). */
export interface OutlineBoxes {
  readonly pos: { readonly x: number; readonly y: number; readonly z: number };
  readonly boxes: readonly (readonly [number, number, number, number, number, number])[];
}

/**
 * The picked block's outline with the games areas' boxes added (B558), so the view draws both
 * in one pass; either may be `null`.
 */
export function withAreaOutline(
  picked: OutlineBoxes | null,
  areas: OutlineBoxes | null,
): OutlineBoxes | null {
  if (areas === null) return picked;
  if (picked === null) return areas;
  const dx = areas.pos.x - picked.pos.x;
  const dy = areas.pos.y - picked.pos.y;
  const dz = areas.pos.z - picked.pos.z;
  return {
    pos: picked.pos,
    boxes: [
      ...picked.boxes,
      ...areas.boxes.map(
        ([x0, y0, z0, x1, y1, z1]) =>
          [x0 + dx, y0 + dy, z0 + dz, x1 + dx, y1 + dy, z1 + dz] as const,
      ),
    ],
  };
}

/** The line "What happened" gets when a world area is in. */
export function worldAreaLine(area: TryItWorldArea): string {
  const x = area.origin.x;
  const z = area.origin.z;
  return `Copied an area of ${area.world}: X ${x} to ${x + area.size.x - 1}, Z ${z} to ${z + area.size.z - 1}, heights ${area.origin.y} to ${area.origin.y + area.size.y - 1}.`;
}

/**
 * The plain sentence of a failed world read: main rejects with `tryit.<code>: <sentence>`
 * (ADR 0087 D7), which IPC wraps in its own words.
 */
export function worldErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const match = /tryit\.[a-z-]+: (.*)$/s.exec(text);
  return (match?.[1] ?? text).trim();
}

/** Why a world cannot be read, in plain words (`readable: false`). */
export function unreadableReason(world: TryItWorldInfo): string {
  if (world.dataVersion === null) return 'Its level.dat cannot be read.';
  return `Saved by Minecraft ${world.versionName ?? 'before 1.18'}. Open it once in Minecraft 1.18 or later.`;
}

/** A centre typed into the picker, or the reason it cannot be used. */
export function parseCentre(x: string, z: string): { x: number; z: number } | string {
  const values = [x, z].map((text) => Number(text.trim()));
  if (
    [x, z].some((text) => text.trim() === '') ||
    values.some((value) => !Number.isInteger(value))
  ) {
    return 'Type whole numbers for X and Z.';
  }
  if (values.some((value) => Math.abs(value) > 30_000_000)) {
    return 'X and Z must be within 30,000,000 of the middle of the world.';
  }
  return { x: values[0] as number, z: values[1] as number };
}

/** A new seed for "New seed" (any whole number the generators take). */
export function newSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 1_000_000);
}

// ---- The user's presets ------------------------------------------------------------------------

/** One of the user's own Quick world presets. */
export interface UserGroundPreset {
  readonly name: string;
  readonly options: QuickWorldOptions;
}

const PRESETS_KEY = 'msm.tryit.groundPresets.v1';
/** The most presets kept. */
export const USER_PRESET_LIMIT = 20;

function readPresets(): UserGroundPreset[] {
  try {
    const text = globalThis.localStorage?.getItem(PRESETS_KEY);
    if (text === null || text === undefined) return [];
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const { name, options } = entry as { name?: unknown; options?: unknown };
      if (typeof name !== 'string' || name.trim() === '' || typeof options !== 'object') return [];
      return [{ name: name.trim(), options: normaliseQuickOptions(options ?? {}) }];
    });
  } catch {
    return [];
  }
}

function writePresets(presets: readonly UserGroundPreset[]): void {
  try {
    globalThis.localStorage?.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Storage is unavailable: the presets last for this run only.
  }
}

/** The user's presets store. */
export interface GroundPresetsState {
  presets: readonly UserGroundPreset[];
  /** Saves (or replaces, by name) a preset. */
  save(name: string, options: QuickWorldOptions): void;
  remove(name: string): void;
  /** Reads storage again (tests). */
  reload(): void;
}

export const useGroundPresets = create<GroundPresetsState>((set, get) => ({
  presets: readPresets(),
  save(name, options) {
    const trimmed = name.trim();
    if (trimmed === '') return;
    const others = get().presets.filter((preset) => preset.name !== trimmed);
    const presets = [...others, { name: trimmed, options: normaliseQuickOptions(options) }].slice(
      -USER_PRESET_LIMIT,
    );
    set({ presets });
    writePresets(presets);
  },
  remove(name) {
    const presets = get().presets.filter((preset) => preset.name !== name);
    set({ presets });
    writePresets(presets);
  },
  reload() {
    set({ presets: readPresets() });
  },
}));

/** The options of the first built-in preset (Classic flat). */
export const DEFAULT_QUICK_OPTIONS: QuickWorldOptions = (
  QUICK_PRESETS[0] as (typeof QUICK_PRESETS)[number]
).options;

// ---- My world generation (B584) ----------------------------------------------------------------

/** The kinds whose elements make a world (a project dimension, a world preset). */
export const DIMENSION_KIND = 'minecraft:dimension';
export const WORLD_PRESET_KIND = 'minecraft:worldgen/world_preset';

/** The project's worlds a generated ground can be cut from: dimensions, then each preset's. */
export function generatedSources(project: Project | null): GeneratedSourceChoice[] {
  const dimensions: GeneratedSourceChoice[] = [];
  const presets: GeneratedSourceChoice[] = [];
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements ?? []) {
      const id = withNamespace(element.id);
      if (element.kind === DIMENSION_KIND) {
        dimensions.push({
          key: `dimension:${id}`,
          label: thingWords(id),
          ids: id,
          elementId: element.id,
          source: { dimension: id },
        });
      } else if (element.kind === WORLD_PRESET_KIND) {
        for (const dimension of presetDimensions(element.data)) {
          presets.push({
            key: `preset:${id}:${dimension}`,
            label: `${thingWords(withNamespace(dimension))} of ${thingWords(id)}`,
            ids: `${withNamespace(dimension)} of ${id}`,
            elementId: element.id,
            source: { preset: id, dimension },
          });
        }
      }
    }
  }
  return [...dimensions, ...presets];
}

/**
 * The element last open in the editor. Opening Try it clears the selection, so the last one
 * chosen is kept here from the moment this module loads (the first time Try it opens); before
 * that the picker starts on the project's first world.
 */
let lastOpenElement: string | null = useUiStore.getState().selectedId;
useUiStore.subscribe((state) => {
  if (state.selectedId !== null) lastOpenElement = state.selectedId;
});

/** The element last open in the editor (see {@link lastOpenElement}), or `null`. */
export function lastOpenElementId(): string | null {
  return lastOpenElement;
}

/**
 * The world the picker starts on: the one the element open in the editor makes (a dimension, or
 * a preset's first dimension), else the first; `null` when the project has none.
 */
export function defaultGeneratedSource(
  sources: readonly GeneratedSourceChoice[],
  openElementId: string | null,
): GeneratedSourceChoice | null {
  if (openElementId !== null) {
    const open = sources.find((source) => source.elementId === openElementId);
    if (open !== undefined) return open;
  }
  return sources[0] ?? null;
}

/** The picker's line when the project has no world to cut a ground from. */
export const NO_GENERATED_SOURCE =
  'Your project has no dimension or world type yet. Make one (Make a world, or the Dimension flow) and it shows here.';

/** The picker's line when this window cannot make land (no project session to read it from). */
export const NO_GENERATED_HERE = 'The land cannot be made in this window.';

/** The ground's side panel words (plan, "Very easy wording"). */
export const GENERATED_WORDS = {
  moveUp: 'Move up',
  moveDown: 'Move down',
  aroundMe: 'Make the land around me',
  showOnMap: 'Show on the map',
  aboutRight: 'Trees, plants and ores are about right here; the game places them exactly.',
  carved: 'Carved caves and buildings show only in the game.',
  shaped: 'Land the game shapes around buildings is not drawn either.',
  end: 'The End is about right here.',
  borders: 'Biome borders are about right on this version.',
  biomes:
    "Vanilla's biomes show here after you have pressed Play once. Until then the land has one biome.",
  cut: 'The land goes higher than this window: Move up to see the top.',
  debug: 'Debug worlds are only in the game.',
  strip: 'The land is a preview worked out from your files.',
} as const;

/** The stages' words while the land arrives. */
export const STAGE_WORDS = {
  terrain: 'Making the land…',
  surface: 'Laying the surface…',
  features: 'Placing trees, plants and ores…',
} as const;

/** Unsupported parts of one type and outcome together (the map's `groupUnsupported`). */
function grouped(parts: readonly Unsupported[]): { part: Unsupported; more: number }[] {
  const groups = new Map<string, { part: Unsupported; more: number }>();
  for (const part of parts) {
    const key = `${part.kind} ${part.type} ${part.drawnInstead}`;
    const known = groups.get(key);
    if (known === undefined) groups.set(key, { part, more: 0 });
    else known.more += 1;
  }
  return [...groups.values()];
}

/** One part the ground could not work out, in plain words (as the map words it). */
function partLine(part: Unsupported, more: number): string {
  if (part.kind === 'feature' && part.where === 'features') return part.drawnInstead;
  const type = part.type.startsWith('minecraft:')
    ? part.type.slice('minecraft:'.length)
    : part.type;
  const where =
    more === 0 ? part.where : `${part.where} and ${more} more ${more === 1 ? 'place' : 'places'}`;
  if (part.kind === 'file') return `${type} is missing (named in ${where}). ${part.drawnInstead}`;
  return `This world uses ${type} (in ${where}), which the preview cannot work out yet. ${part.drawnInstead}`;
}

/** What {@link generatedNotes} reads. */
export interface GeneratedNotesInput {
  readonly facts: TerrainFacts;
  readonly summary: WorldSummary | null;
  /** The world is the End (by id or biome source). */
  readonly end: boolean;
  /** The world places its biomes by climate (`multi_noise`). */
  readonly climate: boolean;
  /** The columns' own notes (the features stage's "about right" and left-out types). */
  readonly columnNotes: readonly Unsupported[];
  /** Land reaches the window's top layer (WL8). */
  readonly cutAtTop: boolean;
  /** Project files that could not be read. */
  readonly problems: readonly { readonly elementId: string; readonly message: string }[];
}

/**
 * The ground's notes: the "about right" line always (B583), what is left out (WL4, WL5, WL15),
 * the target's approximate parts (WL16, WL17), a cut top (WL8) and every part the engine could
 * not work out, grouped by type.
 */
export function generatedNotes(input: GeneratedNotesInput): string[] {
  const lines: string[] = [
    GENERATED_WORDS.aboutRight,
    GENERATED_WORDS.carved,
    GENERATED_WORDS.shaped,
  ];
  if (input.summary?.generator === 'debug') lines.push(GENERATED_WORDS.debug);
  if (input.end && input.facts.approximate.includes('end')) lines.push(GENERATED_WORDS.end);
  if (!input.end && input.climate && input.facts.approximate.includes('biome_layout')) {
    lines.push(GENERATED_WORDS.borders);
  }
  if (input.summary !== null && !input.summary.biomesKnown) lines.push(GENERATED_WORDS.biomes);
  if (input.cutAtTop) lines.push(GENERATED_WORDS.cut);
  const parts = [...(input.summary?.unsupported ?? []), ...input.columnNotes].filter(
    (part) => part.type !== 'about_right',
  );
  for (const group of grouped(parts)) lines.push(partLine(group.part, group.more));
  for (const problem of input.problems) {
    lines.push(`${problem.elementId} could not be read, so it is left out: ${problem.message}`);
  }
  return [...new Set(lines)];
}

/** The strip's line for a generated ground: the Preview words and the target's labels. */
export function generatedStripLine(notes: readonly string[]): string {
  const labels = notes.filter(
    (line) => line === GENERATED_WORDS.end || line === GENERATED_WORDS.borders,
  );
  return [GENERATED_WORDS.strip, ...labels].join(' ');
}

/** The view store's key of a project (as the world map keys it). */
export function terrainViewKey(root: string | null, project: Project | null): string {
  return root ?? `unsaved:${project?.name ?? ''}`;
}
