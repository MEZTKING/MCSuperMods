/**
 * Tag Studio: edits a tag file (`{ replace?, values: (id | { id, required })[] }`) as a
 * `replace` switch and an ordered entry list with id and `#tag` suggestions. Presentational:
 * props and callbacks only. With {@link TagStudioProps.live} it shows **Everything in it**
 * beside the editor (B612): the live view of the tag resolved as the game loads it, again
 * 150 ms after each edit (`liveviews/data/tag/TagMembers.tsx`, loaded when first shown).
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Button, iconButtonClass } from '../components/ui/Button';
import {
  type ChangeOptions,
  type FormProblem,
  IdDraftInput,
  IdInput,
  idSuggestions,
  isWithin,
  ProblemList,
  type SuggestIds,
} from '../forms';
import { createVanillaDataReader, NOT_SET_UP_VANILLA_DATA } from '../liveviews/vanilla-data';
import { DEFAULT_PREFS } from '../liveviews/view-prefs';
import { useUiStore } from '../store/ui-store';
import { useBlocksItemsStudioHost } from './blocks-items/host';

const TagMembersView = lazy(() =>
  import('../liveviews/data/tag/TagMembers').then((module) => ({ default: module.TagMembersView })),
);

type JsonObject = { [key: string]: Json };

/** One tag entry as the Studio shows it. */
export interface TagEntry {
  id: string;
  /** `false` only for the `{ id, required: false }` form. */
  required: boolean;
}

/** Reads a tag value entry (a string, or `{ id, required }`); `undefined` when malformed. */
export function readTagEntry(value: Json | undefined): TagEntry | undefined {
  if (typeof value === 'string') return { id: value, required: true };
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const id = value.id;
    if (typeof id !== 'string') return undefined;
    return { id, required: value.required !== false };
  }
  return undefined;
}

/** Writes an entry back: a plain string unless it is optional. */
export function writeTagEntry(entry: TagEntry): Json {
  return entry.required ? entry.id : { id: entry.id, required: false };
}

/** What the Tag Studio needs to show the tag live beside the editor (B612). */
export interface TagStudioLive {
  readonly project: Project;
  readonly element: Element;
  /** The project's Minecraft version (vanilla's tags are read for it), or `null`. */
  readonly mcVersion: string | null;
  /** Every id of the tag's registry (the session's registry index), or `null` while loading. */
  readonly registryIds: readonly string[] | null;
}

/** The words shown when the Minecraft folder is asked for from the Studio. */
export const TAG_SET_UP_WORDS =
  'Open Settings and choose your Minecraft folder to see Minecraft’s own tags here.';

/** Splits a jar path `assets/<ns>/<rest>` for the host's project asset reader. */
function projectAssetPath(path: string): { namespace: string; rest: string } | null {
  const match = /^assets\/([^/]+)\/(.+)$/.exec(path);
  return match === null ? null : { namespace: match[1] as string, rest: match[2] as string };
}

/** The live view beside the editor. */
function TagLive({ live }: { live: TagStudioLive }) {
  const host = useBlocksItemsStudioHost();
  const vanillaAssets = host?.modelPreview?.vanilla ?? null;
  const readAsset = host?.modelPreview?.readProjectAsset;
  const { mcVersion } = live;
  const cacheReady = vanillaAssets !== null;
  const vanilla = useMemo(
    () =>
      cacheReady && mcVersion !== null
        ? createVanillaDataReader({ mcVersion })
        : NOT_SET_UP_VANILLA_DATA,
    [cacheReady, mcVersion],
  );
  const readProject = useMemo(
    () =>
      readAsset === undefined
        ? undefined
        : (path: string) => {
            const parts = projectAssetPath(path);
            return parts === null
              ? Promise.resolve(null)
              : readAsset(parts.namespace, parts.rest).catch(() => null);
          },
    [readAsset],
  );
  return (
    <aside
      aria-label="Everything in it"
      data-testid="tag-studio-live"
      className="min-w-72 flex-1 rounded border border-border p-2"
    >
      <Suspense fallback={<p className="text-sm text-muted">Loading view…</p>}>
        <TagMembersView
          project={live.project}
          element={live.element}
          vanilla={vanilla}
          vanillaAssets={vanillaAssets}
          registryIds={live.registryIds}
          {...(readProject === undefined ? {} : { readProject })}
          preferences={DEFAULT_PREFS}
          onPreferences={() => {}}
          onSetup={() => useUiStore.getState().setMessage({ kind: 'info', text: TAG_SET_UP_WORDS })}
        />
      </Suspense>
    </aside>
  );
}

