/**
 * The Try it tools by id (B391), for a `tool` action (`{ type: 'tool', tool, pos }`): the view
 * sends the id, the world source calls {@link applyTool}.
 */
import type { BlockCatalogue } from '../blocks/catalogue.js';
import { EXPLODE_TOOL, WATER_TOOL, waterBlock } from '../blocks/types2/tools.js';
import { LIGHTNING_TOOL, strikeLightning } from '../blocks/types3/lightning.js';
import type { BlockPos, SimLog } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import { GROW_TOOL, growBlock, type ToolResult } from './growth.js';
import { POWER_TOOL, powerBlock } from './power.js';

/** The tools the simulation knows, by id, with their labels in plain words. */
export const SIM_TOOLS: readonly { readonly id: string; readonly label: string }[] = Object.freeze([
  Object.freeze({ id: GROW_TOOL, label: 'Grow' }),
  Object.freeze({ id: POWER_TOOL, label: 'Power' }),
  // B463: water in a block (the waterlogged look) and an explosion (the explosion rules).
  Object.freeze({ id: WATER_TOOL, label: 'Water' }),
  Object.freeze({ id: EXPLODE_TOOL, label: 'Explode' }),
  // B519: a bolt that scrapes weathering blocks (ADR 0104 D2).
  Object.freeze({ id: LIGHTNING_TOOL, label: 'Lightning' }),
]);

/**
 * Uses a tool on the block at a position; an unknown id writes a log line and does nothing.
 * `random` draws what the game leaves to chance (bone meal counts, the bolt's walks).
 */
export function applyTool(
  world: SimWorld,
  catalogue: BlockCatalogue,
  log: SimLog,
  tool: string,
  pos: BlockPos,
  random: () => number = () => 0,
): ToolResult {
  switch (tool) {
    case GROW_TOOL:
      return growBlock(world, catalogue, log, pos, random);
    case LIGHTNING_TOOL: {
      const state = world.get(pos);
      const name =
        state === null ? 'the floor' : (catalogue.blockFor(state.name)?.displayName ?? state.name);
      const result = strikeLightning(world, catalogue, pos, random);
      log.info(`Lightning struck ${name}.`);
      if (result.struck !== undefined) {
        const to = catalogue.blockFor(result.struck.to)?.displayName ?? result.struck.to;
        log.info(`${name} went back to ${to}.`);
      }
      log.info(
        result.scraped === 0
          ? 'No block nearby was scraped.'
          : `${result.scraped} block${result.scraped === 1 ? ' nearby was' : 's nearby were'} scraped one stage back.`,
      );
      log.onlyInMinecraft(
        "a bolt's fire, damage, thunder and what it does to mobs and vanilla copper (the preview shows only how it scrapes blocks that age)",
      );
      return { changed: result.changes.length > 0, changes: result.changes };
    }
    case POWER_TOOL:
      return powerBlock(world, catalogue, log, pos);
    case WATER_TOOL: {
      const result = waterBlock(world, catalogue, pos);
      log.info(result.message);
      return { changed: result.changed, changes: result.changes };
    }
    default:
      log.info(`There is no tool called "${tool}"`);
      return { changed: false, changes: [] };
  }
}
