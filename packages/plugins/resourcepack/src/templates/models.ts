/**
 * Model templates: block models (cube, column, cross) and item models (flat, handheld).
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { modelKind } from '../kinds/model';
import { ownReference } from './shared';

const CATEGORY = 'Models';

/** The model templates, in picker order. */
export const modelTemplates: readonly ElementTemplate[] = [
  {
    id: 'block_model',
    kind: modelKind.id,
    category: CATEGORY,
    title: 'Block model',
    description: 'A full cube with one texture on every side.',
    prefix: 'block/',
    data: (context) => ({
      parent: 'minecraft:block/cube_all',
      textures: { all: ownReference(context, 'block') },
    }),
  },
  {
    id: 'model_block_column',
    kind: modelKind.id,
    category: CATEGORY,
    title: 'Column block model',
    description:
      'A pillar like a log: one texture on the sides and another (<name>_top) on both ends.',
    prefix: 'block/',
    data: (context) => ({
      parent: 'minecraft:block/cube_column',
      textures: {
        end: ownReference(context, 'block', '_top'),
        side: ownReference(context, 'block'),
      },
    }),
  },
  {
    id: 'model_block_cross',
    kind: modelKind.id,
    category: CATEGORY,
    title: 'Cross block model',
    description: 'Two crossed planes, as used by flowers, saplings and other plants.',
    prefix: 'block/',
    data: (context) => ({
      parent: 'minecraft:block/cross',
      textures: { cross: ownReference(context, 'block') },
    }),
  },
  {
    id: 'item_model',
    kind: modelKind.id,
    category: CATEGORY,
    title: 'Item model',
    description: 'A flat item drawn from one texture.',
    prefix: 'item/',
    data: (context) => ({
      parent: 'minecraft:item/generated',
      textures: { layer0: ownReference(context, 'item') },
    }),
  },
  {
    id: 'model_item_handheld',
    kind: modelKind.id,
    category: CATEGORY,
    title: 'Handheld item model',
    description: 'A flat item held like a tool or weapon (angled in the hand).',
    prefix: 'item/',
    data: (context) => ({
      parent: 'minecraft:item/handheld',
      textures: { layer0: ownReference(context, 'item') },
    }),
  },
];
