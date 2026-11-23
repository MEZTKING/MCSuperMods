/**
 * Pure lowering functions (`lower(element, target) -> OutputFile[]`) for
 * `@msm/plugin-games`: the Game and map Studio's `msm:game` (`game/`, with its mechanics in
 * `game/mechanics/`) and `msm:kit` (`kit.ts`), ADR 0132; the pieces' lowering is imported by
 * the kinds directly.
 */
export { lowerGame } from './game/index';
export {
  type GameLoweringContext,
  lowerMechanic,
  MECHANIC_LOWERINGS,
  MECHANIC_TYPES,
  type MechanicLowering,
  type MechanicType,
} from './game/mechanics/index';
export { lowerKit } from './kit';
