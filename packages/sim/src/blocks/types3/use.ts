/**
 * Using the five types of ADR 0103 by hand (B519), as the runtime does it (B510, B509 notes):
 *
 * - an empty project pot takes a plant it lists (or a `potted_plant` naming the pot) from the hand
 *   and becomes that potted block; any other item does nothing;
 * - a potted block (a pot's companion, or a `potted_plant` in a project pot) gives its plant back
 *   to the hand and leaves the empty pot, whatever the hand holds;
 * - a strand block with berries gives one berry item and loses them (empty hand only).
 *
 * Every other block of the five types does nothing by hand, so the click goes on to the item.
 */
import type { BlockPos, BlockState } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from '../catalogue.js';
import type { BlockChange } from '../neighbours.js';

/** What using one of the five types did. */
export interface Types3UseResult {
  readonly handled: boolean;
  readonly changes: readonly BlockChange[];
  readonly message?: string;
  readonly onlyInMinecraft?: string;
  /** Items the player gets (a plant, berries). */
  readonly give?: { readonly id: string; readonly count: number };
}

const NOT_TAKEN: Types3UseResult = Object.freeze({ handled: false, changes: Object.freeze([]) });

/** Uses a block of the five types (or a potted plant in a project pot) by hand. */
export function useType3(
  world: SimWorld,
  catalogue: BlockCatalogue,
  block: CatalogueBlock,
  state: BlockState,
  pos: BlockPos,
  item: string | undefined,
): Types3UseResult {
  const set = (next: BlockState | null): BlockChange[] =>
    world.set(pos, next) ? [{ pos, state: next }] : [];
  const potted = catalogue.pottedIn(block.id);
  if (potted !== undefined) {
    const pot = catalogue.get(potted.pot);
    if (pot === undefined) return NOT_TAKEN;
    const plantName = catalogue.blockFor(potted.plant)?.displayName ?? potted.plant;
    return {
      handled: true,
      changes: set(pot.defaultState),
      give: { id: potted.plant, count: 1 },
      message: `You took ${plantName} out of ${pot.displayName}.`,
    };
  }
  const pot = block.types3?.pot;
  if (pot !== undefined && block.types3?.companion === undefined) {
    if (item === undefined) return { handled: true, changes: [] };
    const into = pot.plants[item];
    const plantName = catalogue.blockFor(item)?.displayName ?? item;
    if (into === undefined) {
      return {
        handled: true,
        changes: [],
        message: `${block.displayName} does not take ${plantName}; it takes only the plants it lists.`,
      };
    }
    const next = catalogue.defaultState(into);
    if (next === undefined) return NOT_TAKEN;
    return {
      handled: true,
      changes: set(next),
      message: `You put ${plantName} in ${block.displayName}.`,
      onlyInMinecraft: `the plant used up from the hand and the "flowers potted" statistic for ${block.displayName}`,
    };
  }
  const berries = block.types3?.growing?.berries;
  if (berries !== undefined && item === undefined && state.properties.berries === 'true') {
    return {
      handled: true,
      changes: set(catalogue.withProperties(state, { berries: 'false' })),
      give: { id: berries.item, count: 1 },
      message: `You picked the berries from ${block.displayName}.`,
    };
  }
  return NOT_TAKEN;
}
