/**
 * The kind `msm:game` (ADR 0132 D1; plan `docs/PLAN-game-studio.md`): one whole game, its type,
 * round, lobby, roles and mechanics. B721 made this file as a stub so that the plugin's kind
 * index never changes again; B722 gave it its schema (`::msm::games::Game` in `@msm/schemas`'
 * `games.mcdoc`) and its default data; B724 fills the lowering and sets
 * {@link GAME_KIND_LISTED} to `true` once the game lowers to something.
 */
import type { ElementKind, Json } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerGame } from '../lowering/game/index';

/**
 * Whether the plugin contributes `msm:game` yet. `false` until the game lowers to files (B724):
 * while it is `false`, the kind, its validator and its Studio are left out, so nothing in the
 * app (the Add dialog, the element list, the Studios) shows it. B722 gave the kind its schema
 * but left this off on purpose, so that no one can make a game that lowers to nothing.
 */
export const GAME_KIND_LISTED = false;

/** The kind's schema reference (`::msm::games::Game`). */
const GAME_SCHEMA = MSM_SCHEMA_REFS.game;

/**
 * A new, empty game (the catalogue's "Start from an empty game"): rounds for 2 to 16 players,
 * started by a command, won by the last player still in, with no lobby, roles or mechanics yet.
 * A game type's starter (B733) fills in its own.
 */
const GAME_DEFAULT: Json = {
  type: 'custom',
  name: 'My game',
  players: { min: 2, max: 16 },
  round: {
    kind: 'rounds',
    start: 'command',
    countdown: 10,
    win: [{ type: 'last_standing', by: 'players' }],
    after: 'stay',
  },
  mechanics: [],
};

/** One whole game (ADR 0132 D1): the Game tab of the Game and map Studio edits it. */
export const gameKind: ElementKind = {
  id: 'msm:game',
  schema: GAME_SCHEMA,
  folder: 'game',
  defaultData: GAME_DEFAULT,
  lower: lowerGame,
};
