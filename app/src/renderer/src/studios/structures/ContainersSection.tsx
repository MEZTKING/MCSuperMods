/**
 * The Structure Studio's "Chests and containers" (ADR 0116 D4, ADR 0117 D1; B555): each block
 * entity of the template with an inventory (a chest, barrel, hopper, shulker box and the rest:
 * every block entity type whose schema has `Items`, from the target's schema, plus any whose
 * data already names a loot table), with its loot table, the loot seed and its items.
 *
 * Edits are written back as the block entity's SNBT (`block_entities/<n>/nbt`) through the
 * structures plugin's `parseSnbt` and `printSnbt` (deepslate's NBT, already in that plugin; no
 * new dependency): the other keys of the block entity and of each item (its components) are
 * kept as they were. Each edit is one undo step. Very easy picks loot tables and items by name.
 *
 * The pure parts ({@link containerEntries}, {@link withLootTable}, {@link withLootSeed},
 * {@link withItems}) run in Node tests.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { parseBlockState, parseSnbt, printSnbt } from '@msm/plugin-structures';
import { Plus, X } from 'lucide-react';
import { useMemo } from 'react';
import { thingName } from '../../components/thing-picker/thing-sources';
import { Button, iconButtonClass } from '../../components/ui/Button';
import type { SchemaContext } from '../../session/schema-context';
import { LOOT_TABLE_KIND } from '../games/games-model';
import { NamedIdField, ThingField } from '../games/pickers';
import type { StudioProps } from '../types';
import { fieldNode, NumberField } from './pickers';

type Compound = ReturnType<typeof parseSnbt>;
type Tag = NonNullable<ReturnType<Compound['get']>>;

/** One item in a container. */
export interface ContainerItem {
  readonly slot: number;
  readonly item: string;
  readonly count: number;
}

/** One block entity with an inventory. */
export interface ContainerEntry {
  /** Its index in `block_entities`. */
  readonly index: number;
  readonly pos: readonly [number, number, number];
  /** The block at its position (the palette's name), or `''` when none is placed there. */
  readonly block: string;
  /** The block entity type (its `id`, else from the block), bare (`chest`). */
  readonly type: string;
  /** The loot table, or `''`. */
  readonly lootTable: string;
  /** The loot seed as text, or `''`. */
  readonly seed: string;
  readonly items: readonly ContainerItem[];
  /** Why its SNBT could not be read, or `null`. */
  readonly error: string | null;
}

