/**
 * Very easy shows no ids (ADR 0083 D3, ADR 0125 D13): the plain words of an id and the field
 * that stands in for an id field there. `ElementForm` provides {@link VeryEasyThingsContext}
 * (the project and its registries) around every Studio; the shared `IdField` and `SelectField`
 * (`structures/pickers.tsx`) read it in Very easy, so a field holding an item, block, mob, sound,
 * particle, effect or dimension becomes a named chip that opens the ThingPicker, and any other id
 * (a model, a picture, a loot table, a biome) is shown as words only. Easy and Advanced keep
 * their id fields.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import { X } from 'lucide-react';
import { createContext, useContext, useMemo, useState } from 'react';
import { VERY_EASY_FORBIDDEN } from '../components/ai/ai-words';
import {
  ThingPicker,
  type ThingPictures,
  type ThingRegistries,
  type ThingSort,
  thingName,
  thingSections,
  thingWords,
} from '../components/thing-picker/ThingPicker';
import { buttonClass, iconButtonClass } from '../components/ui/Button';
import { inputClass } from '../forms';
import { useBlocksItemsStudioHost } from './blocks-items/host';
import { useVeryEasy } from './very-easy';

/** What a Very easy id field reads beyond its own props. */
export interface VeryEasyThings {
  readonly project: Project;
  readonly registries: ThingRegistries;
  /** The target's texture folder under `assets/<namespace>/`. */
  readonly texturesFolder: string;
}

/** The project and its registries for the Very easy id fields; `null` outside `ElementForm`. */
export const VeryEasyThingsContext = createContext<VeryEasyThings | null>(null);

/** The ThingPicker sort of each registry a beginner can pick from by name and picture. */
const REGISTRY_SORTS: Readonly<Record<string, ThingSort>> = Object.freeze({
  item: 'item',
  block: 'block',
  entity_type: 'mob',
  sound_event: 'sound',
  particle_type: 'particle',
  mob_effect: 'effect',
  dimension: 'dimension',
});

/**
 * Registries small enough to pick from a list of names in Very easy (a biome, a creative tab, a
 * potion, a damage type, an attribute, a trade set).
 */
const LISTED_REGISTRIES: ReadonlySet<string> = new Set([
  'worldgen/biome',
  'creative_mode_tab',
  'potion',
  'damage_type',
  'attribute',
  'trade_set',
]);

/** The ids of `registry` to pick by name in Very easy, or `[]` when it is not such a list. */
function listedIds(things: VeryEasyThings | null, registry: string): readonly string[] {
  const name = registry.replace(/^minecraft:/, '');
  return things === null || !LISTED_REGISTRIES.has(name) ? [] : things.registries.ids(name);
}

/** The ThingPicker sort of `registry` (with or without `minecraft:`), if it has one. */
export function registrySort(registry: string): ThingSort | undefined {
  return REGISTRY_SORTS[registry.replace(/^minecraft:/, '')];
}

/** An id as Very easy must never show one (`name:path`, a tag's `#` included). */
const ID_IN_TEXT = /#?\b[a-z0-9_.-]+:[a-z0-9_./-]*[a-z0-9_]/g;

/**
 * The words of an id: a project thing's display name, a tag as "Any forest" or "Supports crops
 * (a group)", else words of its last path part ("Ruby sword").
 */
export function plainIdWords(project: Project | null | undefined, id: string, sort?: ThingSort) {
  const trimmed = id.trim();
  if (trimmed === '') return '';
  if (trimmed.startsWith('#')) {
    const words = thingWords(trimmed.slice(1));
    return /^Is /.test(words) ? `Any ${words.slice(3).toLowerCase()}` : `${words} (a group)`;
  }
  return project === null || project === undefined
    ? thingWords(trimmed, sort)
    : thingName(project, trimmed, sort);
}

/**
 * `text` with every id in it replaced by its words, lower case as in a sentence ("held up,
 * msm:shield blocks" reads "held up, shield blocks"); a clock time such as `1:30` is kept.
 */
