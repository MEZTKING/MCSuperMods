/**
 * Pictures the game reads only from fixed places (B538): a villager look's pictures
 * (`villagerTypeTexturePaths` of `@msm/plugin-entities`, ADR 0107 D5) and a boat's
 * (`boatTexturePaths` of `@msm/plugin-blocks-items`, ADR 0110 D1). A plugin names each picture
 * and its fixed place as asset paths; these helpers turn those pairs into the copies a project
 * still needs and into the change items and byte writes of one undo step (the element update
 * and the copies together), as the Profession Studio does (`entities/profession-model.ts`).
 * No React, no session.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import type { ChangeAsset, ChangeItem } from '../changeset/changeset';
import { textureChange } from '../components/ai-pictures/texture-write';

/** A project asset: its namespace and its path under `assets/<namespace>/`. */
export interface PictureAsset {
  namespace: string;
  path: string;
}

/** One picture copy: a project picture and the fixed place the game reads it from. */
export interface PictureCopy {
  from: PictureAsset;
  to: PictureAsset;
}

/** `assets/<ns>/<rest>` as a {@link PictureAsset}, or `undefined`. */
export function pictureAsset(path: string): PictureAsset | undefined {
  const match = /^assets\/([^/]+)\/(.+)$/.exec(path);
  if (match === null) return undefined;
  return { namespace: match[1] as string, path: match[2] as string };
}

/**
 * The copies among `paths` (`from` and `to` as `assets/...` paths): each pair whose picture is a
 * project picture stored somewhere else than its fixed place. Vanilla pictures (`minecraft`) and
 * pictures already in place need none. Duplicate places are kept once.
 */
export function pictureCopiesOf(paths: readonly { from: string; to: string }[]): PictureCopy[] {
  const out: PictureCopy[] = [];
  const seen = new Set<string>();
  for (const { from, to } of paths) {
    if (from === to) continue;
    const source = pictureAsset(from);
    const place = pictureAsset(to);
    if (source === undefined || place === undefined || source.namespace === 'minecraft') continue;
    const key = `${place.namespace}/${place.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: source, to: place });
  }
  return out;
}

/** Whether the project holds the asset. */
export function projectHasAsset(project: Project, ref: PictureAsset): boolean {
  return (
    project.namespaces
      .find((namespace) => namespace.name === ref.namespace)
      ?.assets.some((asset) => asset.path === ref.path) ?? false
  );
}

/** The copies whose picture the project has and whose fixed place it does not hold yet. */
export function missingPictureCopies(
  project: Project,
  copies: readonly PictureCopy[],
): PictureCopy[] {
  return copies.filter(
    (copy) => projectHasAsset(project, copy.from) && !projectHasAsset(project, copy.to),
  );
}

/**
 * The change items and writes of a picture change: the element update (when `after` differs)
 * and each copy's bytes written at its fixed place (an undoable write over an asset the project
 * has, else a new asset). One `applyChanges` step.
 */
export function pictureCopyChange(
  project: Project,
  element: Pick<Element, 'id' | 'kind' | 'data'>,
  after: Json,
  copies: readonly { copy: PictureCopy; bytes: Uint8Array }[],
  itemId: string,
): { items: ChangeItem[]; writes: ChangeAsset[] } {
  const items: ChangeItem[] = [];
  const writes: ChangeAsset[] = [];
  if (JSON.stringify(after) !== JSON.stringify(element.data)) {
    items.push({
      itemId,
      op: 'update',
      elementId: element.id,
      kind: element.kind,
      before: element.data,
      after,
      accepted: true,
      problems: [],
    });
  }
  for (const { copy, bytes } of copies) {
    const change = textureChange(project, copy.to.namespace, copy.to.path, bytes);
    items.push(...change.items);
    writes.push(...change.writes);
  }
  return { items, writes };
}

/** What {@link writeWithPictureCopies} needs from the Studio host. */
export interface PictureCopyHost {
  apply?:
    | ((items: ChangeItem[], label: string, writes: ChangeAsset[]) => Promise<unknown>)
    | undefined;
  read?: ((namespace: string, path: string) => Promise<Uint8Array | null>) | undefined;
}

/**
 * Writes `after` and the picture copies it needs as one undo step through the host; without a
 * host that can write assets it falls back to `fallback(after)` (the element change alone).
 * Rejects with the host's error.
 */
export async function writeWithPictureCopies(
  host: PictureCopyHost,
  project: Project,
  element: Pick<Element, 'id' | 'kind' | 'data'>,
  after: Json,
  copies: readonly PictureCopy[],
  label: string,
  itemId: string,
  fallback: (after: Json) => void,
): Promise<void> {
  const { apply, read } = host;
  if (apply === undefined || read === undefined) {
    fallback(after);
    return;
  }
  const found = await Promise.all(
    copies.map(async (copy) => ({ copy, bytes: await read(copy.from.namespace, copy.from.path) })),
  );
  const ready = found.filter(
    (entry): entry is { copy: PictureCopy; bytes: Uint8Array } => entry.bytes !== null,
  );
  const change = pictureCopyChange(project, element, after, ready, itemId);
  if (change.items.length === 0 && change.writes.length === 0) return;
  await apply(change.items, label, change.writes);
}
