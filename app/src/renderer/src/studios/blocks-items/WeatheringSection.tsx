/**
 * The Block Studio's Weathering section (B452, ADR 0094 D8, D9, ADR 0101 D1): "Ages over time,
 * like copper" (`msm:weathering`), the stage, the next stage's block, and the waxed copy
 * honeycomb turns it into (`msm:waxable`). Three buttons make new blocks, each as one undo step
 * through the host's `applyChanges` (ADR 0045):
 *
 * - "Make the next stage": a copy of this block at the next stage, which `next` then names.
 * - "Make a waxed copy": a copy that never ages, which `into` then names.
 * - "Make the whole set": every later stage still missing and a waxed copy of each stage that has
 *   none, chained together (`weatheringChainChange`).
 *
 * Shown on the types that take the components (`WEATHERING_BLOCK_TYPES`) and on any block that
 * has them (so they can be removed); a waxed copy says which block it belongs to.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import {
  WAXABLE_COMPONENT,
  WEATHERING_BLOCK_TYPES,
  WEATHERING_COMPONENT,
  WEATHERING_STAGES,
  type WeatheringStage,
} from '@msm/plugin-blocks-items';
import { useId } from 'react';
import type { ChangeItem } from '../../changeset/changeset';
import { buttonClass } from '../../components/ui/Button';
import { type FormProblem, inputClass } from '../../forms';
import { IdField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { blockTypeOfData } from './block-type-model';
import { asObject, pointerOf } from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import { CheckField, ProblemsAt } from './parts';

type JsonObject = { [key: string]: Json };

const BLOCK_KIND = 'msm:block';

/** Each stage in words (British spelling; the values are vanilla's). */
export const WEATHERING_STAGE_LABELS: Readonly<Record<WeatheringStage, string>> = Object.freeze({
  unaffected: 'New',
  exposed: 'Exposed',
  weathered: 'Weathered',
  oxidized: 'Oxidised',
});

/** The id prefix of each stage's block (`exposed_<base>`; vanilla's copper names). */
const STAGE_PREFIX: Readonly<Record<WeatheringStage, string>> = {
  unaffected: '',
  exposed: 'exposed_',
  weathered: 'weathered_',
  oxidized: 'oxidized_',
};

/** The stage of a block's `msm:weathering`, or `undefined` without one (or an unknown stage). */
export function weatheringStageOf(data: Json | undefined): WeatheringStage | undefined {
  const stage = asObject(asObject(asObject(data).components)[WEATHERING_COMPONENT]).stage;
  return (WEATHERING_STAGES as readonly Json[]).includes(stage ?? null)
    ? (stage as WeatheringStage)
    : undefined;
}

