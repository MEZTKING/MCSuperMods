/**
 * Blockstate templates: a single model, four horizontal facings and a slab.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { blockDefinitionKind } from '../kinds/block-definition';
import { ownReference } from './shared';

const CATEGORY = 'Blockstates';

/** The blockstate templates, in picker order. */
export const blockstateTemplates: readonly ElementTemplate[] = [
  {
    id: 'blockstate',
    kind: blockDefinitionKind.id,
    category: CATEGORY,
    title: 'Blockstate',
    description: 'Which block model a block uses.',
    data: (context) => ({ variants: { '': { model: ownReference(context, 'block') } } }),
  },
  {
    id: 'blockstate_facing',
    kind: blockDefinitionKind.id,
    category: CATEGORY,
    title: 'Facing blockstate',
    description:
      'One model turned to face north, east, south or west, for blocks with a facing property.',
    data: (context) => {
      const model = ownReference(context, 'block');
      return {
        variants: {
          'facing=east': { model, y: 90 },
          'facing=north': { model },
          'facing=south': { model, y: 180 },
          'facing=west': { model, y: 270 },
        },
      };
    },
  },
  {
    id: 'blockstate_slab',
    kind: blockDefinitionKind.id,
    category: CATEGORY,
    title: 'Slab blockstate',
    description:
      'Bottom, top and double slab models: <name>, <name>_top and <name>_double block models.',
    data: (context) => ({
      variants: {
        'type=bottom': { model: ownReference(context, 'block') },
        'type=double': { model: ownReference(context, 'block', '_double') },
        'type=top': { model: ownReference(context, 'block', '_top') },
      },
    }),
  },
];
