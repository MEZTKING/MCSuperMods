/**
 * The upgrade report's part **Minecraft changed these too** (ADR 0136 D11, brief B823): every
 * thing in the mod whose files replace or add to one of Minecraft's own data or resource pack
 * files that the newer version added, removed, moved or changed, from the target's
 * `changes.vanillaFiles` fact (paths and the kind of change only). Each row says so in plain
 * words with **Show me**; its More options holds the path and, when both versions of Minecraft
 * are set up on this computer, the two versions of Minecraft's own file side by side, read from
 * the user's own game files and never kept.
 *
 * Presentational: the host gives the change sets of the move, each thing's lowered files
 * ({@link elementFilesOf}), and a reader of the user's vanilla files. Shows nothing when no
 * thing is touched. No sentence names a version: versions come from the host.
 *
 * @packageDocumentation
 */

import type {
  Element,
  MaybePromise,
  OutputFile,
  Project,
  TargetChangeSet,
  VanillaFileChanges,
} from '@msm/plugin-api';
import { type ReactNode, useEffect, useState } from 'react';
import { MoreOptions } from '../../ui/MoreOptions';

/** What happened to one of Minecraft's files. */
export type VanillaFileChangeKind = 'added' | 'removed' | 'moved' | 'changed';

/** One thing of the mod and the files it lowers to. */
export interface ElementFiles {
  readonly elementId: string;
  /** Its display name (never an id). */
  readonly name: string;
  readonly files: readonly Pick<OutputFile, 'path' | 'layer' | 'merge'>[];
}

/** One of the mod's files at the path of one of Minecraft's files that changed. */
export interface VanillaFileHit {
  readonly elementId: string;
  readonly name: string;
  /** The path, as in the game's jar and in a pack. */
  readonly path: string;
  readonly change: VanillaFileChangeKind;
  /** For `moved`: where Minecraft's file is now. */
  readonly movedTo?: string;
  /** `replaces`: the mod's file takes the place of Minecraft's; `adds-to`: it merges in. */
  readonly how: 'replaces' | 'adds-to';
}

const ORDER: Record<VanillaFileChangeKind, number> = { changed: 0, removed: 1, moved: 2, added: 3 };

/** The change sets' vanilla file lists, in order (sets without one are skipped). */
export function vanillaFileListsOf(
  changeSets: readonly (TargetChangeSet | undefined)[],
): VanillaFileChanges[] {
  return changeSets.flatMap((set) => (set?.vanillaFiles === undefined ? [] : [set.vanillaFiles]));
}

/**
 * The mod's files at paths of Minecraft's that changed, one per thing and path. Over a chain of
 * moves the first step that names a path decides its kind. Files of the `msm` layer never match.
 */
export function vanillaFileHits(
  lists: readonly VanillaFileChanges[],
  elements: readonly ElementFiles[],
): VanillaFileHit[] {
  const kinds = new Map<string, { change: VanillaFileChangeKind; movedTo?: string }>();
  for (const list of lists) {
    const note = (path: string, change: VanillaFileChangeKind, movedTo?: string): void => {
      if (!kinds.has(path))
        kinds.set(path, movedTo === undefined ? { change } : { change, movedTo });
    };
    for (const path of list.changed) note(path, 'changed');
    for (const path of list.removed) note(path, 'removed');
    for (const [path, to] of Object.entries(list.moved)) note(path, 'moved', to);
    for (const path of list.added) note(path, 'added');
  }
  const hits: VanillaFileHit[] = [];
  const seen = new Set<string>();
  for (const element of elements) {
    for (const file of element.files) {
      if (file.layer === 'msm') continue;
      const kind = kinds.get(file.path);
      const key = `${element.elementId}\u0000${file.path}`;
      if (kind === undefined || seen.has(key)) continue;
      seen.add(key);
      hits.push({
        elementId: element.elementId,
        name: element.name,
        path: file.path,
        change: kind.change,
        ...(kind.movedTo === undefined ? {} : { movedTo: kind.movedTo }),
        how: file.merge === undefined ? 'replaces' : 'adds-to',
      });
    }
  }
  return hits.sort(
    (a, b) =>
      ORDER[a.change] - ORDER[b.change] ||
      a.name.localeCompare(b.name) ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
}

/**
 * Each thing's lowered files, for {@link vanillaFileHits}: `lower` is the kind's own lowering on
 * the target (after the project's expanders, as Where it goes uses it); a thing whose lowering
 * fails is left out.
 */
export async function elementFilesOf(
  project: Project,
  lower: (element: Element) => MaybePromise<readonly OutputFile[] | undefined>,
  nameOf: (element: Element) => string,
): Promise<ElementFiles[]> {
  const out: ElementFiles[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      let files: readonly OutputFile[] | undefined;
      try {
        files = await lower(element);
      } catch {
        files = undefined;
      }
      if (files === undefined || files.length === 0) continue;
      out.push({
        elementId: element.id,
        name: nameOf(element),
        files: files.map((file) => ({
          path: file.path,
          layer: file.layer,
          ...(file.merge === undefined ? {} : { merge: file.merge }),
        })),
      });
    }
  }
  return out;
}

