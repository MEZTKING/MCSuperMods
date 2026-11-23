/**
 * The mechanics of `msm:game` (ADR 0132 D2): a game type is a named set of mechanics, each
 * lowered by one file of this folder (B725: hearts, tracker, head start; B726: elimination, fall
 * out, floor, team base, generators, shop, border, kit on). The win conditions are the round's
 * (`../round.ts`, B724). B721 made this index and a stub per mechanic so that no later brief
 * edits it; the contract types below are shared by the round engine and every mechanic.
 */
import type { Element, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { lowerBorder } from './border';
import { lowerElimination } from './elimination';
import { lowerFallOut } from './fall-out';
import { lowerFloor } from './floor';
import { lowerGenerators } from './generators';
import { lowerHeadStart } from './head-start';
import { lowerHearts } from './hearts';
import { lowerKitOn } from './kit-on';
import { lowerShop } from './shop';
import { lowerTeamBase } from './team-base';
import { lowerTracker } from './tracker';

/** What every part of a game's lowering knows. */
export interface GameLoweringContext {
  /** The `msm:game` element being lowered. */
  readonly element: Element;
  /** The element's namespace, the generated functions' namespace. */
  readonly namespace: string;
  /** The facts of the target being exported for. */
  readonly target: TargetFacts;
}

/** Lowers one mechanic of a game (its entry in the game's `mechanics` list) to files. */
export type MechanicLowering = (mechanic: JsonObject, context: GameLoweringContext) => OutputFile[];

/** The mechanic types of batch 1 (ADR 0132 D2), in the Game Studio's order. */
export const MECHANIC_TYPES = Object.freeze([
  'hearts',
  'tracker',
  'head_start',
  'elimination',
  'fall_out',
  'floor',
  'team_base',
  'generators',
  'shop',
  'border',
  'kit_on',
] as const);

/** A mechanic type of batch 1. */
export type MechanicType = (typeof MECHANIC_TYPES)[number];

/** The lowering of each mechanic type. */
export const MECHANIC_LOWERINGS: Readonly<Record<MechanicType, MechanicLowering>> = Object.freeze({
  hearts: lowerHearts,
  tracker: lowerTracker,
  head_start: lowerHeadStart,
  elimination: lowerElimination,
  fall_out: lowerFallOut,
  floor: lowerFloor,
  team_base: lowerTeamBase,
  generators: lowerGenerators,
  shop: lowerShop,
  border: lowerBorder,
  kit_on: lowerKitOn,
});

const isMechanicType = (value: unknown): value is MechanicType =>
  typeof value === 'string' && (MECHANIC_TYPES as readonly string[]).includes(value);

/**
 * Lowers one mechanic by its `type`; a type this plugin does not know lowers to nothing (the
 * game's validator reports it, B724).
 */
export function lowerMechanic(mechanic: JsonObject, context: GameLoweringContext): OutputFile[] {
  const type = mechanic.type;
  return isMechanicType(type) ? MECHANIC_LOWERINGS[type](mechanic, context) : [];
}
