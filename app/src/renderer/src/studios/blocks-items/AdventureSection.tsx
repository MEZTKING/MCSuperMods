/**
 * The Item Studio's "Adventure mode" section (ADR 0117 Y16; `adventure-model.ts`): two lists,
 * **Can break** and **Can place on**, the vanilla components `minecraft:can_break` and
 * `minecraft:can_place_on` in the item's `msm:components`. A block is added with the
 * ThingPicker (block sort: the project's own blocks and Minecraft's, by name and picture), a
 * group of blocks (a block tag) from a list by name. Every mode shows names; Advanced adds the
 * id after each. Each change is one undo step. Its live view is the item's tooltip, drawn below
 * the lists with the lines the game adds ("Can break:", "Can be placed on:" and a line per block).
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import type { JsonObject } from '@msm/plugin-api';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  ThingPicker,
  type ThingPictures,
  type ThingRegistries,
  thingName,
  thingSections,
} from '../../components/thing-picker/ThingPicker';
import { buttonClass, iconButtonClass } from '../../components/ui/Button';
import { type FormProblem, inputClass } from '../../forms';
import { Tooltip, type TooltipLine } from '../../liveviews/frame/Tooltip';
import { usePreferences } from '../../store/preferences';
import { plainIdWords } from '../very-easy-things';
import { Section } from '../worldgen/parts';
import {
  ADVENTURE_TOOLTIP_HEADERS,
  type AdventureComponent,
  adventureListOf,
  CAN_BREAK,
  CAN_PLACE_ON,
  namespacedEntry,
  withAdventureList,
} from './adventure-model';
import { pointerOf } from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import { ProblemsAt } from './parts';

/** The words of a list entry: a block's name, or a group of blocks ("Logs (a group)"). */
export function adventureEntryWords(project: Project, entry: string): string {
  const id = namespacedEntry(entry);
  return id.startsWith('#') ? plainIdWords(project, id) : thingName(project, id, 'block');
}

/**
 * The tooltip lines the game adds for the two lists (ADR 0117 Y16): an empty line, the header
 * in grey, then each block indented in dark grey. The game names every block of a group; MSM
 * names the group.
 */
export function adventureTooltipLines(project: Project, components: JsonObject): TooltipLine[] {
  const lines: TooltipLine[] = [];
  for (const id of [CAN_BREAK, CAN_PLACE_ON] as const) {
    const { entries } = adventureListOf(components, id);
    if (entries.length === 0) continue;
    lines.push({ text: ' ', tone: 'note' });
    lines.push({ text: ADVENTURE_TOOLTIP_HEADERS[id], tone: 'enchantment' });
    for (const entry of entries) {
      lines.push({ text: ` ${adventureEntryWords(project, entry)}`, tone: 'note' });
    }
  }
  return lines;
}

/** Props of {@link AdventureSection}. */
export interface AdventureSectionProps {
  project: Project;
  /** The item's `components`. */
  components: JsonObject;
  /** Vanilla plus project ids (blocks and `tag/block`). */
  registries: ThingRegistries;
  /** The target's texture folder under `assets/<namespace>/`. */
  texturesFolder: string;
  /** The whole tooltip of the item, as the game draws it. */
  tooltip: readonly TooltipLine[];
  /** The element's problems; those inside either component show under its list. */
  problems: readonly FormProblem[];
  /** Sets the item's `msm:components` (undefined removes it). */
  setPassthrough(next: JsonObject | undefined): void;
}

const LISTS: readonly {
  id: AdventureComponent;
  label: string;
  testId: string;
  help: string;
}[] = [
  {
    id: CAN_BREAK,
    label: 'Can break',
    testId: 'item-can-break',
    help: 'The blocks a player in Adventure mode can break while holding this item.',
  },
  {
    id: CAN_PLACE_ON,
    label: 'Can place on',
    testId: 'item-can-place-on',
    help: 'The blocks a player in Adventure mode can use this item on, or place it on when it is a block.',
  },
];