/** The plain sentence for a hit (no version, id or path in it). */
export function vanillaFileSentence(hit: Pick<VanillaFileHit, 'change' | 'how'>): string {
  switch (hit.change) {
    case 'changed':
      return hit.how === 'replaces'
        ? 'Minecraft changed this one too. Yours still takes the place of the game’s own, so check that yours has what the new one added.'
        : 'Minecraft changed this one too. Yours adds to the game’s own, so check that the two still fit together.';
    case 'removed':
      return 'Minecraft no longer has this one. Yours is now a file of its own rather than a replacement.';
    case 'moved':
      return 'Minecraft moved this one to another place. Yours no longer takes the place of the game’s own.';
    case 'added':
      return hit.how === 'replaces'
        ? 'Minecraft now has its own file here. Yours takes its place.'
        : 'Minecraft now has its own file here. Yours adds to it.';
  }
}

/** Reads one of Minecraft's own files of a version from this computer, or `null` without it. */
export type ReadVanillaFile = (mcVersion: string, path: string) => Promise<Uint8Array | null>;

/** Props of {@link VanillaFiles}. */
export interface VanillaFilesProps {
  /** From {@link vanillaFileHits}. */
  hits: readonly VanillaFileHit[];
  /** Opens the thing (as Things to fix's Show me does). */
  onShow(elementId: string): void;
  /** The Minecraft versions moved from and to, for the side-by-side (never in a sentence). */
  fromVersion: string;
  toVersion: string;
  /** Reads Minecraft's own file of each version; without it there is no side-by-side. */
  readVanillaFile?: ReadVanillaFile;
}

const TEXT_FILE = /\.(json|mcmeta|mcfunction|txt|fsh|vsh|glsl|properties)$/;
const PICTURE_FILE = /\.png$/;

type Side = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; bytes: Uint8Array };

function SideView(props: { side: Side; path: string; label: string; testId: string }) {
  const { side, path } = props;
  const [url, setUrl] = useState<string | null>(null);
  const bytes = side.status === 'ready' ? side.bytes : undefined;
  useEffect(() => {
    if (
      bytes === undefined ||
      !PICTURE_FILE.test(path) ||
      typeof URL.createObjectURL !== 'function'
    )
      return;
    const made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [bytes, path]);
  let body: ReactNode;
  if (side.status === 'loading') body = <p className="text-muted text-xs">Reading…</p>;
  else if (side.status === 'missing') body = <p className="text-muted text-xs">Not here.</p>;
  else if (TEXT_FILE.test(path)) {
    body = (
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
        {new TextDecoder().decode(side.bytes)}
      </pre>
    );
  } else if (PICTURE_FILE.test(path) && url !== null) {
    body = <img src={url} alt={props.label} className="max-h-32 [image-rendering:pixelated]" />;
  } else body = <p className="text-muted text-xs">This kind of file is not shown.</p>;
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1" data-testid={props.testId}>
      <figcaption className="font-medium text-xs">{props.label}</figcaption>
      {body}
    </figure>
  );
}

