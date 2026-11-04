/**
 * Deterministic JSON serialisation for project files.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';

function compareCodePoints(a: string, b: string): number {
  // Compare by Unicode code point rather than UTF-16 code unit, so that astral-plane
  // characters sort after every character in the Basic Multilingual Plane.
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const l = (left[i] as string).codePointAt(0) as number;
    const r = (right[i] as string).codePointAt(0) as number;
    if (l !== r) return l - r;
  }
  return left.length - right.length;
}

function describePath(path: readonly (string | number)[]): string {
  return path.length === 0 ? '(root)' : `/${path.join('/')}`;
}

function write(value: unknown, indent: string, path: (string | number)[]): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(`Cannot serialise non-finite number at ${describePath(path)}.`);
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      const inner = `${indent}  `;
      if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items: string[] = [];
        for (let i = 0; i < value.length; i++) {
          if (!(i in value)) {
            throw new TypeError(`Cannot serialise sparse array at ${describePath(path)}.`);
          }
          path.push(i);
          items.push(inner + write(value[i], inner, path));
          path.pop();
        }
        return `[\n${items.join(',\n')}\n${indent}]`;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Cannot serialise a non-plain object at ${describePath(path)}.`);
      }
      const keys = Object.keys(value).sort(compareCodePoints);
      if (keys.length === 0) return '{}';
      const record = value as Record<string, unknown>;
      const entries: string[] = [];
      for (const key of keys) {
        path.push(key);
        entries.push(`${inner}${JSON.stringify(key)}: ${write(record[key], inner, path)}`);
        path.pop();
      }
      return `{\n${entries.join(',\n')}\n${indent}}`;
    }
    default:
      throw new TypeError(`Cannot serialise ${typeof value} at ${describePath(path)}.`);
  }
}

/**
 * Serialises a JSON value deterministically.
 *
 * Object keys are sorted by Unicode code point at every depth, arrays keep their order,
 * indentation is two spaces and the output ends with a newline. Numbers print as
 * `JSON.stringify` prints them, so `3.0` becomes `3`.
 *
 * @param value - The value to serialise.
 * @returns The serialised text.
 * @throws TypeError If the value contains `undefined`, a function, a symbol, a bigint, a
 *   non-finite number, a sparse array or a non-plain object.
 */
export function stableStringify(value: Json): string {
  return `${write(value, '', [])}\n`;
}

/**
 * Parses JSON text into a {@link Json} value.
 *
 * `JSON.parse` can only yield JSON values, so this exists to give project code one typed
 * entry point. Duplicate keys keep the last value, as in `JSON.parse`.
 *
 * @param text - The JSON text.
 * @returns The parsed value.
 * @throws SyntaxError If the text is not valid JSON.
 */
export function parseJson(text: string): Json {
  return JSON.parse(text) as Json;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** UTF-8 encoding helpers. Decoding is strict and throws on malformed bytes. */
export const utf8: { encode(text: string): Uint8Array; decode(bytes: Uint8Array): string } = {
  encode: (text) => encoder.encode(text),
  decode: (bytes) => decoder.decode(bytes),
};
