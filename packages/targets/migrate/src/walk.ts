/**
 * Walking element data: RFC 6901 pointers, places with `*`, and the two id searches of ADR 0136
 * D3 (whole strings, which the engine may rewrite, and ids inside longer text, which it only
 * reports).
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';

/** A JSON object. */
export type JsonObject = { [key: string]: Json };

/** One step of a pointer: an object key or a list index. */
export type Segment = string | number;

export function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The RFC 6901 pointer of `segments`. */
export function pointer(segments: readonly Segment[]): string {
  return segments
    .map((segment) => `/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`)
    .join('');
}

/** The segments of an RFC 6901 pointer (`''` is none). Keys stay strings. */
export function parsePointer(text: string): string[] {
  if (text === '') return [];
  if (!text.startsWith('/')) throw new Error(`Not a JSON pointer: ${text}`);
  return text
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** The value at `segments` inside `root`, or `undefined`. A list index may be a string. */
export function valueAt(root: Json | undefined, segments: readonly Segment[]): Json | undefined {
  let node: Json | undefined = root;
  for (const segment of segments) {
    if (Array.isArray(node)) {
      const index = typeof segment === 'number' ? segment : Number(segment);
      if (!Number.isInteger(index) || String(index) !== String(segment)) return undefined;
      node = node[index];
    } else if (isObject(node)) {
      node = Object.hasOwn(node, String(segment)) ? node[String(segment)] : undefined;
    } else return undefined;
  }
  return node;
}

/** Replaces the value at `segments` inside `root` (a clone the caller owns); `root` if empty. */
export function replaceAt(root: Json, segments: readonly Segment[], value: Json): Json {
  if (segments.length === 0) return value;
  const parent = valueAt(root, segments.slice(0, -1));
  const last = segments[segments.length - 1] as Segment;
  if (Array.isArray(parent)) parent[Number(last)] = value;
  else if (isObject(parent)) parent[String(last)] = value;
  return root;
}

/**
 * Every concrete path a place pattern reaches inside `data`, in document order: `*` stands for
 * each key of an object or item of a list.
 */
export function expandPattern(data: Json, pattern: string): Segment[][] {
  let paths: Segment[][] = [[]];
  for (const segment of parsePointer(pattern)) {
    const next: Segment[][] = [];
    for (const path of paths) {
      const node = valueAt(data, path);
      if (segment === '*') {
        if (Array.isArray(node)) {
          for (let index = 0; index < node.length; index++) next.push([...path, index]);
        } else if (isObject(node)) {
          for (const key of Object.keys(node)) next.push([...path, key]);
        }
      } else if (Array.isArray(node) ? /^(0|[1-9][0-9]*)$/.test(segment) : isObject(node)) {
        next.push([...path, Array.isArray(node) ? Number(segment) : segment]);
      }
    }
    paths = next;
  }
  return paths;
}

/** What a removed id looks like to the walk. */
export interface IdEntry<T> {
  /** A tag registry: matched only by `#` references. */
  tag: boolean;
  /** Matched as a whole string only under a `type` key. */
  typeOnly: boolean;
  value: T;
}

/** A lookup from an id without namespace to the entries that remove it. */
export type IdLookup<T> = ReadonlyMap<string, readonly IdEntry<T>[]>;

/** A whole string in element data that names a removed id. */
export interface WholeMatch<T> {
  kind: 'whole';
  segments: Segment[];
  /** The string as written. */
  value: string;
  entry: IdEntry<T>;
}

/** A removed id inside a longer string (a function line, a script, SNBT, a rule's text). */
export interface TextMatch<T> {
  kind: 'text';
  segments: Segment[];
  /** The token as written, `#` and namespace included. */
  value: string;
  /** Where the token starts in the string, from 0. */
  index: number;
  entry: IdEntry<T>;
}

export type IdMatch<T> = WholeMatch<T> | TextMatch<T>;

const NAMESPACE = 'minecraft:';

/**
 * A namespaced `minecraft:` id inside text, with an optional `#`: not preceded by another id
 * character, so `mymod:minecraft:x` and `aminecraft:x` are not matched.
 */
const TEXT_ID = /(?<![A-Za-z0-9_.:/#-])(#?)minecraft:([a-z0-9_./-]+)/g;

/** The id of a whole string, as the walk reads it: `undefined` for another namespace. */
function wholeId(value: string): { id: string; tag: boolean } | undefined {
  const tag = value.startsWith('#');
  let id = tag ? value.slice(1) : value;
  if (id.startsWith(NAMESPACE)) id = id.slice(NAMESPACE.length);
  else if (id.includes(':')) return undefined;
  return { id, tag };
}

/**
 * Every string in `data` that names a removed id, depth first in document order: a whole string
 * (`minecraft:x`, a bare `x` or `#minecraft:x` for a tag) and, inside any other string, each
 * namespaced token (`minecraft:x`, `#minecraft:x`). A `typeOnly` entry is matched only as a whole
 * string under a `type` key; inside text it is never matched, since there the id may name the
 * registry that still has it.
 */
export function findIds<T>(data: Json, lookup: IdLookup<T>): IdMatch<T>[] {
  const matches: IdMatch<T>[] = [];
  const visit = (value: Json, segments: Segment[], key: string | undefined): void => {
    if (typeof value === 'string') {
      const whole = wholeId(value);
      const entries = whole === undefined ? undefined : lookup.get(whole.id);
      if (whole !== undefined && entries !== undefined && entries.length > 0) {
        for (const entry of entries) {
          if (entry.tag !== whole.tag) continue;
          if (entry.typeOnly && key !== 'type') continue;
          matches.push({ kind: 'whole', segments, value, entry });
        }
        return;
      }
      for (const token of value.matchAll(TEXT_ID)) {
        if (token[0] === value) continue;
        const tag = token[1] === '#';
        const id = (token[2] as string).replace(/[./-]+$/, '');
        const written = `${token[1]}${NAMESPACE}${id}`;
        for (const entry of lookup.get(id) ?? []) {
          if (entry.tag !== tag || entry.typeOnly) continue;
          matches.push({ kind: 'text', segments, value: written, index: token.index, entry });
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, [...segments, index], undefined);
      });
      return;
    }
    if (isObject(value)) {
      for (const [name, item] of Object.entries(value)) {
        if (item !== undefined) visit(item, [...segments, name], name);
      }
    }
  };
  visit(data, [], undefined);
  return matches;
}

/** The line (from 1) and column (from 1) of `index` in `text`. */
export function lineAndColumn(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, column: index - before.lastIndexOf('\n') };
}
