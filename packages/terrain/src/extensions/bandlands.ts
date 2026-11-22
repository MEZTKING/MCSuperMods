/**
 * The surface rule `bandlands` (ADR 0119 D3; plan brief B581): the coloured terracotta bands of
 * badlands. The type has no fields.
 *
 * Learned by observation on the worldgen parity fixture's `rule_bandlands` dimension (B581; 6,482
 * terracotta blocks of three seeds): the block at height y is entry `(y + offset) mod 192` of a
 * list of 192 bands that is fixed for a world's seed, where `offset` is the world's
 * `minecraft:clay_bands_offset` noise at the column (y 0) times 4, rounded to a whole number; with
 * that, no two blocks of one seed disagree about a band. The bands are mostly plain terracotta,
 * with single orange bands, runs of yellow, brown and red, and white bands beside light grey ones.
 *
 * Approximate: how the game makes the list of bands from the seed is not learned, so the preview
 * makes a list of its own from the seed with the same kinds of bands, in about the same shares
 * (MSM's own recipe below); the bands move with the offset noise as the game's do, but their
 * colours are not the game's.
 */

import {
  BlockState,
  Identifier,
  MaterialRule,
  type MaterialRuleContext,
  type RandomState,
} from 'deepslate/worldgen';
import type { RuleType } from '../rules';

/** How many bands the list has. */
export const BAND_COUNT = 192;

const TERRACOTTA = new BlockState('minecraft:terracotta');
const ORANGE = new BlockState('minecraft:orange_terracotta');
const YELLOW = new BlockState('minecraft:yellow_terracotta');
const BROWN = new BlockState('minecraft:brown_terracotta');
const RED = new BlockState('minecraft:red_terracotta');
const WHITE = new BlockState('minecraft:white_terracotta');
const LIGHT_GRAY = new BlockState('minecraft:light_gray_terracotta');

/** The random the preview's own list is drawn from (a name of MSM's own). */
export const BANDS_RANDOM = 'msm:terrain/clay_bands';

interface Draws {
  nextInt(max: number): number;
}

/** MSM's own list of bands for a world: plain terracotta with stripes, from `random`. */
export function makeBands(random: Draws): BlockState[] {
  const bands = new Array<BlockState>(BAND_COUNT).fill(TERRACOTTA);
  for (let i = random.nextInt(6); i < BAND_COUNT; i += 2 + random.nextInt(10)) bands[i] = ORANGE;
  const runs = (state: BlockState, count: number, shortest: number, longest: number) => {
    for (let n = 0; n < count; n += 1) {
      const start = random.nextInt(BAND_COUNT);
      const length = shortest + random.nextInt(longest - shortest + 1);
      for (let k = 0; k < length; k += 1) bands[(start + k) % BAND_COUNT] = state;
    }
  };
  runs(YELLOW, 3 + random.nextInt(3), 3, 6);
  runs(BROWN, 3 + random.nextInt(3), 2, 4);
  runs(RED, 2 + random.nextInt(2), 2, 3);
  const whites = 4 + random.nextInt(3);
  for (let n = 0; n < whites; n += 1) {
    const at = random.nextInt(BAND_COUNT);
    bands[at] = WHITE;
    if (random.nextInt(2) === 0) bands[(at + BAND_COUNT - 1) % BAND_COUNT] = LIGHT_GRAY;
    if (random.nextInt(2) === 0) bands[(at + 1) % BAND_COUNT] = LIGHT_GRAY;
  }
  return bands;
}

const bandsBySeed = new Map<bigint, BlockState[]>();

function bandsOf(randomState: RandomState): BlockState[] {
  let bands = bandsBySeed.get(randomState.seed);
  if (!bands) {
    if (bandsBySeed.size >= 8) bandsBySeed.clear();
    bands = makeBands(randomState.random.fromHashOf(BANDS_RANDOM));
    bandsBySeed.set(randomState.seed, bands);
  }
  return bands;
}

/** The band index of height `y` with the column's offset noise value `noise`. */
export function bandIndex(y: number, noise: number): number {
  const offset = Math.round(noise * 4);
  return (((y + offset) % BAND_COUNT) + BAND_COUNT) % BAND_COUNT;
}

/** `bandlands`. */
export class Bandlands extends MaterialRule {
  compile(context: MaterialRuleContext): (x: number, y: number, z: number) => BlockState {
    const randomState = context.randomState as RandomState;
    const bands = bandsOf(randomState);
    const noise = randomState.getOrCreateNoise(Identifier.parse('minecraft:clay_bands_offset'));
    let lastX = Number.NaN;
    let lastZ = Number.NaN;
    let value = 0;
    return (x, y, z) => {
      if (x !== lastX || z !== lastZ) {
        lastX = x;
        lastZ = z;
        value = noise.get3D(x, 0, z);
      }
      return bands[bandIndex(y, value)] as BlockState;
    };
  }
}

export const bandlands: RuleType = {
  type: 'bandlands',
  approximate:
    "About right: the bands of terracotta are there and move as in the game, but their colours are the preview's own.",
  parse: () => new Bandlands(),
};