/** Minecraft's own file of both versions side by side, read on demand and never kept. */
function SideBySide(props: {
  hit: VanillaFileHit;
  fromVersion: string;
  toVersion: string;
  read: ReadVanillaFile;
  testId: string;
}) {
  const { hit, fromVersion, toVersion, read } = props;
  const newPath = hit.movedTo ?? hit.path;
  const [sides, setSides] = useState<[Side, Side] | null>(null);
  const shown = sides !== null;
  useEffect(() => {
    if (!shown) return;
    let live = true;
    const get = async (version: string, path: string): Promise<Side> => {
      try {
        const bytes = await read(version, path);
        return bytes === null ? { status: 'missing' } : { status: 'ready', bytes };
      } catch {
        return { status: 'missing' };
      }
    };
    void Promise.all([
      hit.change === 'added'
        ? Promise.resolve<Side>({ status: 'missing' })
        : get(fromVersion, hit.path),
      hit.change === 'removed'
        ? Promise.resolve<Side>({ status: 'missing' })
        : get(toVersion, newPath),
    ]).then((both) => {
      if (live) setSides(both);
    });
    return () => {
      live = false;
    };
  }, [shown, hit, fromVersion, toVersion, newPath, read]);
  if (sides === null) {
    return (
      <button
        type="button"
        className="self-start rounded px-1.5 py-0.5 text-accent text-xs underline-offset-2 hover:underline"
        data-testid={`${props.testId}-compare`}
        onClick={() => setSides([{ status: 'loading' }, { status: 'loading' }])}
      >
        Compare Minecraft’s two versions of it
      </button>
    );
  }
  const neither = sides[0].status === 'missing' && sides[1].status === 'missing';
  return (
    <div className="flex flex-col gap-1" data-testid={`${props.testId}-sides`}>
      {neither ? (
        <p className="text-muted text-xs" data-testid={`${props.testId}-not-set-up`}>
          Minecraft’s own copies are read from the game on this computer: set up both versions to
          compare them.
        </p>
      ) : (
        <div className="flex gap-2">
          <SideView
            side={sides[0]}
            path={hit.path}
            label={fromVersion}
            testId={`${props.testId}-before`}
          />
          <SideView
            side={sides[1]}
            path={newPath}
            label={toVersion}
            testId={`${props.testId}-after`}
          />
        </div>
      )}
    </div>
  );
}

/** The part: one row per touched thing and file; nothing when no thing is touched. */
export function VanillaFiles(props: VanillaFilesProps) {
  if (props.hits.length === 0) return null;
  return (
    <section
      aria-labelledby="upgrade-vanilla-files-title"
      data-testid="upgrade-vanilla-files"
      className="flex flex-col gap-2"
    >
      <h3 id="upgrade-vanilla-files-title" className="font-medium text-sm">
        Minecraft changed these too ({props.hits.length})
      </h3>
      <p className="text-muted text-xs">
        These things in your mod take the place of, or add to, files of Minecraft’s own that the new
        version changed.
      </p>
      <ul className="flex flex-col gap-2">
        {props.hits.map((hit, index) => {
          const testId = `upgrade-vanilla-file-${index}`;
          return (
            <li
              key={`${hit.elementId} ${hit.path}`}
              className="flex flex-col gap-1"
              data-testid={testId}
              data-change={hit.change}
            >
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-medium text-sm" data-testid={`${testId}-name`}>
                  {hit.name}
                </span>
                <button
                  type="button"
                  className="cursor-pointer rounded px-1.5 py-0.5 text-accent text-xs underline-offset-2 hover:underline"
                  data-testid={`${testId}-show`}
                  onClick={() => props.onShow(hit.elementId)}
                >
                  Show me
                </button>
              </div>
              <p className="text-sm" data-testid={`${testId}-text`}>
                {vanillaFileSentence(hit)}
              </p>
              <MoreOptions storageKey={`upgrade-vanilla-file-${index}`}>
                <p className="text-xs" data-testid={`${testId}-path`}>
                  <code>{hit.path}</code>
                  {hit.movedTo !== undefined && (
                    <>
                      {' '}
                      is now <code>{hit.movedTo}</code>
                    </>
                  )}{' '}
                  ({hit.change}, {hit.how === 'replaces' ? 'replaced' : 'added to'} by{' '}
                  <code>{hit.elementId}</code>)
                </p>
                {props.readVanillaFile !== undefined && (
                  <SideBySide
                    hit={hit}
                    fromVersion={props.fromVersion}
                    toVersion={props.toVersion}
                    read={props.readVanillaFile}
                    testId={testId}
                  />
                )}
              </MoreOptions>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
