/**
 * Predicate templates: reusable conditions for commands (`execute if predicate`), loot tables,
 * item modifiers and advancements.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { kindDefaultOr } from './shared';

const KIND = 'minecraft:predicate';
const CATEGORY = 'Predicates';

function predicate(id: string, title: string, description: string, data: Json): ElementTemplate {
  return {
    id,
    kind: KIND,
    category: CATEGORY,
    title,
    description,
    data: () => structuredClone(data),
  };
}

export const predicateTemplates: readonly ElementTemplate[] = [
  {
    id: 'predicate',
    kind: KIND,
    category: CATEGORY,
    title: 'Random chance',
    description: 'A reusable condition, for example a random chance.',
    data: (context) => kindDefaultOr(context, { type: 'minecraft:random_chance', chance: 0.5 }),
  },
  predicate('predicate_sneaking', 'Is sneaking', 'True while the entity is sneaking.', {
    type: 'minecraft:entity_properties',
    entity: 'this',
    predicate: { flags: { is_sneaking: true } },
  }),
  predicate('predicate_raining', 'Is raining', 'True while it rains (or thunders).', {
    type: 'minecraft:weather_check',
    raining: true,
  }),
  predicate('predicate_night', 'Is night', 'True between dusk and dawn of the day cycle.', {
    type: 'minecraft:time_check',
    clock: 'minecraft:overworld',
    value: { min: 13000, max: 23000 },
    period: 24000,
  }),
  predicate('predicate_in_biome', 'In a biome', 'True when the position is in a forest biome.', {
    type: 'minecraft:location_check',
    predicate: { biomes: '#minecraft:is_forest' },
  }),
];
