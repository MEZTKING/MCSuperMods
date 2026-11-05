/**
 * The shared output merge: combines output files that share a layer and path (ADR 0027).
 *
 * @packageDocumentation
 */

import type {
  Json,
  JsonObject,
  OutputFile,
  OutputMergeMode,
  Problem,
  ResourceLocation,
} from '@msm/plugin-api';
import { ProblemCodes } from '../problems/codes';
import { stableStringify, utf8 } from '../serialise/stable-json';

/** One file offered to {@link mergeOutputFiles}, with who produced it. */
export interface MergeEntry {
  /** The output file. */
  file: OutputFile;
  /**
   * Who produced the file, for messages: an element id, or a description such as
   * `asset ruby:textures/block/ruby.png`.
   */
  source: string;
  /** The element that produced the file, recorded as the problem's `elementId`. */
  elementId?: ResourceLocation;
}

/** Options of {@link mergeOutputFiles}. */
export interface MergeOptions {
  /**
   * The problem code for files that cannot merge (no `merge`, mixed modes or differing
   * schemas). Defaults to `lowering.conflict`.
   */
  conflictCode?: string;
}

/** The result of {@link mergeOutputFiles}. */
export interface MergeOutputResult {
  /** One file per layer and path, sorted by layer and then by path. */
  files: OutputFile[];
  /** Conflict and merge-conflict problems, in input order. */
  problems: Problem[];
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A file's merge key: layer and path. */
function fileKey(file: OutputFile): string {
  return `${file.layer}\u0000${file.path}`;
}

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The file's contents as JSON, or `undefined` when bytes are not UTF-8 JSON. */
function jsonOf(file: OutputFile): Json | undefined {
  if (!(file.contents instanceof Uint8Array)) return file.contents;
  try {
    return JSON.parse(utf8.decode(file.contents)) as Json;
  } catch {
    return undefined;
  }
}

/** The id a tag value names: the string itself, or the `id` of an object entry. */
function tagValueId(value: Json): string | undefined {
  if (typeof value === 'string') return value;
  if (isObject(value) && typeof value.id === 'string') return value.id;
  return undefined;
}

/** Why a group of files at one path cannot merge, or `undefined` when it can. */
function mergeRefusal(group: readonly MergeEntry[]): string | undefined {
  const first = group[0] as MergeEntry;
  const mode = first.file.merge;
  for (const entry of group) {
    if (entry.file.merge === undefined) return `${entry.source} does not declare a merge mode`;
    if (entry.file.merge !== mode) return 'the files declare different merge modes';
    if (entry.file.schema !== first.file.schema) return 'the files declare different schemas';
  }
  return undefined;
}

interface Accumulator {
  mode: OutputMergeMode;
  base: MergeEntry;
  replace: boolean | undefined;
  values: Json[];
  valueIds: Set<string>;
  valueText: Set<string>;
  object: Record<string, { value: Json; source: string }>;
}

function addTag(acc: Accumulator, json: JsonObject): string | undefined {
  const { values, replace } = json;
  if (!Array.isArray(values)) return 'it has no "values" list';
  if (replace !== undefined && typeof replace !== 'boolean') return '"replace" is not a boolean';
  if (replace === true) acc.replace = true;
  else if (replace === false && acc.replace === undefined) acc.replace = false;
  for (const value of values) {
    const id = tagValueId(value);
    if (id !== undefined) {
      if (acc.valueIds.has(id)) continue;
      acc.valueIds.add(id);
    } else {
      const text = stableStringify(value);
      if (acc.valueText.has(text)) continue;
      acc.valueText.add(text);
    }
    acc.values.push(structuredClone(value));
  }
  return undefined;
}

function addObject(
  acc: Accumulator,
  entry: MergeEntry,
  json: JsonObject,
  report: (key: string, owner: string) => void,
): void {
  for (const key of Object.keys(json).sort(compare)) {
    const value = json[key] as Json;
    const existing = acc.object[key];
    if (existing === undefined) {
      acc.object[key] = { value: structuredClone(value), source: entry.source };
    } else if (stableStringify(existing.value) !== stableStringify(value)) {
      report(key, existing.source);
    }
  }
}

function finish(acc: Accumulator): OutputFile {
  const { file } = acc.base;
  let contents: Json;
  if (acc.mode === 'tag') {
    const tag: JsonObject = { values: acc.values };
    if (acc.replace !== undefined) tag.replace = acc.replace;
    contents = tag;
  } else {
    const object: JsonObject = {};
    for (const key of Object.keys(acc.object).sort(compare)) {
      object[key] = (acc.object[key] as { value: Json }).value;
    }
    contents = object;
  }
  const merged: OutputFile = { path: file.path, layer: file.layer, contents, merge: acc.mode };
  if (file.schema !== undefined) merged.schema = file.schema;
  if (file.language !== undefined) merged.language = file.language;
  return merged;
}

function problemFor(entry: MergeEntry, code: string, message: string, path?: string): Problem {
  const problem: Problem = { severity: 'error', code, file: entry.file.path, message };
  if (entry.elementId !== undefined) problem.elementId = entry.elementId;
  if (path !== undefined) problem.path = path;
  return problem;
}

/** RFC 6901 pointer to one top-level key. */
function pointer(key: string): string {
  return `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

/**
 * Merges output files that share a layer and path (ADR 0027).
 *
 * A file alone at its path passes through unchanged. Files at one path merge when every one
 * declares the same {@link OutputFile.merge} mode and the same `schema`:
 *
 * - `tag`: the union of `values` in first-seen order (a string and an `{ id }` entry with the
 *   same id count once; other entries are compared by value) and `replace: true` when any
 *   input says so (`false` when only `false` was written, absent when never written);
 * - `object`: flat key merge; the same key with a different value is a
 *   `lowering.merge-conflict` error naming both sources, and the first value is kept.
 *
 * Merged contents are JSON with sorted object keys. Contents that are not a JSON object (or a
 * tag without a `values` list) are a `lowering.merge-conflict` error and contribute nothing.
 * Otherwise (a file without `merge`, mixed modes or differing schemas) the first file is
 * kept and every other file at that path is a conflict error (`options.conflictCode`,
 * default `lowering.conflict`) naming both sources.
 *
 * @param entries - The files in production order, each with its source.
 * @param options - The conflict problem code.
 * @returns One file per layer and path, sorted by layer then path, and the problems found.
 */
export function mergeOutputFiles(
  entries: readonly MergeEntry[],
  options: MergeOptions = {},
): MergeOutputResult {
  const conflictCode = options.conflictCode ?? ProblemCodes.loweringConflict;
  const groups = new Map<string, MergeEntry[]>();
  for (const entry of entries) {
    const key = fileKey(entry.file);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [entry]);
    else group.push(entry);
  }

  const problems: { index: number; problem: Problem }[] = [];
  const indexOf = new Map<MergeEntry, number>(entries.map((entry, index) => [entry, index]));
  const push = (entry: MergeEntry, problem: Problem): void => {
    problems.push({ index: indexOf.get(entry) ?? 0, problem });
  };

  const files: OutputFile[] = [];
  for (const group of groups.values()) {
    const first = group[0] as MergeEntry;
    if (group.length === 1) {
      files.push(first.file);
      continue;
    }
    const refusal = mergeRefusal(group);
    if (refusal !== undefined) {
      files.push(first.file);
      for (const entry of group.slice(1)) {
        push(
          entry,
          problemFor(
            entry,
            conflictCode,
            `${entry.source} and ${first.source} both produce ${entry.file.layer} file ${entry.file.path} and cannot be merged (${refusal}); only the output of ${first.source} was kept.`,
          ),
        );
      }
      continue;
    }

    const acc: Accumulator = {
      mode: first.file.merge as OutputMergeMode,
      base: first,
      replace: undefined,
      values: [],
      valueIds: new Set(),
      valueText: new Set(),
      object: {},
    };
    for (const entry of group) {
      const json = jsonOf(entry.file);
      const kind = acc.mode === 'tag' ? 'tag file' : 'JSON object';
      let invalid: string | undefined = isObject(json) ? undefined : 'it is not a JSON object';
      if (invalid === undefined && acc.mode === 'tag') {
        invalid = addTag(acc, json as JsonObject);
      } else if (invalid === undefined) {
        addObject(acc, entry, json as JsonObject, (key, owner) => {
          push(
            entry,
            problemFor(
              entry,
              ProblemCodes.loweringMergeConflict,
              `${entry.source} and ${owner} give different values for key ${JSON.stringify(key)} in ${entry.file.layer} file ${entry.file.path}; the value from ${owner} was kept.`,
              pointer(key),
            ),
          );
        });
      }
      if (invalid !== undefined) {
        push(
          entry,
          problemFor(
            entry,
            ProblemCodes.loweringMergeConflict,
            `${entry.source} cannot be merged into ${entry.file.layer} file ${entry.file.path} as a ${kind}: ${invalid}.`,
          ),
        );
      }
    }
    files.push(finish(acc));
  }

  files.sort((a, b) => compare(a.layer, b.layer) || compare(a.path, b.path));
  return {
    files,
    problems: problems.sort((a, b) => a.index - b.index).map((entry) => entry.problem),
  };
}
