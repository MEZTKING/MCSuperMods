/**
 * Block-state strings such as `minecraft:oak_stairs[facing=north,half=bottom]`: the form the
 * structure template JSON stores in `palette` and `final_state`, and the form Sponge
 * schematic palettes use as keys.
 */

/** A parsed block state: a namespaced block id and its properties. */
export interface BlockState {
  /** The block id, always namespaced (`minecraft:` is added when missing). */
  name: string;
  /** Property values by property name; empty when the state has none. */
  properties: Record<string, string>;
}

/** Thrown when a block-state string cannot be parsed. */
export class BlockStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockStateError';
  }
}

const ID = /^(?:[a-z0-9_.-]+:)?[a-z0-9_.\-/]+$/;
const PROPERTY = /^[a-z0-9_]+$/;
const VALUE = /^[a-z0-9_]+$/;

/**
 * Parses a block-state string. Whitespace around names and values is ignored.
 *
 * @param text - For example `oak_stairs[facing=north]` or `minecraft:stone`.
 * @returns The namespaced name and the properties.
 * @throws {@link BlockStateError} If the text is not a block state.
 */
export function parseBlockState(text: string): BlockState {
  const trimmed = text.trim();
  const open = trimmed.indexOf('[');
  const rawName = (open < 0 ? trimmed : trimmed.slice(0, open)).trim();
  if (!ID.test(rawName)) {
    throw new BlockStateError(`Invalid block state ${JSON.stringify(text)}: bad block id.`);
  }
  const name = rawName.includes(':') ? rawName : `minecraft:${rawName}`;
  const properties: Record<string, string> = {};
  if (open >= 0) {
    if (!trimmed.endsWith(']')) {
      throw new BlockStateError(`Invalid block state ${JSON.stringify(text)}: missing "]".`);
    }
    const body = trimmed.slice(open + 1, -1).trim();
    if (body !== '') {
      for (const pair of body.split(',')) {
        const eq = pair.indexOf('=');
        const key = (eq < 0 ? '' : pair.slice(0, eq)).trim();
        const value = (eq < 0 ? '' : pair.slice(eq + 1)).trim();
        if (!PROPERTY.test(key) || !VALUE.test(value) || Object.hasOwn(properties, key)) {
          throw new BlockStateError(
            `Invalid block state ${JSON.stringify(text)}: bad property ${JSON.stringify(pair)}.`,
          );
        }
        properties[key] = value;
      }
    }
  }
  return { name, properties };
}

/**
 * Prints a block state in canonical form: the namespaced name, then the properties sorted by
 * key in brackets, or no brackets when there are none.
 *
 * @param state - The block state.
 * @returns For example `minecraft:oak_stairs[facing=north,half=bottom]`.
 */
export function printBlockState(state: BlockState): string {
  const keys = Object.keys(state.properties).sort();
  if (keys.length === 0) return state.name;
  return `${state.name}[${keys.map((key) => `${key}=${state.properties[key]}`).join(',')}]`;
}

/**
 * The canonical form of a block-state string (see {@link printBlockState}).
 *
 * @throws {@link BlockStateError} If the text is not a block state.
 */
export function canonicalBlockState(text: string): string {
  return printBlockState(parseBlockState(text));
}