export function plainWordsIn(text: string): string {
  return text.replace(ID_IN_TEXT, (match) => {
    if (/^\d+:\d+$/.test(match)) return match;
    // A dotted path with no folder is a sound event ("block.portal.ambient": "Portal ambient").
    const path = match.slice(match.indexOf(':') + 1);
    const sound = path.includes('.') && !path.includes('/') && !match.startsWith('#');
    const words = plainIdWords(null, match, sound ? 'sound' : undefined);
    return words.charAt(0).toLowerCase() + words.slice(1);
  });
}

/** A word or token that only Easy explains: snake_case, a dotted name, a file path, code. */
const TECHNICAL =
  /\b[a-z0-9]+(?:_[a-z0-9]+)+\b|\b[a-z]+\.[a-z_]+\b|\b[a-z_]+\/[a-z_]|[{}$`]|\.png\b/;

/**
 * A copied example's Notes as Very easy says them (ADR 0083 D3): each id in words, and only the
 * sentences that read as plain words after that (a sentence naming a field, a file or a code
 * word is left out); `null` when no sentence is left.
 */
export function plainNotes(text: string): string | null {
  // Split before the ids become words: a sentence may start with an id ("msm:tool makes…").
  const sentences = text
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Za-z#])/)
    .map(plainWordsIn)
    .filter((sentence) => sentence.trim() !== '')
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      return !TECHNICAL.test(sentence) && !VERY_EASY_FORBIDDEN.some((word) => lower.includes(word));
    });
  return sentences.length === 0
    ? null
    : sentences.map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1)).join(' ');
}

/** Vanilla's dimensions by name. */
const VANILLA_DIMENSIONS: Readonly<Record<string, string>> = Object.freeze({
  'minecraft:overworld': 'the Overworld',
  'minecraft:the_nether': 'the Nether',
  'minecraft:the_end': 'the End',
});

/**
 * A world map's choice of world in words (ADR 0083 D3): "minecraft:overworld" reads "The
 * Overworld", "minecraft:the_nether of demo:islands" "The Nether of Islands", a project
 * dimension or world type its display name.
 */
export function plainWorldLabel(project: Project | null | undefined, label: string): string {
  const text = label.replace(ID_IN_TEXT, (match) => {
    const vanilla = VANILLA_DIMENSIONS[match];
    if (vanilla !== undefined) return vanilla;
    return plainIdWords(project, match);
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `text` as Very easy shows it: with its ids in words there, unchanged elsewhere. */
export function usePlainWords(): (text: string) => string {
  const veryEasy = useVeryEasy();
  return veryEasy ? plainWordsIn : keep;
}

const keep = (text: string): string => text;

/**
 * An Easy label split for Very easy: "Planted on (a block or #tag; empty: #minecraft:dirt)"
 * reads "Planted on", and what an empty field means ("Dirt (a group)") becomes its empty words.
 */
export function plainLabel(label: string): { label: string; empty?: string } {
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(label);
  if (match === null) return { label: plainWordsIn(label) };
  const base = match[1] as string;
  const inner = /(?:empty|default):?\s*(.+)$/i.exec(match[2] as string)?.[1]?.trim();
  if (inner === undefined) return { label: base };
  const single = /^#?[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(inner);
  const words = single ? plainIdWords(null, inner) : plainWordsIn(inner);
  return { label: base, empty: words.charAt(0).toUpperCase() + words.slice(1) };
}

/**
 * The Very easy stand-in for an id field: a chip with the thing's name that opens the
 * ThingPicker when the registry has a sort, else the words alone. An empty value reads
 * `emptyLabel` ("None" when absent).
 */
export function VeryEasyIdField(props: {
  label: string;
  value: string;
  registry: string;
  onCommit(text: string): void;
  testId?: string | undefined;
  emptyLabel?: string | undefined;
  className?: string | undefined;
}) {
  const things = useContext(VeryEasyThingsContext);
  const host = useBlocksItemsStudioHost();
  const [open, setOpen] = useState(false);
  const sort = registrySort(props.registry);
  const sections = useMemo(
    () =>
      open && things !== null && sort !== undefined
        ? thingSections({
            project: things.project,
            registries: things.registries,
            sort,
            texturesFolder: things.texturesFolder,
          })
        : [],
    [open, things, sort],
  );
  const pictures = useMemo<ThingPictures | null>(
    () => (host === null ? null : { project: host.thumbnail, revision: host.revision }),
    [host],
  );
  const split = plainLabel(props.label);
  const label = split.label;
  const empty = props.emptyLabel ?? split.empty ?? 'None';
  const words = props.value === '' ? empty : plainIdWords(things?.project, props.value, sort);
  const wrapper = `flex min-w-0 flex-col gap-0.5 text-xs ${props.className ?? ''}`;
  const listed = sort === undefined ? listedIds(things, props.registry) : [];
  if (listed.length > 0) {
    const options =
      props.value === '' || listed.includes(props.value) ? listed : [props.value, ...listed];
    return (
      <label className={wrapper}>
        <span className="text-muted">{label}</span>
        <select
          className={inputClass}
          data-testid={props.testId}
          value={props.value}
          onChange={(event) => props.onCommit(event.target.value)}
        >
          <option value="">{empty}</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {plainIdWords(things?.project, id)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (sort === undefined || things === null) {
    return (
      <div className={wrapper}>
        <span className="text-muted">{label}</span>
        <span className="py-0.5 text-sm" data-testid={props.testId}>
          {words}
        </span>
      </div>
    );
  }
  return (
    <div className={wrapper}>
      <span className="text-muted">{label}</span>
      <button
        type="button"
        className={`${buttonClass} self-start`}
        data-testid={props.testId}
        onClick={() => setOpen(true)}
      >
        {words}
      </button>
      {open && (
        <ThingPicker
          title={`${label}: pick one`}
          sort={sort}
          sections={sections}
          value={props.value === '' ? undefined : props.value}
          pictures={pictures}
          noneLabel={empty}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            props.onCommit(id ?? '');
          }}
        />
      )}
    </div>
  );
}

/**
 * The Very easy stand-in for a list of ids: each thing by name with Remove, and "Add" through
 * the ThingPicker when the registry has a sort (a list of biomes or tags is only shown).
 */
export function VeryEasyIdList(props: {
  label: string;
  ids: readonly string[];
  registry: string;
  onChange(next: string[]): void;
}) {
  const things = useContext(VeryEasyThingsContext);
  const host = useBlocksItemsStudioHost();
  const [open, setOpen] = useState(false);
  const sort = registrySort(props.registry);
  const listed = sort === undefined ? listedIds(things, props.registry) : [];
  const sections = useMemo(
    () =>
      open && things !== null && sort !== undefined
        ? thingSections({
            project: things.project,
            registries: things.registries,
            sort,
            texturesFolder: things.texturesFolder,
          })
        : [],
    [open, things, sort],
  );
  const pictures = useMemo<ThingPictures | null>(
    () => (host === null ? null : { project: host.thumbnail, revision: host.revision }),
    [host],
  );
  return (
    <div className="flex flex-col gap-1">
      {props.ids.length === 0 && <p className="text-muted text-xs">None.</p>}
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {props.ids.map((id, index) => {
          const words = plainIdWords(things?.project, id, sort);
          return (
            <li
              key={`${index}:${id}`}
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-sm"
            >
              <span>{words}</span>
              <button
                type="button"
                aria-label={`Remove ${words}`}
                className={iconButtonClass}
                onClick={() => props.onChange(props.ids.filter((_, at) => at !== index))}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {sort !== undefined && things !== null && (
        <div>
          <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
            Add
          </button>
        </div>
      )}
      {listed.length > 0 && (
        <select
          className={`${inputClass} self-start`}
          aria-label={`Add to ${props.label.toLowerCase()}`}
          value=""
          onChange={(event) => {
            const id = event.target.value;
            if (id !== '' && !props.ids.includes(id)) props.onChange([...props.ids, id]);
          }}
        >
          <option value="">Add…</option>
          {listed
            .filter((id) => !props.ids.includes(id))
            .map((id) => (
              <option key={id} value={id}>
                {plainIdWords(things?.project, id)}
              </option>
            ))}
        </select>
      )}
      {open && sort !== undefined && (
        <ThingPicker
          title={`${props.label}: add one`}
          sort={sort}
          sections={sections}
          pictures={pictures}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            if (id !== null && !props.ids.includes(id)) props.onChange([...props.ids, id]);
          }}
        />
      )}
    </div>
  );
}
