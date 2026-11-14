/**
 * Element kinds contributed by `@msm/plugin-blocks-items` (ADR 0025 D8): `msm:block` (kind
 * folder `block`), `msm:item` (`item`), `msm:effect` (`effect`, ADR 0055 D1), the singleton
 * `msm:mod` (`mod`, conventional id `<ns>:mod`), and the additions to vanilla content
 * `msm:biome_addition` (`biome_addition`) and `msm:loot_addition` (`loot_addition`, ADR 0060
 * D2, D3), which belong to no registry. Element ids are the registry ids: `msm:block`
 * elements belong to the `block` registry, `msm:item` elements to `item` and `msm:effect`
 * elements to `mob_effect`, so references such as a `give_item` action or an `apply_effect`
 * action resolve to project content.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerBiomeAddition, lowerLootAddition } from '../lowering/additions';
import { lowerBlock } from '../lowering/block';
import { lowerEffect } from '../lowering/effect';
import { lowerItem } from '../lowering/item';
import { lowerMod } from '../lowering/mod';

/** Kind id of custom blocks. */
export const BLOCK_KIND = 'msm:block';
/** Kind id of custom items. */
export const ITEM_KIND = 'msm:item';
/** Kind id of custom mob effects (ADR 0055 D1). */
export const EFFECT_KIND = 'msm:effect';
/** Kind id of the mod metadata singleton. */
export const MOD_KIND = 'msm:mod';
/** Kind id of features and spawns added to biomes (ADR 0060 D2). */
export const BIOME_ADDITION_KIND = 'msm:biome_addition';
/** Kind id of pools added to loot tables (ADR 0060 D3). */
export const LOOT_ADDITION_KIND = 'msm:loot_addition';

/** `format` is written by lowering, so the form hides it. */
const HIDDEN = ['/format'];

export const blockKind: ElementKind = {
  id: BLOCK_KIND,
  schema: MSM_SCHEMA_REFS.block,
  folder: 'block',
  registry: 'block',
  defaultData: {
    format: 1,
    model: 'minecraft:block/stone',
    loot: 'self',
    sound_type: 'stone',
    components: { 'msm:breakable': { hardness: 1.5, resistance: 6 } },
  },
  hiddenPaths: HIDDEN,
  lower: lowerBlock,
};

export const itemKind: ElementKind = {
  id: ITEM_KIND,
  schema: MSM_SCHEMA_REFS.item,
  folder: 'item',
  registry: 'item',
  defaultData: { format: 1, model: 'minecraft:item/stick', max_stack_size: 64 },
  hiddenPaths: HIDDEN,
  lower: lowerItem,
};

/**
 * Custom mob effects (ADR 0055): a beneficial effect with a light blue colour by default. The
 * icon is the project texture `assets/<ns>/textures/mob_effect/<path>.png`.
 */
export const effectKind: ElementKind = {
  id: EFFECT_KIND,
  schema: MSM_SCHEMA_REFS.effect,
  folder: 'effect',
  registry: 'mob_effect',
  defaultData: { format: 1, category: 'beneficial', color: 0x33ebff },
  hiddenPaths: HIDDEN,
  lower: lowerEffect,
};

export const modKind: ElementKind = {
  id: MOD_KIND,
  schema: MSM_SCHEMA_REFS.mod,
  folder: 'mod',
  defaultData: { mod_id: 'my_mod', version: '1.0.0' },
  lower: lowerMod,
};

/**
 * Features and spawns added to vanilla or other biomes when a server starts (ADR 0060 D2). The
 * default adds vanilla's plains flowers to plains, a valid start to edit.
 */
export const biomeAdditionKind: ElementKind = {
  id: BIOME_ADDITION_KIND,
  schema: MSM_SCHEMA_REFS.biomeAddition,
  folder: 'biome_addition',
  defaultData: {
    format: 1,
    biomes: ['minecraft:plains'],
    features: [{ feature: 'minecraft:flower_plains', step: 'vegetal_decoration' }],
  },
  hiddenPaths: HIDDEN,
  lower: lowerBiomeAddition,
};

/**
 * Pools added to built-in loot tables on every data pack load (ADR 0060 D3). The default adds
 * one emerald to a zombie's drops.
 */
export const lootAdditionKind: ElementKind = {
  id: LOOT_ADDITION_KIND,
  schema: MSM_SCHEMA_REFS.lootAddition,
  folder: 'loot_addition',
  defaultData: {
    format: 1,
    tables: ['minecraft:entities/zombie'],
    pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:emerald' }] }],
  },
  hiddenPaths: HIDDEN,
  lower: lowerLootAddition,
};

/** Every kind this plugin contributes, in order. */
export const blocksItemsKinds: readonly ElementKind[] = Object.freeze([
  blockKind,
  itemKind,
  effectKind,
  modKind,
  biomeAdditionKind,
  lootAdditionKind,
]);
