/**
 * Pure helpers of the Profession Studio (ADR 0098 D2, ADR 0101 D1): which of a profession's
 * pictures must be copied to the fixed paths the game reads (`professionTexturePaths` of
 * `@msm/plugin-entities`), and the change items and byte writes of choosing a picture, so the
 * field and the copies are one undo step (as the sign's writing screen picture, ADR 0094 D6).
 * No React, no session.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { professionTexturePaths } from '@msm/plugin-entities';
import type { ChangeAsset, ChangeItem } from '../../changeset/changeset';
import { textureChange } from '../../components/ai-pictures/texture-write';
import { asObject } from '../blocks-items/blocks-items-model';

type JsonObject = { [key: string]: Json };

/** A project asset: its namespace and its path under `assets/<namespace>/`. */
export interface AssetRef {
  namespace: string;
  path: string;
}

/** One picture copy: a project picture and the fixed place the game reads it from. */
export interface ProfessionPictureCopy {
  from: AssetRef;
  to: AssetRef;
}

/** `assets/<ns>/<rest>` as an {@link AssetRef}, or `undefined`. */
function assetRef(path: string): AssetRef | undefined {
  const match = /^assets\/([^/]+)\/(.+)$/.exec(path);
  if (match === null) return undefined;
  return { namespace: match[1] as string, path: match[2] as string };
}

/**
 * The copies a profession needs: each picture (`textures.villager`, `textures.zombie_villager`,
 * the zombie's defaulting to the villager's) that is a project picture stored somewhere else
 * than the fixed path the game reads. Vanilla pictures and pictures already in place need none.
 */
export function professionPictureCopies(
  target: Pick<TargetFacts, 'folders'>,
  element: Pick<Element, 'id' | 'kind' | 'data'>,
): ProfessionPictureCopy[] {
  let paths: ReturnType<typeof professionTexturePaths>;
  try {
    paths = professionTexturePaths(target, element as Element);
  } catch {
    return [];
  }
  const out: ProfessionPictureCopy[] = [];
  for (const { from, to } of paths) {
    if (from === to) continue;
    const source = assetRef(from);
    const place = assetRef(to);
    if (source === undefined || place === undefined || source.namespace === 'minecraft') continue;
    out.push({ from: source, to: place });
  }
  return out;
}

/** Whether the project holds the asset. */
export function hasAsset(project: Project, ref: AssetRef): boolean {
  return (
    project.namespaces
      .find((namespace) => namespace.name === ref.namespace)
      ?.assets.some((asset) => asset.path === ref.path) ?? false
  );
}

/** The copies whose fixed place the project does not hold yet. */
export function missingPictureCopies(
  project: Project,
  target: Pick<TargetFacts, 'folders'>,
  element: Pick<Element, 'id' | 'kind' | 'data'>,
): ProfessionPictureCopy[] {
  return professionPictureCopies(target, element).filter(
    (copy) => hasAsset(project, copy.from) && !hasAsset(project, copy.to),
  );
}

/** Profession data with picture `slot` set (`''` removes it, and `textures` when empty). */
export function withPicture(
  data: Json | undefined,
  slot: 'villager' | 'zombie_villager',
  value: string,
): JsonObject {
  const object = asObject(data);
  const textures: JsonObject = { ...asObject(object.textures) };
  if (value === '') delete textures[slot];
  else textures[slot] = value;
  const out: JsonObject = { ...object, textures };
  if (Object.keys(textures).length === 0) delete out.textures;
  return out;
}

/**
 * The change items and writes of a picture change: the element update (when `after` differs)
 * and each copy's bytes written at its fixed place (an undoable write over an asset the project
 * has, else a new asset). One `applyChanges` step.
 */
export function pictureChange(
  project: Project,
  element: Pick<Element, 'id' | 'kind' | 'data'>,
  after: Json,
  copies: readonly { copy: ProfessionPictureCopy; bytes: Uint8Array }[],
): { items: ChangeItem[]; writes: ChangeAsset[] } {
  const items: ChangeItem[] = [];
  const writes: ChangeAsset[] = [];
  if (JSON.stringify(after) !== JSON.stringify(element.data)) {
    items.push({
      itemId: 'profession-picture-field',
      op: 'update',
      elementId: element.id,
      kind: element.kind,
      before: element.data,
      after,
      accepted: true,
      problems: [],
    });
  }
  const seen = new Set<string>();
  for (const { copy, bytes } of copies) {
    const key = `${copy.to.namespace}/${copy.to.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const change = textureChange(project, copy.to.namespace, copy.to.path, bytes);
    items.push(...change.items);
    writes.push(...change.writes);
  }
  return { items, writes };
}
