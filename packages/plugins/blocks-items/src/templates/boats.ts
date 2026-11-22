/**
 * Boat templates (ADR 0110 D1; B531), category "Items": an `msm:item` with `msm:boat` and a chest
 * boat. It borrows vanilla oak's boat pictures through `wood_texture: "minecraft:oak"` (read from
 * the user's client jar at their fixed paths, never bundled) and the oak boat's item model, so it
 * draws before it has pictures of its own. Its recipe is vanilla's, from the planks named after
 * the boat (`<ns>:<wood>_planks`, as the Wood set makes them).
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { ITEM_KIND } from '../kinds';
import { displayName } from './shared';

export const boatTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_item_boat',
    kind: ITEM_KIND,
    category: 'Items',
    title: 'Boat and chest boat',
    description:
      'A boat you paddle and ride as vanilla boats, with a chest boat beside it. It is drawn as an oak boat until you give it your own wood pictures, and it is crafted from your wood planks: make a wood set of the same name for them.',
    defaultName: 'maple_boat',
    data: (context): Json => {
      const name = displayName(context.path);
      return {
        format: 1,
        display_name: name,
        chest_boat_display_name: `${name} with Chest`,
        model: 'minecraft:item/oak_boat',
        creative_tab: 'minecraft:tools_and_utilities',
        components: { 'msm:boat': { chest: true, wood_texture: 'minecraft:oak' } },
        boat_textures: { chest_boat_item: 'minecraft:item/oak_chest_boat' },
      };
    },
  },
];
