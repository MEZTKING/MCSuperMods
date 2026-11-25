/**
 * The hash of an element's data that a {@link MigrationReverse} carries (ADR 0136 D7), so a host
 * can tell an element edited since the move from one left as moved.
 *
 * The function: the data as canonical JSON (object keys sorted by code unit, no spaces), its
 * UTF-16 code units hashed with cyrb53 (seed 0), written as 14 lowercase hex digits. A host that
 * checks a saved reverse must use the same function, or recompute every `afterHash` with its own
 * when it saves the report.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';

/** `value` as JSON with sorted object keys and no whitespace. */
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as Json)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** cyrb53 of `text` (53 bits), as 14 hex digits. */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, '0');
}

/** The hash of an element's data, as {@link MigrationReverse.afterHash} holds it. */
export function dataHash(data: Json): string {
  return cyrb53(canonicalJson(data));
}
