/**
 * A correction to deepslate 0.27.2's positional randoms (ADR 0119 D3: corrected in our own code
 * path, never by patching `node_modules`). deepslate's `getSeed(x, y, z)` multiplies x as a 64-bit
 * number; the game's x term wraps at 32 bits before it is widened, so for |x| above 686 every
 * random drawn at a position differs: the surface depth's small random part (`stone_depth` with
 * `add_surface_depth`, `water` and `y_above` with a surface depth multiplier), `vertical_gradient`
 * and the rule types of this folder that draw at a position. Learned by observation against the
 * worldgen parity fixture (B581): with this, the top four blocks of `plain` match in 100 % of
 * columns instead of 97.3 %, the misses having been only in the chunk at x 1088 to 1103.
 *
 * `install()` replaces `at` on deepslate's two positional random classes once; the extensions'
 * index calls it when it is first imported, so every world the engine makes uses it.
 */

import {
  LegacyPositionalRandom,
  LegacyRandom,
  XoroshiroPositionalRandom,
  XoroshiroRandom,
} from 'deepslate/math';

/** The seed of a position, with the x term wrapped at 32 bits. */
export function positionSeed(x: number, y: number, z: number): bigint {
  let seed = BigInt.asIntN(
    64,
    BigInt(Math.imul(x | 0, 3129871)) ^ (BigInt(z | 0) * 116129781n) ^ BigInt(y | 0),
  );
  seed = BigInt.asIntN(
    64,
    BigInt.asIntN(64, seed * seed * 42317861n) + BigInt.asIntN(64, seed * 11n),
  );
  return seed >> 16n;
}

interface XoroshiroPositional {
  readonly seedLo: bigint;
  readonly seedHi: bigint;
}

interface LegacyPositional {
  readonly seed: bigint;
}

let installed = false;

/** Replaces deepslate's `at` on both positional random classes (once). */
export function install(): void {
  if (installed) return;
  installed = true;
  const xoroshiro = XoroshiroRandom as unknown as new (seed: [bigint, bigint]) => XoroshiroRandom;
  const legacy = LegacyRandom as unknown as new (seed: bigint) => LegacyRandom;
  Object.defineProperty(XoroshiroPositionalRandom.prototype, 'at', {
    configurable: true,
    writable: true,
    value: function at(this: XoroshiroPositional, x: number, y: number, z: number) {
      return new xoroshiro([positionSeed(x, y, z) ^ this.seedLo, this.seedHi]);
    },
  });
  Object.defineProperty(LegacyPositionalRandom.prototype, 'at', {
    configurable: true,
    writable: true,
    value: function at(this: LegacyPositional, x: number, y: number, z: number) {
      return new legacy(positionSeed(x, y, z) ^ this.seed);
    },
  });
}
