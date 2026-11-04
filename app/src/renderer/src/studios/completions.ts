/**
 * The form's `CompletionSource` for a project: translation keys from the project's language
 * files, registry ids from the target's registry index (vanilla plus project ids, tag
 * references with a `#` prefix), and the project's own textures, models, elements and data
 * pack ids.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import type { RegistryIndex } from '@msm/schemas';
import { kindRegistry, projectRegistryIds } from '../session/schema-context';

/** At most this many suggestions per call; the form shows fewer. */
const LIMIT = 200;

/** Whether `id` (namespaced) matches what the user typed. */
function matches(id: string, prefix: string): boolean {
  if (prefix === '') return true;
  if (id.startsWith(prefix)) return true;
  const colon = id.indexOf(':');
  return colon !== -1 && !prefix.includes(':') && id.slice(colon + 1).startsWith(prefix);
}

function pick(ids: Iterable<string>, prefix: string): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!matches(id, prefix)) continue;
    out.push(id);
    if (out.length >= LIMIT) break;
  }
  return out;
}

/** Every key of the project's `minecraft:lang` elements, sorted. */
export function translationKeys(project: Project): string[] {
  const keys = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== 'minecraft:lang') continue;
      const data = element.data;
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        for (const key of Object.keys(data)) keys.add(key);
      }
    }
  }
  return [...keys].sort();
}

/** The project's texture ids (`<ns>:block/x` for `assets/<ns>/textures/block/x.png`). */
export function textureIds(project: Project): string[] {
  const ids: string[] = [];
  for (const namespace of project.namespaces) {
    for (const asset of namespace.assets) {
      const match = /^textures\/(.+)\.png$/.exec(asset.path);
      if (match !== null) ids.push(`${namespace.name}:${match[1]}`);
    }
  }
  return ids.sort();
}

/**
 * The form's `CompletionSource` (structurally; declared here so this module does not import
 * the React form package), whose `projectIds` also accepts any registered kind id (for
 * example `minecraft:recipe`) and project registry names (`function`, `recipe`,
 * `loot_table`, `advancement`, `predicate`, `item_modifier`, `tag/<registry>`, …).
 */
export interface ProjectCompletionSource {
  /**
   * Registry ids starting with `prefix`; a `#` prefix suggests tags. With `idPath` (a
   * field's `#[id(path=...)]`, for example `entity/banner/`) only ids under that path are
   * offered, written without it (`ns:entity/banner/x` is offered as `ns:x`).
   */
  suggest(registry: string, prefix: string, idPath?: string): string[];
  /** Project ids of a kind, kind id or registry name starting with `prefix` (and `idPath`). */
  projectIds(kind: string, prefix: string, idPath?: string): string[];
}

/**
 * The ids under `idPath`, written as a field with that path takes them: `ns:<idPath>x`
 * becomes `ns:x` (tag ids, starting with `#`, are kept as they are). Without `idPath` the ids
 * are returned unchanged.
 */
export function stripIdPath(ids: Iterable<string>, idPath: string | undefined): Iterable<string> {
  if (idPath === undefined || idPath === '') return ids;
  const out: string[] = [];
  for (const id of ids) {
    if (id.startsWith('#')) {
      out.push(id);
      continue;
    }
    const colon = id.indexOf(':');
    const namespace = colon === -1 ? 'minecraft' : id.slice(0, colon);
    const path = colon === -1 ? id : id.slice(colon + 1);
    if (path.startsWith(idPath) && path.length > idPath.length) {
      out.push(`${namespace}:${path.slice(idPath.length)}`);
    }
  }
  return out;
}

const TAG_PREFIX = 'tag/';

/**
 * Builds a completion source over `project`.
 *
 * - `suggest(registry, prefix, idPath?)`: ids of `registry` from the registry index. A
 *   prefix starting with `#` suggests tags instead (`#` + ids of `tag/<registry>`, or of
 *   `registry` itself when it already is a `tag/` registry). `suggest('tag/<registry>', p)`
 *   without `#` returns the tag ids without `#` (the Tag Studio adds it). `idPath` keeps
 *   only ids under that path and strips it (see {@link stripIdPath}).
 * - `projectIds(kind, prefix)`: `texture` (project textures), `model` (model elements),
 *   `element` (every element), a kind id (elements of that kind) or a registry name (the
 *   project's ids in that registry).
 *
 * @param project - The open project.
 * @param registries - The registry index for the project, or `null` while schemas load.
 */
export function createCompletionSource(
  project: Project,
  registries: RegistryIndex | null,
): ProjectCompletionSource {
  let lang: string[] | null = null;
  let textures: string[] | null = null;
  let registryIds: Record<string, string[]> | null = null;
  const elements = () => project.namespaces.flatMap((namespace) => namespace.elements);
  return {
    suggest(registry, prefix, idPath) {
      if (registry === 'translation_key') {
        lang ??= translationKeys(project);
        return pick(lang, prefix);
      }
      if (registries === null) return [];
      if (prefix.startsWith('#')) {
        const tags = registry.startsWith(TAG_PREFIX)
          ? registry
          : `${TAG_PREFIX}${kindRegistry(registry)}`;
        return pick(registries.ids(tags), prefix.slice(1)).map((id) => `#${id}`);
      }
      return pick(stripIdPath(registries.ids(registry), idPath), prefix);
    },
    projectIds(kind, prefix, idPath) {
      if (kind === 'texture') {
        textures ??= textureIds(project);
        return pick(stripIdPath(textures, idPath), prefix);
      }
      if (kind === 'element')
        return pick(
          elements()
            .map((element) => element.id)
            .sort(),
          prefix,
        );
      if (kind === 'model' || kind.includes(':')) {
        const kindId = kind === 'model' ? 'minecraft:model' : kind;
        const ids = elements()
          .filter((element) => element.kind === kindId)
          .map((element) => element.id)
          .sort();
        return pick(ids, prefix);
      }
      registryIds ??= projectRegistryIds(project);
      return pick(registryIds[kind] ?? [], prefix);
    },
  };
}
