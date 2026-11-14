/**
 * Templates of the additions to vanilla content (ADR 0060 D2, D3): world generation and extra
 * drops. They need the Fabric mod export: vanilla packs do not carry them (ADR 0060 D7).
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { BIOME_ADDITION_KIND, LOOT_ADDITION_KIND } from '../kinds';

const CATEGORY = 'Additions';

export const additionTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_biome_addition_overworld_ore',
    kind: BIOME_ADDITION_KIND,
    category: CATEGORY,
    title: 'Ore in the overworld',
    description:
      'Generates an ore in every overworld biome, at the underground ores step. It adds the placed feature "<this id>_placed": make that placed feature (and its feature) in the Worldgen Studio, or pick your own. Only newly generated chunks get the ore, and it needs the Fabric mod export.',
    data: (context) => ({
      format: 1,
      biomes: ['#minecraft:is_overworld'],
      features: [{ feature: `${context.id}_placed`, step: 'underground_ores' }],
    }),
  },
  {
    id: 'msm_loot_addition_mob_drop',
    kind: LOOT_ADDITION_KIND,
    category: CATEGORY,
    title: 'Extra mob drop',
    description:
      'Adds a drop to the zombie: one emerald, one time in ten, only when a player kills it. The zombie keeps its usual drops. A world data pack that replaces the zombie loot table wins. Needs the Fabric mod export.',
    data: () => ({
      format: 1,
      tables: ['minecraft:entities/zombie'],
      pools: [
        {
          rolls: 1,
          entries: [{ type: 'minecraft:item', name: 'minecraft:emerald' }],
          condition: {
            type: 'minecraft:all_of',
            terms: [
              { type: 'minecraft:killed_by_player' },
              { type: 'minecraft:random_chance', chance: 0.1 },
            ],
          },
        },
      ],
    }),
  },
];
