/**
 * The engine's first seam (ADR 0119 D3; plan brief B581): types the targets have and deepslate
 * 0.27.2 lacks or computes differently, read by B578's parser front (`parser.ts`), rule front
 * (`rules.ts`) and world (`world.ts`), and by the walker, which stops reporting a type listed
 * here. One file per type; each says how it was learned (the data format's fields and what the
 * worldgen parity fixture's real worlds show, never a Mojang method body).
 *
 * Importing this module also installs three corrections to deepslate: the aquifer's surface
 * samples (`aquifer.ts`), positional randoms (`positional-random.ts`) and the whole-number surface
 * depth (`surface-depth.ts`).
 */

import type { DensityFunctionType } from '../parser';
import type { ConditionType, RuleType } from '../rules';
import type { FlatGeneratorFn } from '../world';
import { install as installAquifer } from './aquifer';
import { bandlands } from './bandlands';
import { correctedTypes } from './corrections';
import { domainWarp } from './domain-warp';
import { flat } from './flat';
import { hole } from './hole';
import { oreVein } from './ore-vein';
import { install as installPositionalRandom } from './positional-random';
import { steep } from './steep';
import { install as installSurfaceDepth } from './surface-depth';
import { temperature } from './temperature';
import { upscale } from './upscale';

installAquifer();
installPositionalRandom();
installSurfaceDepth();

/** Density function types the parser front builds itself. */
export const densityFunctionTypes: readonly DensityFunctionType[] = [
  ...correctedTypes,
  upscale,
  domainWarp,
];

/** Surface rule types the rule front builds itself. */
export const ruleTypes: readonly RuleType[] = [bandlands, oreVein];

/** Surface condition types the rule front builds itself. */
export const conditionTypes: readonly ConditionType[] = [hole, steep, temperature];

/** The flat generator. */
export const flatGenerator: FlatGeneratorFn | null = flat;
