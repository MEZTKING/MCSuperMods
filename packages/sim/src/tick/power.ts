/**
 * The Power tool (B391, ADR 0085 L6): toggles a block's own `powered` property, or its `lit`
 * property when it has no `powered` one, so its powered or lit picture shows. No signal
 * travels: neighbours, dust, doors and lamps nearby do not react. A block with neither
 * property gets an "Only in Minecraft" line.
 */
import type { BlockCatalogue } from '../blocks/catalogue.js';
import type { BlockPos, SimLog } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import type { ToolResult } from './growth.js';

/** The id of the Power tool in a `tool` action. */
export const POWER_TOOL = 'power';

/** The properties the Power tool toggles, in the order it looks for them. */
export const POWER_PROPERTIES: readonly string[] = Object.freeze(['powered', 'lit']);

const NOTHING: ToolResult = Object.freeze({ changed: false, changes: Object.freeze([]) });

/** Uses the Power tool on a block, writing one log line. */
export function powerBlock(
  world: SimWorld,
  catalogue: BlockCatalogue,
  log: SimLog,
  pos: BlockPos,
): ToolResult {
  const state = world.get(pos);
  if (state === null) {
    log.info('There is no block here to power');
    return NOTHING;
  }
  const block = catalogue.blockFor(state.name);
  const name = block?.displayName ?? state.name;
  const origin = block?.origin;
  const property = POWER_PROPERTIES.find(
    (one) =>
      block?.properties[one]?.includes('true') === true &&
      block.properties[one]?.includes('false') === true,
  );
  if (block === undefined || property === undefined) {
    log.onlyInMinecraft(
      `${name} has no powered or lit picture; what a redstone signal does to it shows only in the game`,
      origin,
    );
    return NOTHING;
  }
  const on = state.properties[property] !== 'true';
  const next = catalogue.withProperties(state, { [property]: String(on) });
  if (!world.set(pos, next)) return NOTHING;
  log.info(
    `${name} is ${on ? 'now' : 'no longer'} ${property === 'lit' ? 'lit' : 'powered'}`,
    origin,
  );
  return { changed: true, changes: [{ pos, state: world.get(pos) }] };
}
