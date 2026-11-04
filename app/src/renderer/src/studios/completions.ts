/**
 * The form's `CompletionSource` for a project: translation keys from the project's language
 * files, registry ids from the target's registry index (vanilla plus project ids), and the
 * project's own textures, models and elements.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import type { RegistryIndex } from '@msm/schemas';
import type { CompletionSource } from '../forms';

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
 * Builds a completion source over `project`.
 *
 * @param project - The open project.
 * @param registries - The registry index for the project, or `null` while schemas load.
 */
export function createCompletionSource(
  project: Project,
  registries: RegistryIndex | null,
): CompletionSource {
  let lang: string[] | null = null;
  let textures: string[] | null = null;
  return {
    suggest(registry, prefix) {
      if (registry === 'translation_key') {
        lang ??= translationKeys(project);
        return pick(lang, prefix);
      }
      return registries === null ? [] : pick(registries.ids(registry), prefix);
    },
    projectIds(kind, prefix) {
      if (kind === 'texture') {
        textures ??= textureIds(project);
        return pick(textures, prefix);
      }
      const ids = project.namespaces
        .flatMap((namespace) => namespace.elements)
        .filter((element) => kind === 'element' || element.kind === 'minecraft:model')
        .map((element) => element.id)
        .sort();
      return pick(ids, prefix);
    },
  };
}
