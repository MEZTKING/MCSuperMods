/**
 * How a typed seed becomes a number (spike B574, WS17, learned by observation on both targets):
 * text that is a whole number in the range of a 64-bit signed integer is that number; any other
 * text is Java's `String.hashCode` of it (32-bit, over UTF-16 code units). Empty text gives 0; a
 * view that wants a random seed for empty text rolls one itself.
 */

const MIN_LONG = -(1n << 63n);
const MAX_LONG = (1n << 63n) - 1n;
const WHOLE_NUMBER = /^-?[0-9]+$/;

/** Java's `String.hashCode`: `h = 31 * h + c` over UTF-16 code units, wrapped to 32 bits. */
export function javaStringHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  }
  return h;
}

/** The seed a typed text gives (WS17). */
export function seedFromText(text: string): bigint {
  if (WHOLE_NUMBER.test(text)) {
    const value = BigInt(text);
    if (value >= MIN_LONG && value <= MAX_LONG) return value;
  }
  return BigInt(javaStringHash(text));
}

/** A bigint wrapped into the 64-bit signed range, as a seed is stored. */
export function toLongSeed(seed: bigint): bigint {
  return BigInt.asIntN(64, seed);
}
