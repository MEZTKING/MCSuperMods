/**
 * The kind `msm:kit` (ADR 0132 D3; plan `docs/PLAN-game-studio.md`): items, armour, the off
 * hand and effects given in one go. B721 made this file as a stub so that the plugin's kind
 * index never changes again; B722 gave it its schema (`::msm::games::Kit` in `@msm/schemas`'
 * `games.mcdoc`) and its default data; B724 fills the lowering and sets
 * {@link KIT_KIND_LISTED} to `true` once the kit lowers to something.
 */
import type { ElementKind, Json } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerKit } from '../lowering/kit';

/**
 * Whether the plugin contributes `msm:kit` yet. `false` until the kit lowers to its `give`
 * function (B724): while it is `false`, the kind, its validator and its Studio are left out.
 * B722 gave the kind its schema but left this off on purpose.
 */
export const KIT_KIND_LISTED = false;

/** The kind's schema reference (`::msm::games::Kit`). */
const KIT_SCHEMA = MSM_SCHEMA_REFS.kit;

/** A new kit: a stone sword and some bread, given after the inventory is cleared. */
const KIT_DEFAULT: Json = {
  name: 'My kit',
  items: [
    { item: 'minecraft:stone_sword', count: 1 },
    { item: 'minecraft:bread', count: 8 },
  ],
  clear_first: true,
};

/** A kit (ADR 0132 D3), lowered to one `give` function. */
export const kitKind: ElementKind = {
  id: 'msm:kit',
  schema: KIT_SCHEMA,
  folder: 'kit',
  defaultData: KIT_DEFAULT,
  lower: lowerKit,
};
