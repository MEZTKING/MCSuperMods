/**
 * The Structure Studio's link to the processor view (ADR 0122 D6; B641): the mod's processor
 * lists in a picker (first the one a pool places this building with), and the processor view of
 * the list picked, on this building. The view choices (the seed) are kept as the preview
 * panel's are, by project folder; without one, for this run only.
 */

import type { Element, Project } from '@msm/plugin-api';
import { useMemo, useState } from 'react';
import { usePlain } from '../../../components/ui/MoreOptions';
import type { VanillaAssetReader } from '../../../preview/model-chain';
import { wordsOfPath } from '../../frame/item-picture';
import type { VanillaDataReader } from '../../vanilla-data';
import { DEFAULT_PREFS, type LiveViewPrefs, prefsOf, useLiveViewPrefs } from '../../view-prefs';
import { listForTemplate, namespaced, processorLists } from './model';
import ProcessorListView from './ProcessorListView';

export const NO_LISTS_LINE =
  'This mod has no processor lists yet. Add one under World generation to change blocks as this building is placed.';

/** Props of {@link OnTemplate}. */
export interface OnTemplateProps {
  readonly project: Project;
  /** The building's id (the Studio's element). */
  readonly template: string;
  readonly vanilla: VanillaDataReader;
  readonly vanillaAssets?: VanillaAssetReader | null;
  /** The project's folder (the seed is kept per project), or `null`. */
  readonly projectRoot: string | null;
  onSetup(): void;
}

let memoryPrefs: LiveViewPrefs = DEFAULT_PREFS;

/** See the module comment. */
export default function OnTemplate(props: OnTemplateProps) {
  const { project, template } = props;
  const advanced = !usePlain();
  const lists = useMemo(() => processorLists(project), [project]);
  const preferred = useMemo(() => listForTemplate(project, template), [project, template]);
  const [picked, setPicked] = useState<string | null>(null);
  const prefs = useLiveViewPrefs((state) => state.prefs);
  const setPrefs = useLiveViewPrefs((state) => state.setPrefs);
  const [memory, setMemory] = useState<LiveViewPrefs>(memoryPrefs);
  const listId = picked ?? preferred ?? lists[0]?.id ?? null;
  const element: Element | null = useMemo(() => {
    if (listId === null) return null;
    for (const namespace of project.namespaces) {
      for (const entry of namespace.elements) {
        if (entry.id === listId && entry.kind === 'minecraft:worldgen/processor_list') return entry;
      }
    }
    return null;
  }, [project, listId]);

  if (lists.length === 0 || element === null) {
    return (
      <p data-testid="structure-processors-none" className="text-sm text-muted">
        {NO_LISTS_LINE}
      </p>
    );
  }
  const root = props.projectRoot;
  return (
    <div className="flex flex-col gap-2" data-testid="structure-processors-view">
      <label className="flex min-w-0 items-center gap-2 text-sm">
        Processor list
        <select
          data-testid="structure-processors-list"
          className="min-w-0 max-w-full rounded border border-border bg-bg px-1"
          value={element.id}
          onChange={(event) => setPicked(event.target.value)}
        >
          {lists.map(({ id }) => (
            <option key={id} value={id}>
              {advanced ? `${wordsOfPath(id)} (${id})` : wordsOfPath(id)}
              {id === preferred ? ' (placed with this building)' : ''}
            </option>
          ))}
        </select>
      </label>
      <ProcessorListView
        project={project}
        element={element}
        template={namespaced(template)}
        vanilla={props.vanilla}
        vanillaAssets={props.vanillaAssets ?? null}
        preferences={root === null ? memory : prefsOf(prefs, root)}
        onPreferences={(patch) => {
          if (root !== null) {
            setPrefs(root, patch);
            return;
          }
          memoryPrefs = { ...memoryPrefs, ...patch };
          setMemory(memoryPrefs);
        }}
        onSetup={props.onSetup}
      />
    </div>
  );
}
