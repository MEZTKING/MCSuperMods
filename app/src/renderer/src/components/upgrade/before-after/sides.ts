/**
 * What the before and after views of a move compare (ADR 0136 D13, B819): a thing's lowered
 * files on each side, whether they are the same (then the report says "looks the same" in words
 * and draws nothing), the text difference of each file, which view draws the thing, and which
 * pair is open (one at a time, the Showcase's rule).
 *
 * Pure but for the small store of the open pair. Nothing here names a Minecraft version.
 *
 * @packageDocumentation
 */

import type { Element, Json, OutputFile, Project } from '@msm/plugin-api';
import { useCallback, useSyncExternalStore } from 'react';
import { hasLiveView } from '../../../liveviews/registry';
import { armourPreviewOf } from '../../../preview/armour-preview';
import { isPreviewKind, modelFieldSubject } from '../../../preview/PreviewPanel';
import { type DiffLine, lineDiff } from '../../ai/line-diff';

/** One side's file: where it goes and what is in it. */
export type SideFile = Pick<OutputFile, 'path' | 'layer' | 'contents'>;

/** The key a file is matched by on the two sides. */
const fileKey = (file: Pick<OutputFile, 'path' | 'layer'>): string => `${file.layer}:${file.path}`;

/**
 * A thing's files on one side: the files its kind lowers it to, each read from the whole
 * lowered set at the same layer and path when it is there (so a tag merged with others shows as
 * the game reads it), else as the thing lowered it.
 *
 * @param own - The thing's own lowered files, or `undefined` when it is not on this side.
 * @param all - Every lowered file of the side (the dry run's `filesBefore` or `filesAfter`).
 */
export function sideFiles(
  own: readonly OutputFile[] | undefined,
  all: readonly OutputFile[] | undefined,
): SideFile[] {
  if (own === undefined) return [];
  const byKey = new Map((all ?? []).map((file) => [fileKey(file), file]));
  return own
    .map((file) => byKey.get(fileKey(file)) ?? file)
    .map((file) => ({ path: file.path, layer: file.layer, contents: file.contents }))
    .sort((a, b) => (fileKey(a) < fileKey(b) ? -1 : fileKey(a) > fileKey(b) ? 1 : 0));
}

/** JSON with sorted keys, so two equal values give one text. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : item,
  );
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

/** Whether two files hold the same contents. */
export function sameContents(a: SideFile['contents'], b: SideFile['contents']): boolean {
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    return a instanceof Uint8Array && b instanceof Uint8Array && sameBytes(a, b);
  }
  return canonical(a) === canonical(b);
}

/** Whether both sides have the same files with the same contents (and at least one file). */
export function sameFiles(before: readonly SideFile[], after: readonly SideFile[]): boolean {
  if (before.length === 0 || before.length !== after.length) return false;
  return before.every((file, index) => {
    const other = after[index] as SideFile;
    return fileKey(file) === fileKey(other) && sameContents(file.contents, other.contents);
  });
}

/** Text files are read as UTF-8; anything else is a picture or other binary file. */
const TEXT_PATH = /\.(json|mcmeta|mcfunction|txt|ts|js|fsh|vsh|glsl|properties)$/;

/** A file's text (JSON pretty, two spaces), or `null` for a binary file. */
export function fileText(file: SideFile): string | null {
  if (file.contents instanceof Uint8Array) {
    return TEXT_PATH.test(file.path) ? new TextDecoder().decode(file.contents) : null;
  }
  return JSON.stringify(JSON.parse(canonical(file.contents)) as Json, null, 2);
}

/** One file of the text difference. */
export interface FileDifference {
  readonly path: string;
  readonly layer: string;
  /** `same`, `changed`, `added` (only after the move) or `removed` (only before it). */
  readonly status: 'same' | 'changed' | 'added' | 'removed';
  /** The line difference; absent for a binary file. */
  readonly lines?: readonly DiffLine[];
}

/** The text difference of two sides' files, by layer and path. */
export function fileDifferences(
  before: readonly SideFile[],
  after: readonly SideFile[],
): FileDifference[] {
  const beforeByKey = new Map(before.map((file) => [fileKey(file), file]));
  const afterByKey = new Map(after.map((file) => [fileKey(file), file]));
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort();
  return keys.map((key) => {
    const old = beforeByKey.get(key);
    const now = afterByKey.get(key);
    const file = (now ?? old) as SideFile;
    const status =
      old === undefined
        ? 'added'
        : now === undefined
          ? 'removed'
          : sameContents(old.contents, now.contents)
            ? 'same'
            : 'changed';
    const oldText = old === undefined ? '' : fileText(old);
    const nowText = now === undefined ? '' : fileText(now);
    return {
      path: file.path,
      layer: file.layer,
      status,
      ...(oldText === null || nowText === null ? {} : { lines: lineDiff(oldText, nowText) }),
    };
  });
}

/** Which view draws a thing twice: the world map's compare, the preview panel, or none. */
export type PairView = 'worldgen' | 'panel' | 'none';

/**
 * The view a thing is drawn with: the live world map for a `worldgen_map` kind, the preview
 * panel for a kind it previews (its preview kind, a registered live view, a custom block or
 * item's model, an armour look or a recipe), else none (the text difference stands in).
 *
 * @param previewKind - The kind's `previewKind`.
 */
export function pairViewOf(
  element: Element,
  project: Project,
  previewKind: string | undefined,
): PairView {
  if (previewKind === 'worldgen_map') return 'worldgen';
  if (
    isPreviewKind(previewKind) ||
    hasLiveView(element.kind) ||
    modelFieldSubject(element, project) !== null ||
    armourPreviewOf(element, project) !== null ||
    element.kind === 'minecraft:recipe'
  ) {
    return 'panel';
  }
  return 'none';
}

/** The preview kind the panel is given: a registered live view when the kind names none. */
export function panelPreviewKind(
  kind: string,
  previewKind: string | undefined,
): string | undefined {
  return !isPreviewKind(previewKind) && hasLiveView(kind) ? 'live_view' : previewKind;
}

/** The element with `id` in `project`, or `undefined`. */
export function elementOf(project: Project, id: string): Element | undefined {
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) if (element.id === id) return element;
  }
  return undefined;
}

// --- The open pair: one at a time ---------------------------------------------------------

let openKey: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens the pair `key` (closing any other), or closes every pair with `null`. */
export function setOpenPair(key: string | null): void {
  if (openKey === key) return;
  openKey = key;
  for (const listener of listeners) listener();
}

/** The key of the open pair, or `null`. */
export function openPair(): string | null {
  return openKey;
}

/** Whether pair `key` is open, and a setter that opens it (closing the other) or closes it. */
export function usePair(key: string): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, () => openKey === key);
  const set = useCallback(
    (next: boolean) => {
      if (next) setOpenPair(key);
      else if (openKey === key) setOpenPair(null);
    },
    [key],
  );
  return [open, set];
}