/** Whether block data has `msm:weathering`. */
export function hasWeathering(data: Json | undefined): boolean {
  const value = asObject(asObject(data).components)[WEATHERING_COMPONENT];
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `next` of `msm:weathering`, or `''`. */
function nextOf(data: Json | undefined): string {
  const next = asObject(asObject(asObject(data).components)[WEATHERING_COMPONENT]).next;
  return typeof next === 'string' ? next : '';
}

/** The `into` of `msm:waxable`, or `''`. */
function intoOf(data: Json | undefined): string {
  const into = asObject(asObject(asObject(data).components)[WAXABLE_COMPONENT]).into;
  return typeof into === 'string' ? into : '';
}

/** The data with component `id` set to `value` (`undefined` removes it, and an empty `components`). */
function withComponent(data: Json | undefined, id: string, value: Json | undefined): JsonObject {
  const source = asObject(data);
  const components: JsonObject = { ...asObject(source.components) };
  if (value === undefined) delete components[id];
  else components[id] = value;
  const out: JsonObject = { ...source };
  if (Object.keys(components).length === 0) delete out.components;
  else out.components = components;
  return out;
}

/** The data with `msm:weathering` set to `{ stage, next? }`. */
function withWeathering(data: Json | undefined, stage: WeatheringStage, next: string): JsonObject {
  return withComponent(data, WEATHERING_COMPONENT, next === '' ? { stage } : { next, stage });
}

/** The data with `msm:waxable` `{ into }`, or without it for `''`. */
function withWaxable(data: Json | undefined, into: string): JsonObject {
  return withComponent(data, WAXABLE_COMPONENT, into === '' ? undefined : { into });
}

/** An id's namespace and path. */
function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/** A path without its stage or waxed prefix (`waxed_exposed_tin` is `tin`). */
export function weatheringBase(path: string): string {
  let base = path.replace(/^waxed_/, '');
  for (const prefix of Object.values(STAGE_PREFIX)) {
    if (prefix !== '' && base.startsWith(prefix)) base = base.slice(prefix.length);
  }
  return base === '' ? path : base;
}

/** A display name without its stage or waxed words ("Waxed Exposed Tin" is "Tin"). */
function baseName(name: string): string {
  return name
    .replace(/^Waxed\s+/i, '')
    .replace(/^(Exposed|Weathered|Oxidi[sz]ed)\s+/i, '')
    .trim();
}

/** The display name of a block, or its path in words. */
function nameOf(id: string, data: Json | undefined): string {
  const name = asObject(data).display_name;
  if (typeof name === 'string' && name.trim() !== '') return name;
  const words = splitId(id).path.split('/').pop()?.replaceAll('_', ' ') ?? id;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** An id not in `taken`: `id`, else `id_2`, `id_3`, ... */
function freeId(id: string, taken: ReadonlySet<string>): string {
  if (!taken.has(id)) return id;
  for (let n = 2; ; n += 1) {
    const candidate = `${id}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Every element id of the project. */
function idsOf(project: Project): Set<string> {
  return new Set(
    project.namespaces.flatMap((namespace) => namespace.elements.map((entry) => entry.id)),
  );
}

/** The id the block of `stage` gets, after `blockId` (`demo:tin` at `exposed` is `demo:exposed_tin`). */
export function stageBlockId(blockId: string, stage: WeatheringStage): string {
  const { namespace, path } = splitId(blockId);
  const folder = path.includes('/') ? `${path.slice(0, path.lastIndexOf('/') + 1)}` : '';
  const base = weatheringBase(path.slice(folder.length));
  return `${namespace}:${folder}${STAGE_PREFIX[stage]}${base}`;
}

/** The id of the waxed copy of `blockId` (`demo:exposed_tin` is `demo:waxed_exposed_tin`). */
export function waxedBlockId(blockId: string): string {
  const { namespace, path } = splitId(blockId);
  const slash = path.lastIndexOf('/');
  return `${namespace}:${path.slice(0, slash + 1)}waxed_${path.slice(slash + 1)}`;
}

/**
 * A copy of a block's data for a new block: the name in words for `prefix`, no item id of its own
 * (the new block's item is its own), and without `msm:weathering` and `msm:waxable` (set by the
 * caller).
 */
function copyData(data: Json | undefined, name: string): JsonObject {
  const source = withWaxable(withComponent(data, WEATHERING_COMPONENT, undefined), '');
  const out: JsonObject = { ...source, display_name: name };
  const item = asObject(out.item);
  if (typeof item.id === 'string') {
    const rest: JsonObject = { ...item };
    delete rest.id;
    out.item = rest;
  }
  return out;
}

/** One planned new block. */
interface Planned {
  id: string;
  data: JsonObject;
}

/** The change items of a weathering action: the new blocks, then the updated ones. */
function changeItems(
  creates: readonly Planned[],
  updates: readonly { element: Element; after: JsonObject }[],
): ChangeItem[] {
  return [
    ...creates.map(
      (entry, index): ChangeItem => ({
        itemId: `weathering-create-${index}`,
        op: 'create',
        elementId: entry.id as ResourceLocation,
        kind: BLOCK_KIND,
        after: entry.data,
        accepted: true,
        problems: [],
      }),
    ),
    ...updates.map(
      (entry, index): ChangeItem => ({
        itemId: `weathering-update-${index}`,
        op: 'update',
        elementId: entry.element.id,
        kind: entry.element.kind,
        before: entry.element.data,
        after: entry.after,
        accepted: true,
        problems: [],
      }),
    ),
  ];
}

/** A weathering action: its change items (one undo step) and the ids it makes. */
export interface WeatheringChange {
  items: ChangeItem[];
  /** The new block ids, in order. */
  created: string[];
}

/**
 * "Make the next stage": a copy of `element` at the stage after its own, and `next` of
 * `element` set to it. `undefined` at the last stage, without a stage, or with `next` set.
 */
export function nextStageChange(project: Project, element: Element): WeatheringChange | undefined {
  const stage = weatheringStageOf(element.data);
  if (stage === undefined || nextOf(element.data) !== '') return undefined;
  const next = WEATHERING_STAGES[WEATHERING_STAGES.indexOf(stage) + 1];
  if (next === undefined) return undefined;
  const id = freeId(stageBlockId(element.id, next), idsOf(project));
  const name = `${WEATHERING_STAGE_LABELS[next]} ${baseName(nameOf(element.id, element.data))}`;
  const data = withWeathering(copyData(element.data, name), next, '');
  return {
    items: changeItems(
      [{ id, data }],
      [{ element, after: withWeathering(element.data, stage, id) }],
    ),
    created: [id],
  };
}

/**
 * "Make a waxed copy": a copy of `element` that never ages, and `into` of `element` set to it.
 * `undefined` without a stage or with `into` set.
 */
export function waxedCopyChange(project: Project, element: Element): WeatheringChange | undefined {
  if (weatheringStageOf(element.data) === undefined || intoOf(element.data) !== '') {
    return undefined;
  }
  const id = freeId(waxedBlockId(element.id), idsOf(project));
  const data = copyData(element.data, `Waxed ${nameOf(element.id, element.data)}`);
  return {
    items: changeItems([{ id, data }], [{ element, after: withWaxable(element.data, id) }]),
    created: [id],
  };
}

/**
 * "Make the whole set": from `element` on, every later stage (following `next` through the
 * project's blocks where it is set, making the missing ones) and a waxed copy of each stage that
 * has no `into`; the new blocks are chained (`next`, `into`) as they are made. All in one list
 * of change items, so it is one undo step. `undefined` when nothing is missing.
 */
export function weatheringChainChange(
  project: Project,
  element: Element,
): WeatheringChange | undefined {
  const start = weatheringStageOf(element.data);
  if (start === undefined) return undefined;
  const taken = idsOf(project);
  const blocks = new Map<string, Element>(
    project.namespaces
      .flatMap((namespace) => namespace.elements)
      .filter((entry) => entry.kind === BLOCK_KIND)
      .map((entry) => [entry.id, entry] as const),
  );
  const base = baseName(nameOf(element.id, element.data));
  // The chain as it ends up: each stage's id and data, and whether it is new.
  const chain: { id: string; data: JsonObject; existing?: Element }[] = [];
  let current: { id: string; data: JsonObject; existing?: Element } = {
    id: element.id,
    data: asObject(element.data),
    existing: element,
  };
  let stage: WeatheringStage = start;
  const seen = new Set<string>();
  for (;;) {
    chain.push(current);
    seen.add(current.id);
    const nextStage = WEATHERING_STAGES[WEATHERING_STAGES.indexOf(stage) + 1];
    if (nextStage === undefined) break;
    const given = nextOf(current.data);
    const found = given === '' ? undefined : blocks.get(given);
    if (given !== '' && (found === undefined || weatheringStageOf(found.data) === undefined)) {
      // `next` names a vanilla block or one that does not age: the chain stops there.
      break;
    }
    if (found !== undefined && seen.has(found.id)) break;
    if (found !== undefined) {
      current = { id: found.id, data: asObject(found.data), existing: found };
      stage = weatheringStageOf(found.data) ?? nextStage;
      continue;
    }
    const id = freeId(stageBlockId(element.id, nextStage), taken);
    taken.add(id);
    current.data = withWeathering(current.data, stage, id);
    current = {
      id,
      data: withWeathering(
        copyData(element.data, `${WEATHERING_STAGE_LABELS[nextStage]} ${base}`),
        nextStage,
        '',
      ),
    };
    stage = nextStage;
  }
  const creates: Planned[] = [];
  for (const link of chain) {
    if (intoOf(link.data) !== '') continue;
    const id = freeId(waxedBlockId(link.id), taken);
    taken.add(id);
    creates.push({ id, data: copyData(link.data, `Waxed ${nameOf(link.id, link.data)}`) });
    link.data = withWaxable(link.data, id);
  }
  const newStages = chain.filter((link) => link.existing === undefined);
  const updates = chain.flatMap((link) =>
    link.existing === undefined || JSON.stringify(link.data) === JSON.stringify(link.existing.data)
      ? []
      : [{ element: link.existing, after: link.data }],
  );
  const allCreates = [...newStages.map((link) => ({ id: link.id, data: link.data })), ...creates];
  if (allCreates.length === 0) return undefined;
  return { items: changeItems(allCreates, updates), created: allCreates.map((entry) => entry.id) };
}

/** The project blocks whose `msm:waxable` turns into `id` (this block is their waxed copy). */
export function waxedCopyOf(project: Project, id: string): string[] {
  return project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((entry) => entry.kind === BLOCK_KIND && intoOf(entry.data) === id)
    .map((entry) => entry.id);
}

/** Props of {@link WeatheringSection}. */
export interface WeatheringSectionProps {
  project: Project;
  element: Element;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  /** Replaces the whole element data in one edit. */
  replace(data: Json): void;
}

export function WeatheringSection(props: WeatheringSectionProps) {
  const { project, element, problems, suggest } = props;
  const host = useBlocksItemsStudioHost();
  const stageId = useId();
  const type = blockTypeOfData(element.data);
  const on = hasWeathering(element.data);
  const waxed = waxedCopyOf(project, element.id);
  const takes = type !== undefined && WEATHERING_BLOCK_TYPES.includes(type);
  if (!takes && !on && intoOf(element.data) === '') return null;
  const stage = weatheringStageOf(element.data) ?? 'unaffected';
  const apply = host?.applyChanges;
  const run = (change: WeatheringChange | undefined, label: string) => {
    if (change === undefined || apply === undefined) return;
    void apply(change.items, label, []).catch(() => undefined);
  };
  const next = on ? nextStageChange(project, element) : undefined;
  const wax = on ? waxedCopyChange(project, element) : undefined;
  const chain = on ? weatheringChainChange(project, element) : undefined;
  const at = (path: readonly string[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );
  const last = WEATHERING_STAGES.indexOf(stage) === WEATHERING_STAGES.length - 1;
  return (
    <Section title="Weathering" testId="block-weathering">
      {waxed.length > 0 && (
        <p className="text-muted text-xs" data-testid="block-weathering-waxed-of">
          This is the waxed copy of {waxed.join(', ')}: it never ages, and an axe scrapes the wax
          off.
        </p>
      )}
      <CheckField
        label="Ages over time, like copper"
        checked={on}
        testId="block-weathering-on"
        onChange={(checked) =>
          props.replace(
            checked
              ? withWeathering(element.data, 'unaffected', '')
              : withWaxable(withComponent(element.data, WEATHERING_COMPONENT, undefined), ''),
          )
        }
      />
      {!takes && on && (
        <p className="text-warning text-xs" data-testid="block-weathering-not-for-type">
          This type of block cannot age; untick it.
        </p>
      )}
      {at(['components', WEATHERING_COMPONENT])}
      {on && (
        <>
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <label htmlFor={stageId} className="text-muted">
              Stage
            </label>
            <select
              id={stageId}
              className={inputClass}
              data-testid="block-weathering-stage"
              value={stage}
              onChange={(event) =>
                props.replace(
                  withWeathering(
                    element.data,
                    event.target.value as WeatheringStage,
                    nextOf(element.data),
                  ),
                )
              }
            >
              {WEATHERING_STAGES.map((value) => (
                <option key={value} value={value}>
                  {WEATHERING_STAGE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          {at(['components', WEATHERING_COMPONENT, 'stage'])}
          <IdField
            label={last ? 'Ages into (the last stage ages no further)' : 'Ages into'}
            value={nextOf(element.data)}
            registry="block"
            suggest={suggest}
            testId="block-weathering-next"
            onCommit={(value) => props.replace(withWeathering(element.data, stage, value))}
          />
          {at(['components', WEATHERING_COMPONENT, 'next'])}
          <IdField
            label="Waxed copy (honeycomb turns it into this)"
            value={intoOf(element.data)}
            registry="block"
            suggest={suggest}
            testId="block-weathering-into"
            onCommit={(value) => props.replace(withWaxable(element.data, value))}
          />
          {at(['components', WAXABLE_COMPONENT])}
          {at(['components', WAXABLE_COMPONENT, 'into'])}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              data-testid="block-weathering-make-next"
              disabled={next === undefined || apply === undefined}
              title={next === undefined ? undefined : `Makes ${next.created.join(', ')}`}
              onClick={() => run(next, 'Make the next stage')}
            >
              Make the next stage
            </button>
            <button
              type="button"
              className={buttonClass}
              data-testid="block-weathering-make-waxed"
              disabled={wax === undefined || apply === undefined}
              title={wax === undefined ? undefined : `Makes ${wax.created.join(', ')}`}
              onClick={() => run(wax, 'Make a waxed copy')}
            >
              Make a waxed copy
            </button>
            <button
              type="button"
              className={buttonClass}
              data-testid="block-weathering-make-set"
              disabled={chain === undefined || apply === undefined}
              title={chain === undefined ? undefined : `Makes ${chain.created.join(', ')}`}
              onClick={() => run(chain, 'Make the whole set')}
            >
              Make the whole set
            </button>
          </div>
          <p className="text-muted text-xs" data-testid="block-weathering-note">
            {apply === undefined
              ? 'The buttons are not available here.'
              : 'The whole set makes every later stage and a waxed copy of each, in one step; Undo takes it all back. The copies start with the same pictures: give each stage its own.'}{' '}
            Blocks next to an earlier stage stop ageing, as copper does; an axe scrapes it back a
            stage.
          </p>
        </>
      )}
    </Section>
  );
}
