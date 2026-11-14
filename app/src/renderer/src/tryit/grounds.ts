/**
 * Try it's grounds (ADR 0087 D1, B405), the app side: what the user chose, the blocks it makes
 * (through `@msm/sim`'s pure generators, or from a world area main read), the user's own Quick
 * world presets and the plain words the picker shows.
 *
 * The user's presets are kept in the renderer's local storage beside the app's other view
 * preferences (`store/preferences.ts`): per user of this computer, never in the project.
 */

import {
  flatGround,
  type GroundBlocks,
  type GroundKind,
  normaliseQuickOptions,
  QUICK_PRESETS,
  type QuickWorldOptions,
  quickWorld,
} from '@msm/sim';
import { create } from 'zustand';
import type { TryItAreaCentre, TryItWorldArea, TryItWorldInfo } from '../../../shared/platform';

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
    };

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
  }
}

/** The blocks of a ground that needs nothing from main (`world` needs {@link worldGround}). */
export function groundBlocksFor(
  choice: Exclude<GroundChoice, { kind: 'world' }>,
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
