/**
 * Structure template element data (`minecraft:structure_template`, ADR 0021) read for the 3D
 * preview: `size`, `palette` (block-state strings) and `blocks` (`[x, y, z, paletteIndex]`).
 *
 * The app may not import plugin internals, so this is a second, deliberately small reader of
 * the same JSON shape `@msm/plugin-structures` defines. It never throws: palette entries that
 * do not parse and block tuples that are malformed, out of bounds or point at a bad palette
 * entry are counted and skipped. Block entities, jigsaws and entities are not read.
 */

import { Structure } from 'deepslate/core';

/** A parsed block state: a namespaced block id and its properties. */
export interface ParsedBlockState {
  /** The block id, always namespaced (`minecraft:` is added when missing). */
  name: string;
  /** Property values by property name, in the order they were written. */
  properties: Record<string, string>;
}

const ID = /^(?:[a-z0-9_.-]+:)?[a-z0-9_.\-/]+$/;
const TOKEN = /^[a-z0-9_]+$/;

/**
 * Parses a block-state string such as `minecraft:oak_stairs[facing=north,half=bottom]` or
 * `stone`. Whitespace around names and values is ignored.
 *
 * @returns The state, or `null` when the text is not a block state.
 */
export function parseBlockState(text: string): ParsedBlockState | null {
  const trimmed = text.trim();
  const open = trimmed.indexOf('[');
  const rawName = (open < 0 ? trimmed : trimmed.slice(0, open)).trim();
  if (!ID.test(rawName)) return null;
  const name = rawName.includes(':') ? rawName : `minecraft:${rawName}`;
  const properties: Record<string, string> = {};
  if (open < 0) return { name, properties };
  if (!trimmed.endsWith(']')) return null;
  const body = trimmed.slice(open + 1, -1).trim();
  if (body === '') return { name, properties };
  for (const pair of body.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 0) return null;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!TOKEN.test(key) || !TOKEN.test(value) || Object.hasOwn(properties, key)) return null;
    properties[key] = value;
  }
  return { name, properties };
}

/**
 * Block ids that render nothing and are left out of the preview structure. Structure void is
 * not stored at all (absent positions are void).
 */
const INVISIBLE_BLOCKS: ReadonlySet<string> = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
  'minecraft:structure_void',
]);

/** The result of {@link structureFromTemplate}. */
export interface TemplateStructure {
  structure: Structure;
  /** The template size `[x, y, z]`, each axis at least 1. */
  size: [number, number, number];
  /** Distinct block ids placed in the structure, sorted. */
  blockIds: string[];
  /** Blocks placed (air-like blocks excluded). */
  blockCount: number;
  /** Palette entries that are not block-state strings, in palette order. */
  invalidPalette: string[];
  /** Block tuples skipped: malformed, outside the size, or pointing at a bad palette entry. */
  skippedBlocks: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

function readSize(value: unknown): [number, number, number] {
  const axes = Array.isArray(value) ? value : [];
  const axis = (i: number): number => {
    const n = axes[i];
    return isInt(n) && n > 0 ? n : 1;
  };
  return [axis(0), axis(1), axis(2)];
}

/**
 * Builds a deepslate {@link Structure} from structure template element data.
 *
 * @param data - The element data; anything that is not a template gives an empty 1×1×1 one.
 */
export function structureFromTemplate(data: unknown): TemplateStructure {
  const template = isObject(data) ? data : {};
  const size = readSize(template.size);
  const rawPalette = Array.isArray(template.palette) ? template.palette : [];
  const invalidPalette: string[] = [];
  const palette = rawPalette.map((entry): ParsedBlockState | null => {
    const parsed = typeof entry === 'string' ? parseBlockState(entry) : null;
    if (parsed === null) invalidPalette.push(typeof entry === 'string' ? entry : String(entry));
    return parsed;
  });
  const structure = new Structure(size);
  const ids = new Set<string>();
  const occupied = new Set<string>();
  let blockCount = 0;
  let skippedBlocks = 0;
  for (const tuple of Array.isArray(template.blocks) ? template.blocks : []) {
    if (!Array.isArray(tuple) || tuple.length !== 4 || !tuple.every(isInt)) {
      skippedBlocks += 1;
      continue;
    }
    const [x, y, z, index] = tuple as [number, number, number, number];
    const state = palette[index];
    const inside = x >= 0 && y >= 0 && z >= 0 && x < size[0] && y < size[1] && z < size[2];
    const key = `${x},${y},${z}`;
    if (!inside || state === undefined || state === null || occupied.has(key)) {
      skippedBlocks += 1;
      continue;
    }
    occupied.add(key);
    if (INVISIBLE_BLOCKS.has(state.name)) continue;
    structure.addBlock([x, y, z], state.name, { ...state.properties });
    ids.add(state.name);
    blockCount += 1;
  }
  return {
    structure,
    size,
    blockIds: [...ids].sort(),
    blockCount,
    invalidPalette,
    skippedBlocks,
  };
}
