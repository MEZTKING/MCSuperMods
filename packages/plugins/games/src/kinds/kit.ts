/**
 * The kind `msm:kit` (ADR 0132 D3; plan `docs/PLAN-game-studio.md`): items, armour, the off
 * hand and effects given in one go. B721 made this file as a stub so that the plugin's kind
 * index never changes again; B722 fills the schema reference and the default data and sets
 * {@link KIT_KIND_LISTED} to `true`, B724 fills the lowering.
 */
import type { ElementKind, Json } from '@msm/plugin-api';
import { lowerKit } from '../lowering/kit';

/**
 * Whether the plugin contributes `msm:kit` yet. `false` until B722 gives the kind its schema:
 * while it is `false`, the kind, its validator and its Studio are left out.
 */
export const KIT_KIND_LISTED = false;

/**
 * The kind's schema reference. B722 replaces it with `MSM_SCHEMA_REFS.kit` once `games.mcdoc`
 * and `@msm/schemas`' symbols have the type.
 */
const KIT_SCHEMA = 'msm:kit';

/** A new kit's data; empty until B722 (D3: items, armour, off hand, effects, clear first). */
const KIT_DEFAULT: Json = {};

/** A kit (ADR 0132 D3), lowered to one `give` function. */
export const kitKind: ElementKind = {
  id: 'msm:kit',
  schema: KIT_SCHEMA,
  folder: 'kit',
  defaultData: KIT_DEFAULT,
  lower: lowerKit,
};
