/**
 * Item definition templates: a plain model, a model that changes while the item is used,
 * and a model chosen by display context.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { itemDefinitionKind } from '../kinds/item-definition';
import { ownReference } from './shared';

const CATEGORY = 'Item definitions';

/** The item definition templates, in picker order. */
export const itemDefinitionTemplates: readonly ElementTemplate[] = [
  {
    id: 'item_definition',
    kind: itemDefinitionKind.id,
    category: CATEGORY,
    title: 'Item definition',
    description: 'Which model an item uses.',
    data: (context) => ({ model: { type: 'model', model: ownReference(context, 'item') } }),
  },
  {
    id: 'item_definition_condition',
    kind: itemDefinitionKind.id,
    category: CATEGORY,
    title: 'Item definition (while using)',
    description:
      'Shows the <name>_using item model while the item is being used, like a drawn bow or a raised shield.',
    data: (context) => ({
      model: {
        type: 'minecraft:condition',
        property: 'minecraft:using_item',
        on_true: { type: 'minecraft:model', model: ownReference(context, 'item', '_using') },
        on_false: { type: 'minecraft:model', model: ownReference(context, 'item') },
      },
    }),
  },
  {
    id: 'item_definition_select',
    kind: itemDefinitionKind.id,
    category: CATEGORY,
    title: 'Item definition (by display context)',
    description:
      'Shows the <name>_gui item model in inventories and the normal model everywhere else.',
    data: (context) => ({
      model: {
        type: 'minecraft:select',
        property: 'minecraft:display_context',
        cases: [
          {
            when: 'gui',
            model: { type: 'minecraft:model', model: ownReference(context, 'item', '_gui') },
          },
        ],
        fallback: { type: 'minecraft:model', model: ownReference(context, 'item') },
      },
    }),
  },
];
