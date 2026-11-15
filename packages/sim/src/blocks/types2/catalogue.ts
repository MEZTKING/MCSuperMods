/**
 * The catalogue entries of the twenty types (B463): the element's own block and its companions
 * (`<id>_wall`, `<id>_attached`, B448), which have a block state definition but no definition of
 * their own. `buildCatalogue` calls {@link types2Entries} for a definition of one of the twenty
 * types; the entries share the element's name and origin, so log lines point at the element.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import type { BlockState, SimOrigin } from '../../types.js';
import { freezeState } from '../../world/sim-world.js';
import type { CatalogueBlock } from '../catalogue.js';
import {
  companionId,
  companionKindsOf,
  companionProperties,
  type PropertySpecs,
  type SimBlockType2,
  types2Facts,
  types2Properties,
} from './facts.js';

/** Merges a type's properties with those its block state definition names (the catalogue's). */
export type PropertyMerge = (
  table: PropertySpecs,
  fromBlockstate: Map<string, string[]>,
) => { properties: Record<string, readonly string[]>; defaults: Record<string, string> };

/** What {@link types2Entries} needs from the catalogue builder. */
export interface Types2EntryInput {
  readonly id: string;
  readonly displayName: string;
  readonly type: SimBlockType2;
  readonly definition: JsonObject;
  readonly origin: SimOrigin;
  /** The block state definition of a block id, when the lowered files hold one. */
  readonly blockstateOf: (id: string) => Json | undefined;
  /** The properties a block state definition names. */
  readonly blockstateProperties: (blockstate: Json | undefined) => Map<string, string[]>;
  readonly merge: PropertyMerge;
  /** Whether a block id is in `#minecraft:climbable` (from the lowered tags). */
  readonly climbable: (id: string) => boolean;
}

/** The element's own block and its companions, ready for the catalogue. */
export function types2Entries(input: Types2EntryInput): CatalogueBlock[] {
  const { id, type, definition, origin } = input;
  const facts = types2Facts(type, id, definition);
  const entry = (
    blockId: string,
    table: PropertySpecs,
    extra: Partial<CatalogueBlock>,
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
      climbable: input.climbable(blockId),
      ...extra,
    });
  };
  const out: CatalogueBlock[] = [entry(id, types2Properties(type), { types2: facts })];
  for (const kind of companionKindsOf(type)) {
    const companion = companionId(id, kind);
    out.push(
      entry(companion, companionProperties(type), {
        types2: Object.freeze({ ...facts, companion: Object.freeze({ kind, of: id }) }),
      }),
    );
  }
  return out;
}