export interface TagStudioProps {
  data: Json;
  /** The registry the tag lists (`item`, `block`, ...); `#` entries are `tag/<registry>` ids. */
  registry: string;
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
  /** Registry ids starting with a prefix, e.g. `suggest('item', 'minecraft:st')`. */
  suggest?: SuggestIds;
  problems?: readonly FormProblem[];
  /** Shows the tag live beside the editor; without it, the editor alone. */
  live?: TagStudioLive;
}

export function TagStudio(props: TagStudioProps) {
  const editor = <TagEditor {...props} />;
  if (props.live === undefined) return editor;
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-72 flex-1">{editor}</div>
      <TagLive live={props.live} />
    </div>
  );
}

function TagEditor({ data, registry, onChange, suggest, problems }: TagStudioProps) {
  const tag: JsonObject =
    typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {};
  const values: Json[] = Array.isArray(tag.values) ? tag.values : [];
  const [draft, setDraft] = useState('');
  const suggestions = (text: string) => idSuggestions(suggest, registry, text);

  const setValues = (next: Json[]) => onChange('/values', next);
  const add = () => {
    const id = draft.trim();
    if (id === '') return;
    if (Array.isArray(tag.values)) onChange('/values/-', id);
    else setValues([id]);
    setDraft('');
  };
  const move = (from: number, to: number) => {
    const next = [...values];
    const [entry] = next.splice(from, 1);
    if (entry === undefined) return;
    next.splice(to, 0, entry);
    setValues(next);
  };
  const own = (pointer: string) =>
    (problems ?? []).filter((problem) => isWithin(problem.path, pointer));

  return (
    <section
      aria-label={`${registry} tag`}
      data-testid="tag-studio"
      className="flex flex-col gap-2 px-2"
    >
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          data-testid="tag-replace"
          checked={tag.replace === true}
          onChange={(event) => onChange('/replace', event.target.checked)}
        />
        Replace entries from lower-priority packs
      </label>
      <ProblemList problems={own('/replace')} />
      <ol aria-label="Entries" className="flex flex-col gap-1">
        {values.map((value, index) => {
          const entry = readTagEntry(value);
          const pointer = `/values/${index}`;
          const name = `Entry ${index + 1}`;
          return (
            <li key={index} data-testid={`tag-entry-${index}`} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                {entry === undefined ? (
                  <code className="text-error text-xs">{JSON.stringify(value)}</code>
                ) : (
                  <>
                    <IdInput
                      value={entry.id}
                      onCommit={(text) =>
                        onChange(pointer, writeTagEntry({ ...entry, id: text.trim() }))
                      }
                      suggestions={suggestions}
                      label={name}
                      invalid={own(pointer).some((problem) => problem.severity === 'error')}
                      className="max-w-80 font-mono"
                    />
                    <label className="flex shrink-0 items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        aria-label={`${name} optional`}
                        checked={!entry.required}
                        onChange={(event) =>
                          onChange(
                            pointer,
                            writeTagEntry({ ...entry, required: !event.target.checked }),
                          )
                        }
                      />
                      Optional
                    </label>
                  </>
                )}
                <button
                  type="button"
                  aria-label={`Move ${name} up`}
                  className={iconButtonClass}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${name} down`}
                  className={iconButtonClass}
                  disabled={index === values.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  className={iconButtonClass}
                  onClick={() => onChange(pointer, undefined)}
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
              <ProblemList problems={own(pointer)} />
            </li>
          );
        })}
      </ol>
      {values.length === 0 && <p className="text-muted text-sm">No entries yet.</p>}
      <div className="flex items-center gap-1">
        <IdDraftInput
          value={draft}
          onChange={setDraft}
          onSubmit={add}
          suggestions={suggestions}
          label="New entry"
          testId="tag-new-entry"
          placeholder={`minecraft:... or #minecraft:...`}
          className="max-w-80 font-mono"
        />
        <Button
          className="text-xs"
          data-testid="tag-add"
          onClick={add}
          disabled={draft.trim() === ''}
        >
          <Plus size={12} aria-hidden />
          Add
        </Button>
      </div>
      <ProblemList
        problems={(problems ?? []).filter(
          (problem) => problem.path === '' || problem.path === '/values',
        )}
      />
    </section>
  );
}
