/**
 * `minecraft:recipe`: a recipe (`data/<ns>/<recipe>/<path>.json`).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonData } from '../lowering/json-data';

const SCHEMA = 'resource:recipe';

export const recipeKind: ElementKind = {
  id: 'minecraft:recipe',
  schema: SCHEMA,
  folder: 'recipe',
  defaultData: {
    type: 'minecraft:crafting_shaped',
    pattern: ['#'],
    key: { '#': 'minecraft:stone' },
    result: { id: 'minecraft:stone', count: 1 },
  },
  lower: (element, target) => lowerJsonData(element, target, 'recipe', SCHEMA),
};
