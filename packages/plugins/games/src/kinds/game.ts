/**
 * The kind `msm:game` (ADR 0132 D1; plan `docs/PLAN-game-studio.md`): one whole game, its type,
 * round, lobby, roles and mechanics. B721 made this file as a stub so that the plugin's kind
 * index never changes again; B722 fills the schema reference and the default data and sets
 * {@link GAME_KIND_LISTED} to `true`, B724 fills the lowering.
 */
import type { ElementKind, Json } from '@msm/plugin-api';
import { lowerGame } from '../lowering/game/index';

/**
 * Whether the plugin contributes `msm:game` yet. `false` until B722 gives the kind its schema:
 * while it is `false`, the kind, its validator and its Studio are left out, so nothing in the
 * app (the Add dialog, the element list, the Studios) shows it.
 */
export const GAME_KIND_LISTED = false;

/**
 * The kind's schema reference. B722 replaces it with `MSM_SCHEMA_REFS.game` once
 * `games.mcdoc` and `@msm/schemas`' symbols have the type.
 */
const GAME_SCHEMA = 'msm:game';

/** A new game's data; empty until B722 (D1: type, round, lobby, roles, mechanics). */
const GAME_DEFAULT: Json = {};

/** One whole game (ADR 0132 D1): the Game tab of the Game and map Studio edits it. */
export const gameKind: ElementKind = {
  id: 'msm:game',
  schema: GAME_SCHEMA,
  folder: 'game',
  defaultData: GAME_DEFAULT,
  lower: lowerGame,
};
