/**
 * The checks of each mechanic of `msm:game` (ADR 0132 D2), one file per mechanic beside its
 * lowering in `../lowering/game/mechanics/` (B725 and B726 fill them). The game's validator
 * (`../validators-game.ts`, B724) runs the check of each mechanic a game has. B721 made this
 * index and the stubs so that no later brief edits it.
 */
import type { Element, JsonObject, Problem, ValidationInput } from '@msm/plugin-api';
import type { MechanicType } from '../lowering/game/mechanics/index';
import { checkBorder } from './border';
import { checkElimination } from './elimination';
import { checkFallOut } from './fall-out';
import { checkFloor } from './floor';
import { checkGenerators } from './generators';
import { checkHeadStart } from './head-start';
import { checkHearts } from './hearts';
import { checkKitOn } from './kit-on';
import { checkShop } from './shop';
import { checkTeamBase } from './team-base';
import { checkTracker } from './tracker';

/** What a mechanic's check knows. */
export interface MechanicCheckContext {
  /** The `msm:game` element the mechanic belongs to. */
  readonly game: Element;
  /** The RFC 6901 pointer of the mechanic in the game's data, such as `/mechanics/0`. */
  readonly path: string;
  /** The project's elements, the target and the registry ids. */
  readonly input: ValidationInput;
}

/** Checks one mechanic of a game; problems carry the game's id and a path under the mechanic. */
export type MechanicCheck = (mechanic: JsonObject, context: MechanicCheckContext) => Problem[];

/** The check of each mechanic type. */
export const MECHANIC_CHECKS: Readonly<Record<MechanicType, MechanicCheck>> = Object.freeze({
  hearts: checkHearts,
  tracker: checkTracker,
  head_start: checkHeadStart,
  elimination: checkElimination,
  fall_out: checkFallOut,
  floor: checkFloor,
  team_base: checkTeamBase,
  generators: checkGenerators,
  shop: checkShop,
  border: checkBorder,
  kit_on: checkKitOn,
});
