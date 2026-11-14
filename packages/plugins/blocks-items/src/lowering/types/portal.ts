/**
 * `portal` (ADR 0077 D1, D8): the block that fills a lit frame and takes entities to another
 * dimension. Its look is vanilla's Nether portal: the block state maps `axis=x` to the model
 * `<ns>:block/<path>_ns` and `axis=z` to `<ns>:block/<path>_ew` (as vanilla's `nether_portal`
 * block state does, F17), each parented on vanilla's `minecraft:block/nether_portal_ns` or
 * `_ew` with the texture variables `portal` and `particle` set to `textures.portal`, or to
 * vanilla's `minecraft:block/nether_portal` when the element gives none (referenced from the
 * user's client jar, never bundled). So a portal always has an appearance, textures or not.
 * The element takes no `models` (the format has no model slots for the type).
 *
 * A portal has no block item unless `item` is given (`blockItemIdOf`); with one, the item is a
 * flat `minecraft:item/generated` model of the portal texture, as a pane's item.
 *
 * Tags: block `portals` (vanilla's `#minecraft:portals`, which `LivingEntity.dismountVehicle`
 * reads on both targets so a dismounting rider is not put inside a portal block).
 *
 * Model slots: `ns`, `ew`.
 */
import type { JsonObject } from '@msm/plugin-api';
import { isRecord } from '../paths';
import { nonEmptyString } from '../shared';
import { variant, variants } from './blockstates';
import type { ModelSpec, TypeLowering } from './models';
import type { TypeTags } from './tags';

/** The texture a portal shows without `textures.portal`: vanilla's Nether portal surface. */
export const DEFAULT_PORTAL_TEXTURE = 'minecraft:block/nether_portal';

/** The block tags every portal joins. */
export const PORTAL_BLOCK_TAGS: readonly string[] = Object.freeze(['portals']);

/** The vanilla template model of each slot (the Nether portal's two models). */
export const PORTAL_MODEL_PARENTS: Readonly<Record<'ns' | 'ew', string>> = Object.freeze({
  ns: 'minecraft:block/nether_portal_ns',
  ew: 'minecraft:block/nether_portal_ew',
});

const SLOTS = ['ns', 'ew'] as const;

/** The portal texture of block data: `textures.portal`, else vanilla's Nether portal. */
export function portalTextureOf(data: JsonObject): string {
  const textures = isRecord(data.textures) ? data.textures : undefined;
  return nonEmptyString(textures?.portal) ?? DEFAULT_PORTAL_TEXTURE;
}

export const portalType: TypeLowering = {
  slots: SLOTS,
  generate: () => [],
  generateFromData: (data) => {
    const portal = portalTextureOf(data);
    return SLOTS.map(
      (slot): ModelSpec => ({
        slot,
        suffix: `_${slot}`,
        parent: PORTAL_MODEL_PARENTS[slot],
        textures: { particle: portal, portal },
      }),
    );
  },
  itemTextureFromData: portalTextureOf,
  blockstate: (models) =>
    variants([
      [{ axis: 'x' }, variant(models.ns ?? '')],
      [{ axis: 'z' }, variant(models.ew ?? '')],
    ]),
  tags: (): TypeTags => ({ block: PORTAL_BLOCK_TAGS, item: [] }),
};
