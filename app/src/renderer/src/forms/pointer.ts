/**
 * RFC 6901 JSON pointer helpers for the schema form. Pure; no React.
 */
import type { Json } from '@msm/core';

/** Escapes one reference token (`~` → `~0`, `/` → `~1`). */
export function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Unescapes one reference token. */
export function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** The pointer of `key` (an object key or array index) under `pointer`. */
export function childPointer(pointer: string, key: string | number): string {
  return `${pointer}/${escapeToken(String(key))}`;
}

/** Splits a pointer into unescaped tokens; `''` is the root and gives `[]`. */
export function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  return pointer.slice(1).split('/').map(unescapeToken);
}

/** True when `pointer` equals `ancestor` or lies below it. */
export function isWithin(pointer: string, ancestor: string): boolean {
  return pointer === ancestor || pointer.startsWith(`${ancestor}/`);
}

/** The value at `pointer` in `value`, or `undefined` when absent. */
export function valueAt(value: Json | undefined, pointer: string): Json | undefined {
  let current: Json | undefined = value;
  for (const token of parsePointer(pointer)) {
    if (Array.isArray(current)) {
      current = /^(0|[1-9]\d*)$/.test(token) ? current[Number(token)] : undefined;
    } else if (isJsonObject(current)) {
      current = Object.hasOwn(current, token) ? current[token] : undefined;
    } else {
      return undefined;
    }
  }
  return current;
}

/** A JSON object (not an array, not null). */
export function isJsonObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
