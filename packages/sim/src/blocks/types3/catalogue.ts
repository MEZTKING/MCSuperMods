/**
 * The catalogue entries of the five types of ADR 0103 (B519): the element's own block and its
 * companions (a strand's `<id>_plant`, a bamboo shoot's `<id>_shoot`, a big dripleaf's `<id>_stem`
 * and a project pot's potted `<pot id>_<plant path>` blocks), which have a block state definition
 * but no definition of their own. `buildCatalogue` calls {@link types3Entries} for a definition of
 * one of the five types; the entries share the element's name and origin, so log lines point at
 * the element.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import type { BlockState, SimOrigin } from '../../types.js';
import { freezeState } from '../../world/sim-world.js';
import type { CatalogueBlock } from '../catalogue.js';
import type { PropertyMerge } from '../types2/catalogue.js';
import {
  type Companion3Kind,
  companion3Id,
  companion3Properties,
  companions3Of,
  type Property3Specs,
  potPlants,
  pottedId,
  type SimBlockType3,
  type Types3Facts,
  types3Facts,
  types3Properties,
} from './facts.js';

/** What {@link types3Entries} needs from the catalogue builder. */
export interface Types3EntryInput {
  readonly id: string;
  readonly displayName: string;
  readonly type: SimBlockType3;
  readonly definition: JsonObject;
  readonly origin: SimOrigin;
  /** The block state definition of a block id, when the lowered files hold one. */
  readonly blockstateOf: (id: string) => Json | undefined;
  /** The properties a block state definition names. */
  readonly blockstateProperties: (blockstate: Json | undefined) => Map<string, string[]>;
  readonly merge: PropertyMerge;
  /** Whether a block id is in `#minecraft:climbable` (from the lowered tags). */
  readonly climbable: (id: string) => boolean;
  /**
   * For a pot: the `potted_plant` elements whose `pot` names it, plant id to potted element id
   * (ADR 0103 D2: they go in this pot too).
   */
  readonly pottedElements?: ReadonlyMap<string, string>;
}

/** The element's own block and its companions, ready for the catalogue. */
export function types3Entries(input: Types3EntryInput): CatalogueBlock[] {
  const { id, type, definition, origin } = input;
  let facts = types3Facts(type, definition);
  const plants: Record<string, string> = {};
  if (type === 'flower_pot') {
    const paths = new Set<string>();
    for (const plant of potPlants(definition)) {
      const potted = pottedId(id, plant);
      // The first listed plant of a path wins (B512).
      if (paths.has(potted)) continue;
      paths.add(potted);
      plants[plant] = potted;
    }
    for (const [plant, potted] of input.pottedElements ?? []) plants[plant] ??= potted;
    facts = Object.freeze({ pot: Object.freeze({ plants: Object.freeze({ ...plants }) }) });
  }
  const entry = (
    blockId: string,
    table: Property3Specs,
    types3: Types3Facts,
    climbable: boolean,
  ): CatalogueBlock => {
    const blockstate = input.blockstateOf(blockId);
    const { properties, defaults } = input.merge(table, input.blockstateProperties(blockstate));
    const defaultState: BlockState = freezeState({ name: blockId, properties: defaults });
    return Object.freeze({
      id: blockId,
      displayName: input.displayName,
      type,
      prop: false,
      properties,
      defaultState,
      opensByHand: false,
      hasBlockstate: blockstate !== undefined,
      origin,
      climbable,
      types3,
    });
  };
  const climbs = (blockId: string): boolean =>
    input.climbable(blockId) || (type === 'growing_plant' && facts.growing?.climbable === true);
  const out: CatalogueBlock[] = [entry(id, types3Properties(type, facts), facts, climbs(id))];
  for (const kind of companions3Of(type, facts)) {
    const companion = companion3Id(id, kind);
    out.push(
      entry(
        companion,
        companion3Properties(kind, facts),
        Object.freeze({ ...facts, companion: Object.freeze({ kind, of: id }) }),
        kind === 'plant' && climbs(companion),
      ),
    );
  }
  if (type === 'flower_pot') {
    const listed = new Set(Object.values(plants));
    for (const [plant, potted] of Object.entries(plants)) {
      // `potted_plant` elements are blocks of their own (B463); only the listed ones are here.
      if (!listed.has(potted) || input.pottedElements?.get(plant) === potted) continue;
      const kind: Companion3Kind = 'potted';
      out.push(
        entry(
          potted,
          {},
          Object.freeze({ ...facts, plant, companion: Object.freeze({ kind, of: id }) }),
          false,
        ),
      );
    }
  }
  return out;
}
