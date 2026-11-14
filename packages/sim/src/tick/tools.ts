/**
 * The Try it tools by id (B391), for a `tool` action (`{ type: 'tool', tool, pos }`): the view
 * sends the id, the world source calls {@link applyTool}.
 */
import type { BlockCatalogue } from '../blocks/catalogue.js';
import type { BlockPos, SimLog } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import { GROW_TOOL, growBlock, type ToolResult } from './growth.js';
import { POWER_TOOL, powerBlock } from './power.js';

/** The tools the simulation knows, by id, with their labels in plain words. */
export const SIM_TOOLS: readonly { readonly id: string; readonly label: string }[] = Object.freeze([
  Object.freeze({ id: GROW_TOOL, label: 'Grow' }),
  Object.freeze({ id: POWER_TOOL, label: 'Power' }),
]);

/** Uses a tool on the block at a position; an unknown id writes a log line and does nothing. */
export function applyTool(
  world: SimWorld,
  catalogue: BlockCatalogue,
  log: SimLog,
  tool: string,
  pos: BlockPos,
): ToolResult {
  switch (tool) {
    case GROW_TOOL:
      return growBlock(world, catalogue, log, pos);
    case POWER_TOOL:
      return powerBlock(world, catalogue, log, pos);
    default:
      log.info(`There is no tool called "${tool}"`);
      return { changed: false, changes: [] };
  }
}