const isObject = (value: unknown): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One tag from SNBT text (through the plugin's parser: no tag constructors needed here). */
function tagOf(snbt: string): Tag {
  return parseSnbt(`{v:${snbt}}`).get('v') as Tag;
}

/** A string as SNBT (double quoted, `\` and `"` escaped). */
function quoted(text: string): string {
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

const bare = (id: string): string => (id.startsWith('minecraft:') ? id.slice(10) : id);

/** The block entity type of a block when its data names none (`*_shulker_box` is `shulker_box`). */
export function typeOfBlock(block: string): string {
  const name = bare(block);
  return name.endsWith('shulker_box') ? 'shulker_box' : name;
}

/** The palette name of the block at `pos`, or `''`. */
function blockAt(template: Record<string, Json>, pos: readonly number[]): string {
  const palette = Array.isArray(template.palette) ? template.palette : [];
  const blocks = Array.isArray(template.blocks) ? template.blocks : [];
  for (const block of blocks) {
    if (!Array.isArray(block)) continue;
    if (block[0] === pos[0] && block[1] === pos[1] && block[2] === pos[2]) {
      const state = palette[block[3] as number];
      if (typeof state !== 'string') return '';
      try {
        return parseBlockState(state).name;
      } catch {
        return state;
      }
    }
  }
  return '';
}

/** The items of a container compound, in their order. */
function itemsOf(nbt: Compound): ContainerItem[] {
  if (!nbt.hasList('Items')) return [];
  const list = nbt.getList('Items');
  const out: ContainerItem[] = [];
  for (let at = 0; at < list.length; at += 1) {
    const item = list.getCompound(at);
    out.push({
      slot: item.getNumber('Slot'),
      item: item.getString('id'),
      count: item.hasNumber('count')
        ? item.getNumber('count')
        : item.hasNumber('Count')
          ? item.getNumber('Count')
          : 1,
    });
  }
  return out;
}

/**
 * The template's block entities with an inventory: those whose type `hasInventory` says has
 * one, and any whose data names a loot table or holds items.
 */
export function containerEntries(
  data: Json,
  hasInventory: (type: string) => boolean,
): ContainerEntry[] {
  const template = isObject(data) ? data : {};
  const entities = Array.isArray(template.block_entities) ? template.block_entities : [];
  const out: ContainerEntry[] = [];
  entities.forEach((entry, index) => {
    if (!isObject(entry)) return;
    const pos = (Array.isArray(entry.pos) ? entry.pos : [0, 0, 0]).map((axis) =>
      typeof axis === 'number' ? axis : 0,
    ) as [number, number, number];
    const block = blockAt(template, pos);
    const text = typeof entry.nbt === 'string' ? entry.nbt : '{}';
    let nbt: Compound;
    try {
      nbt = parseSnbt(text);
    } catch (error) {
      const type = typeOfBlock(block);
      if (hasInventory(type)) {
        out.push({
          index,
          pos,
          block,
          type,
          lootTable: '',
          seed: '',
          items: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    const type = nbt.hasString('id') ? bare(nbt.getString('id')) : typeOfBlock(block);
    const lootTable = nbt.hasString('LootTable') ? nbt.getString('LootTable') : '';
    if (!hasInventory(type) && lootTable === '' && !nbt.hasList('Items')) return;
    const seedTag = nbt.get('LootTableSeed');
    out.push({
      index,
      pos,
      block,
      type,
      lootTable,
      seed: seedTag?.isNumber() === true ? printSnbt(seedTag).replace(/[bslLfd]$/, '') : '',
      items: itemsOf(nbt),
      error: null,
    });
  });
  return out;
}

/** `snbt` with its loot table set (or removed, with its seed, for `undefined`). */
export function withLootTable(snbt: string, lootTable: string | undefined): string {
  const nbt = parseSnbt(snbt);
  if (lootTable === undefined || lootTable === '') {
    nbt.delete('LootTable');
    nbt.delete('LootTableSeed');
  } else {
    nbt.set('LootTable', tagOf(quoted(lootTable)));
  }
  return printSnbt(nbt);
}

/** Whether `text` is a whole number the game's loot seed (a long) can hold. */
export function isLootSeed(text: string): boolean {
  if (!/^-?\d+$/.test(text.trim())) return false;
  const value = BigInt(text.trim());
  return value >= -(2n ** 63n) && value < 2n ** 63n;
}

/** `snbt` with its loot seed set (or removed for `undefined` or `''`). */
export function withLootSeed(snbt: string, seed: string | undefined): string {
  const nbt = parseSnbt(snbt);
  if (seed === undefined || seed.trim() === '') nbt.delete('LootTableSeed');
  else {
    if (!isLootSeed(seed)) throw new Error(`"${seed}" is not a whole number for a loot seed.`);
    nbt.set('LootTableSeed', tagOf(`${seed.trim()}L`));
  }
  return printSnbt(nbt);
}

/**
 * `snbt` with its items replaced by `items` (an empty list removes `Items`). The item at each
 * index keeps the other keys it had (its components); `Slot`, `id` and `count` are set.
 */
export function withItems(snbt: string, items: readonly ContainerItem[]): string {
  const nbt = parseSnbt(snbt);
  const before = nbt.hasList('Items') ? nbt.getList('Items') : null;
  if (items.length === 0) {
    nbt.delete('Items');
    return printSnbt(nbt);
  }
  const parts = items.map((item, at) => {
    const kept = before !== null && at < before.length ? before.getCompound(at) : null;
    const compound = kept === null ? parseSnbt('{}') : parseSnbt(printSnbt(kept));
    compound.delete('Count');
    compound.set('Slot', tagOf(`${Math.trunc(item.slot)}b`));
    compound.set('id', tagOf(quoted(item.item)));
    compound.set('count', tagOf(String(Math.max(1, Math.trunc(item.count)))));
    return printSnbt(compound);
  });
  nbt.set('Items', tagOf(`[${parts.join(',')}]`));
  return printSnbt(nbt);
}

/** The first slot no item uses. */
export function freeSlot(items: readonly ContainerItem[]): number {
  const used = new Set(items.map((item) => item.slot));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

/** Whether block entities of `type` have an inventory, by the target's schema (`Items`). */
export function schemaHasInventory(context: SchemaContext): (type: string) => boolean {
  const known = new Map<string, boolean>();
  return (type) => {
    let answer = known.get(type);
    if (answer === undefined) {
      const node = context.schemaIndex.dispatch('minecraft:block_entity', type);
      answer = node !== undefined && fieldNode(node, undefined, 'Items') !== undefined;
      known.set(type, answer);
    }
    return answer;
  };
}

/** One container's card. */
function ContainerCard(props: {
  project: Project;
  target: Target;
  entry: ContainerEntry;
  snbt: string;
  suggest: StudioProps['suggest'];
  onSnbt(next: string): void;
}) {
  const { entry, snbt, onSnbt } = props;
  const testId = `structure-container-${entry.index}`;
  const where = entry.pos.join(', ');
  const name = thingName(props.project, entry.block === '' ? entry.type : entry.block, 'block');
  const write = (change: (text: string) => string) => {
    try {
      onSnbt(change(snbt));
    } catch {
      // A value the game cannot hold is not written; the field shows it.
    }
  };
  if (entry.error !== null) {
    return (
      <li className="rounded border border-border p-2 text-xs" data-testid={testId}>
        {name} at {where}: its data cannot be read ({entry.error}). Use Advanced to fix it.
      </li>
    );
  }
  const items = entry.items;
  const setItems = (next: ContainerItem[]) => write((text) => withItems(text, next));
  return (
    <li
      className="flex flex-col gap-2 rounded border border-border p-2"
      data-testid={testId}
      aria-label={`${name} at ${where}`}
    >
      <div className="text-muted text-xs">
        {name} at <span className="font-mono">{where}</span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <NamedIdField
          project={props.project}
          label="Loot table"
          value={entry.lootTable}
          registry="loot_table"
          kinds={[LOOT_TABLE_KIND]}
          testId={`${testId}-loot`}
          emptyLabel="None: only the items below"
          suggest={props.suggest}
          vanilla={(id) => id.includes(':chests/')}
          onChange={(value) => write((text) => withLootTable(text, value))}
        />
        {entry.lootTable !== '' && (
          <SeedField
            seed={entry.seed}
            testId={`${testId}-seed`}
            onCommit={(seed) => write((text) => withLootSeed(text, seed))}
          />
        )}
      </div>
      {entry.lootTable !== '' && (
        <p className="text-muted text-xs">
          The loot is rolled when a player first opens it; the items below are there as well.
        </p>
      )}
      <ol className="flex flex-col gap-1" aria-label={`Items in ${name}`}>
        {items.map((item, at) => {
          const change = (patch: Partial<ContainerItem>) =>
            setItems(items.map((other, index) => (index === at ? { ...other, ...patch } : other)));
          return (
            <li key={at} className="flex flex-wrap items-end gap-2">
              <ThingField
                project={props.project}
                target={props.target}
                sort="item"
                label="Item"
                value={item.item}
                testId={`${testId}-item-${at}`}
                suggest={props.suggest}
                onChange={(value) => change({ item: value ?? 'minecraft:stone' })}
              />
              <NumberField
                label="How many"
                value={item.count}
                integer
                testId={`${testId}-item-${at}-count`}
                onCommit={(value) => change({ count: Math.max(1, value ?? 1) })}
              />
              <NumberField
                label="Slot"
                value={item.slot}
                integer
                testId={`${testId}-item-${at}-slot`}
                onCommit={(value) => change({ slot: Math.max(0, value ?? 0) })}
              />
              <button
                type="button"
                aria-label={`Remove item ${at + 1}`}
                className={iconButtonClass}
                data-testid={`${testId}-item-${at}-remove`}
                onClick={() => setItems(items.filter((_, index) => index !== at))}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid={`${testId}-item-add`}
        onClick={() =>
          setItems([...items, { slot: freeSlot(items), item: 'minecraft:bread', count: 1 }])
        }
      >
        <Plus size={12} aria-hidden />
        Add an item
      </Button>
    </li>
  );
}

/** The loot seed: committed only when it is a whole number the game can hold. */
function SeedField(props: {
  seed: string;
  testId: string;
  onCommit(seed: string | undefined): void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label className="text-muted" htmlFor={props.testId}>
        Loot seed (empty: a new roll each world)
      </label>
      <input
        id={props.testId}
        key={props.seed}
        type="text"
        inputMode="numeric"
        defaultValue={props.seed}
        data-testid={props.testId}
        className="w-40 rounded border border-border bg-bg px-1 font-mono"
        onBlur={(event) => {
          const text = event.target.value.trim();
          if (text === props.seed) return;
          if (text === '') props.onCommit(undefined);
          else if (isLootSeed(text)) props.onCommit(text);
          else event.target.setCustomValidity('A whole number');
        }}
        onChange={(event) => event.target.setCustomValidity('')}
      />
    </div>
  );
}

/** Props of {@link ContainersSection}. */
export interface ContainersSectionProps {
  readonly studio: StudioProps;
}

/** "Chests and containers"; see the module comment. */
export function ContainersSection({ studio }: ContainersSectionProps) {
  const { element, context, onChange } = studio;
  const hasInventory = useMemo(() => schemaHasInventory(context), [context]);
  const entries = useMemo(
    () => containerEntries(element.data, hasInventory),
    [element.data, hasInventory],
  );
  const template = isObject(element.data) ? element.data : {};
  const entities = Array.isArray(template.block_entities) ? template.block_entities : [];
  return (
    <section
      aria-label="Chests and containers"
      data-testid="structure-containers"
      className="flex flex-col gap-2"
    >
      <h3 className="font-semibold text-sm">Chests and containers</h3>
      {entries.length === 0 ? (
        <p className="text-muted text-sm">
          No chests or other containers. Place them in-game, save with a structure block and use
          Replace from file….
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((entry) => {
            const raw = entities[entry.index];
            const snbt = isObject(raw) && typeof raw.nbt === 'string' ? raw.nbt : '{}';
            return (
              <ContainerCard
                key={entry.index}
                project={studio.project}
                target={studio.target}
                entry={entry}
                snbt={snbt}
                suggest={studio.suggest}
                onSnbt={(next) => onChange(`/block_entities/${entry.index}/nbt`, next)}
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}