/** One list: names with Remove, Add a block and Add a group of blocks. */
function AdventureList(props: {
  project: Project;
  label: string;
  help: string;
  testId: string;
  entries: readonly string[];
  simple: boolean;
  registries: ThingRegistries;
  pictures: ThingPictures | null;
  texturesFolder: string;
  onChange(entries: readonly string[]): void;
}) {
  const mode = usePreferences((state) => state.mode);
  const advanced = mode === 'advanced';
  const [open, setOpen] = useState(false);
  const sections = useMemo(
    () =>
      open
        ? thingSections({
            project: props.project,
            registries: props.registries,
            sort: 'block',
            texturesFolder: props.texturesFolder,
          })
        : [],
    [open, props.project, props.registries, props.texturesFolder],
  );
  const taken = new Set(props.entries.map(namespacedEntry));
  const tags = props.registries
    .ids('tag/block')
    .map((id) => `#${id}`)
    .filter((tag) => !taken.has(tag));
  const add = (entry: string) => {
    if (!taken.has(namespacedEntry(entry))) props.onChange([...props.entries, entry]);
  };
  return (
    <div className="flex flex-col gap-1" data-testid={props.testId}>
      <span className="text-xs">{props.label}</span>
      <p className="text-muted text-xs">{props.help}</p>
      {props.entries.length === 0 && <p className="text-muted text-xs">None.</p>}
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {props.entries.map((entry, index) => {
          const words = adventureEntryWords(props.project, entry);
          return (
            <li
              key={entry}
              data-testid={`${props.testId}-${index}`}
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-sm"
            >
              <span>{words}</span>
              {advanced && <code className="text-muted text-xs">{entry}</code>}
              {props.simple && (
                <button
                  type="button"
                  aria-label={`Remove ${words}`}
                  className={iconButtonClass}
                  data-testid={`${props.testId}-${index}-remove`}
                  onClick={() => props.onChange(props.entries.filter((_, at) => at !== index))}
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {props.simple ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            data-testid={`${props.testId}-add`}
            onClick={() => setOpen(true)}
          >
            Add a block
          </button>
          {tags.length > 0 && (
            <select
              className={inputClass}
              aria-label={`${props.label}: add a group of blocks`}
              data-testid={`${props.testId}-add-group`}
              value=""
              onChange={(event) => {
                if (event.target.value !== '') add(event.target.value);
              }}
            >
              <option value="">Add a group of blocks…</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {advanced
                    ? `${plainIdWords(props.project, tag)} (${tag})`
                    : plainIdWords(props.project, tag)}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <p role="status" className="text-warning text-xs" data-testid={`${props.testId}-kept`}>
          This list holds more than blocks and groups of blocks, so it is kept as it is here.
          {mode === 'very-easy' ? '' : ' Change it under Advanced (all fields).'}
        </p>
      )}
      {open && (
        <ThingPicker
          title={`${props.label}: add a block`}
          sort="block"
          sections={sections}
          pictures={props.pictures}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            if (id !== null) add(id);
          }}
        />
      )}
    </div>
  );
}

export function AdventureSection(props: AdventureSectionProps) {
  const host = useBlocksItemsStudioHost();
  const pictures = useMemo<ThingPictures | null>(() => {
    if (host === null) return null;
    const vanilla = host.modelPreview?.vanilla;
    return {
      project: host.thumbnail,
      vanilla:
        vanilla === null || vanilla === undefined ? undefined : (path) => vanilla.readAsset(path),
      revision: host.revision,
    };
  }, [host]);
  const shown = LISTS.map((list) => ({ ...list, ...adventureListOf(props.components, list.id) }));
  const hasLines = shown.some((list) => list.entries.length > 0);
  return (
    <Section title="Adventure mode" testId="item-adventure">
      <p className="text-muted text-xs">
        In Adventure mode players break and place blocks only with items that say which blocks.
        These lists change nothing in Survival or Creative.
      </p>
      {shown.map((list) => (
        <AdventureList
          key={list.id}
          project={props.project}
          label={list.label}
          help={list.help}
          testId={list.testId}
          entries={list.entries}
          simple={list.simple}
          registries={props.registries}
          pictures={pictures}
          texturesFolder={props.texturesFolder}
          onChange={(entries) =>
            props.setPassthrough(withAdventureList(props.components, list.id, entries))
          }
        />
      ))}
      {LISTS.map((list) => {
        // A problem inside the value (an unknown block at `/blocks/0`) shows at the component.
        const pointer = pointerOf(['components', 'msm:components', list.id]);
        const inside = props.problems
          .filter((problem) => problem.path === pointer || problem.path.startsWith(`${pointer}/`))
          .map((problem) => ({ ...problem, path: pointer }));
        return <ProblemsAt key={list.id} problems={inside} pointer={pointer} />;
      })}
      {hasLines && (
        <div className="flex flex-col gap-1" data-testid="item-adventure-tooltip">
          <span className="text-muted text-xs">In the game, its tooltip reads:</span>
          <Tooltip inline lines={props.tooltip} />
        </div>
      )}
    </Section>
  );
}
