/**
 * What the Creator's Live tab and the AI helper's See it pane picture (B615; ADR 0120 D7): the
 * elements a bundle or a proposal makes whose kind has a live view, in the order they are made,
 * each with its display name, and the plain line for a set with nothing to picture. Pure; no
 * React, no views (so the review and the Creator import it without a view's code).
 *
 * @packageDocumentation
 */

import type { Element, Project } from '@msm/plugin-api';
import { thingName } from '../components/thing-picker/thing-sources';
import { hasLiveView } from './registry';

/** One thing to picture. */
export interface LiveThing {
  readonly element: Element;
  /** Its display name (`thingName`: the element's own name, else its id in words). */
  readonly name: string;
}

/**
 * The elements of `project` named by `ids` (in that order, each once) whose kind has a live
 * view. Ids not in the project are left out.
 */
export function liveThings(project: Project, ids: readonly string[]): LiveThing[] {
  const byId = new Map<string, Element>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) byId.set(element.id, element);
  }
  const out: LiveThing[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const element = byId.get(id);
    if (element === undefined || !hasLiveView(element.kind)) continue;
    out.push({ element, name: thingName(project, id) });
  }
  return out;
}

/** The line for a set with nothing to picture: "Nothing to picture: 3 files without a view." */
export function nothingToPicture(files: number): string {
  return files === 0
    ? 'Nothing to picture yet.'
    : `Nothing to picture: ${files} file${files === 1 ? '' : 's'} without a view.`;
}

/**
 * A `readProject` (`assets/<ns>/<path>`) over a reader by namespace and path (the Creator's
 * `bundleAssetReader`); other paths answer `null`.
 */
export function readByPath(
  read: (namespace: string, path: string) => Promise<Uint8Array | null>,
): (path: string) => Promise<Uint8Array | null> {
  return async (path) => {
    const match = /^assets\/([^/]+)\/(.+)$/.exec(path);
    if (match === null) return null;
    return await read(match[1] as string, match[2] as string).catch(() => null);
  };
}
