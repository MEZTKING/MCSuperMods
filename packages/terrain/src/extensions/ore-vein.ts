/**
 * The surface rule `ore_vein` (ADR 0119 D3; plan brief B581): ore veins as a surface rule. Its
 * fields are three density functions, `density`, `richness` and `filler_gap`, and the blocks
 * `ore_block`, `raw_ore_block` and `filler_block` with `raw_ore_chance`.
 *
 * Learned by observation on the worldgen parity fixture's `rule_ore_vein` dimension (B581; 17,729
 * underground blocks of three seeds), never from a method body:
 *
 * - each block draws from the world's positional random named `minecraft:ore` at its own
 *   position; the block is part of a vein when the first draw is below `density` (exact in all
 *   9,337 blocks whose density lies between 0 and 1; none below 0, all above 1);
 * - in a vein, the block is ore only where `filler_gap` is below 0 (no ore at all at 0 or above)
 *   and, as far as was learned, where the next draw is below `richness` (ore takes a share of the
 *   vein close to `richness`); then raw ore when a third draw is below `raw_ore_chance`; anything
 *   else in a vein is `filler_block`;
 * - outside a vein the rule sets nothing, so the rules after it decide.
 *
 * Approximate: the vein's outline is exact, but which vein blocks are ore rather than filler
 * matches the game in about four blocks of five (the draw that decides it is not fully learned),
 * so the preview's ore is "about right" in a vein, as features are.
 */

import {
  BlockState,
  DensityFunction,
  Identifier,
  MaterialRule,
  type MaterialRuleContext,
  type RandomState,
} from 'deepslate/worldgen';
import { NoiseBinder } from '../fill';
import type { RuleParser, RuleType } from '../rules';

type Json = Readonly<Record<string, unknown>>;

/** The positional random the rule draws from. */
export const ORE_RANDOM = 'minecraft:ore';

function state(value: unknown): BlockState {
  if (
    typeof value === 'string' ||
    (typeof value === 'object' && value !== null && !Array.isArray(value))
  ) {
    try {
      return BlockState.fromJson(value);
    } catch {
      return BlockState.STONE;
    }
  }
  return BlockState.STONE;
}

/** `ore_vein`. */
export class OreVein extends MaterialRule {
  readonly density: DensityFunction;
  readonly richness: DensityFunction;
  readonly fillerGap: DensityFunction;
  readonly ore: BlockState;
  readonly rawOre: BlockState;
  readonly filler: BlockState;
  readonly rawOreChance: number;
  private readonly legacyRandom: boolean;

  constructor(json: Json, front: RuleParser) {
    super();
    const parse = (value: unknown) =>
      value === undefined || !front.density ? DensityFunction.Constant.ZERO : front.density(value);
    this.density = parse(json.density);
    this.richness = parse(json.richness);
    this.fillerGap = parse(json.filler_gap);
    this.ore = state(json.ore_block);
    this.rawOre = state(json.raw_ore_block);
    this.filler = state(json.filler_block);
    this.rawOreChance = typeof json.raw_ore_chance === 'number' ? json.raw_ore_chance : 0;
    this.legacyRandom = front.legacyRandom === true;
  }

  compile(
    context: MaterialRuleContext,
  ): (x: number, y: number, z: number) => BlockState | undefined {
    const randomState = context.randomState as RandomState;
    const binder = new NoiseBinder(randomState.createVisitor(this.legacyRandom));
    const density = binder.bind(this.density);
    const richness = binder.bind(this.richness);
    const fillerGap = binder.bind(this.fillerGap);
    const random = randomState.getOrCreateRandom(Identifier.parse(ORE_RANDOM));
    const at = { x: 0, y: 0, z: 0 };
    return (x, y, z) => {
      at.x = x;
      at.y = y;
      at.z = z;
      const d = density.compute(at);
      if (d <= 0) return undefined;
      const draw = random.at(x, y, z);
      if (!(draw.nextFloat() < d)) return undefined;
      if (fillerGap.compute(at) < 0 && draw.nextFloat() < richness.compute(at)) {
        return draw.nextFloat() < this.rawOreChance ? this.rawOre : this.ore;
      }
      return this.filler;
    };
  }
}

export const oreVein: RuleType = {
  type: 'ore_vein',
  densityFields: ['density', 'richness', 'filler_gap'],
  approximate:
    'About right: the veins are where the game has them, but which of their blocks are ore rather than filler is only about right.',
  parse: (json, front) => new OreVein(json, front),
};
