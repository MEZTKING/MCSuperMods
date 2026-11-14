/**
 * The Grow tool (B391, ADR 0085 L9): steps a crop's `age` or a sapling's `stage` to the next
 * value. Nothing grows by itself: there are no random ticks and no light rules, and leaves do
 * not decay. A sapling at its last stage would become a tree in the game; here it stays a
 * sapling and says so.
 */
import type { BlockCatalogue } from '../blocks/catalogue.js';
import type { BlockChange } from '../blocks/neighbours.js';
import type { BlockPos, SimLog } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';

/** The id of the Grow tool in a `tool` action. */
export const GROW_TOOL = 'grow';

/** What a tool did to the world. */
export interface ToolResult {
  /** True when the block changed. */
  readonly changed: boolean;
  /** Every block set, in order. */
  readonly changes: readonly BlockChange[];
}

const NOTHING: ToolResult = Object.freeze({ changed: false, changes: Object.freeze([]) });

/** The next value of a numbered property, or `undefined` at its last value. */
function nextValue(values: readonly string[] | undefined, current: string | undefined) {
  if (values === undefined || current === undefined) return undefined;
  const at = values.indexOf(current);
  return at >= 0 && at < values.length - 1 ? values[at + 1] : undefined;
}

/**
 * Uses the Grow tool on a block: a crop goes one age up, a sapling one stage up. Writes one log
 * line for anything else, and an "Only in Minecraft" line for a sapling at its last stage or a
 * vanilla prop.
 */
export function growBlock(
  world: SimWorld,
  catalogue: BlockCatalogue,
  log: SimLog,
  pos: BlockPos,
): ToolResult {
  const state = world.get(pos);
  if (state === null) {
    log.info('There is no block here to grow');
    return NOTHING;
  }
  const block = catalogue.blockFor(state.name);
  if (block === undefined) {
    log.onlyInMinecraft(`${state.name} is not in the project; how it grows shows only in the game`);
    return NOTHING;
  }
  const name = block.displayName;
  const origin = block.origin;
  if (block.type === 'prop') {
    log.onlyInMinecraft(`${name} grows only by the game's own rules`, origin);
    return NOTHING;
  }
  if (block.type !== 'crop' && block.type !== 'sapling') {
    log.info(`${name} does not grow`, origin);
    return NOTHING;
  }
  const property = block.type === 'crop' ? 'age' : 'stage';
  const next = nextValue(block.properties[property], state.properties[property]);
  if (next === undefined) {
    if (block.type === 'crop') log.info(`${name} is fully grown`, origin);
    else log.onlyInMinecraft(`${name} grows into a tree`, origin);
    return NOTHING;
  }
  const grown = catalogue.withProperties(state, { [property]: next });
  if (!world.set(pos, grown)) return NOTHING;
  log.info(
    block.type === 'crop'
      ? `${name} grew to stage ${Number(next) + 1} of ${(block.maxAge ?? 0) + 1}`
      : `${name} grew; one more Grow makes a tree in the game`,
    origin,
  );
  return { changed: true, changes: [{ pos, state: world.get(pos) }] };
}
