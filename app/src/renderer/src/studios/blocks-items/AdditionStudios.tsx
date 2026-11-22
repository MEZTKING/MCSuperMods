/**
 * The Studios of the additions to vanilla content (B239, ADR 0060 D2, D3):
 *
 * - "World addition" (`msm:biome_addition`): biomes and biome tags, the placed features with
 *   their generation step, and the natural spawns (entity, category, weight, group sizes).
 * - "Extra drops" (`msm:loot_addition`): the loot tables, with a picker narrowed to mobs,
 *   blocks or chests, and one simple row per pool (item, count, chance, player kill only) that
 *   writes the whole pool; a pool that uses more stays with "Advanced (all fields)" (the
 *   target's pool form) and Raw JSON.
 *
 * Every edit is one undo step; typing in a number coalesces. Choices (steps, categories) come
 * from the schema.
 *
 * A feature row naming a vanilla placed feature offers "Make my own copy" (ADR 0097 D3): one
 * undo step that adds a project placed feature with the vanilla one's configured feature and
 * placement (read from the game's own file through the vanilla cache when it can be) and points
 * the row at it, since added vanilla features can close a "Feature order cycle".
 *
 * - "Vanilla block rules" (`msm:vanilla_block_rules`, B516, ADR 0105 D4): Minecraft's own blocks
 *   an axe strips, a shovel flattens, a hoe tills, honeycomb waxes, that age like copper and that
 *   burn, one row per block; a row for a block Minecraft already pairs says which pair it
 *   replaces (`TargetFacts.blocks.vanillaPairs`). Blocks are picked by id in Easy and by name in
 *   the ThingPicker in Very easy.
 *
 * @packageDocumentation
 */

import type { Json, Project, ResourceLocation } from '@msm/core';
import { ArrowDown, ArrowUp, Copy, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ChangeItem } from '../../changeset/changeset';
import {
  ThingPicker,
  type ThingPictures,
  type ThingRegistries,
  thingName,
  thingSections,
} from '../../components/thing-picker/ThingPicker';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { isWithin, ProblemList } from '../../forms';
import { typingKey } from '../../forms/context';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { useVeryEasy } from '../very-easy';
import { AdvancedToggle, IdList, Section } from '../worldgen/parts';
import {
  idsAt,
  listAt,
  NEW_BURN_ODDS,
  NEW_DROP,
  newBiomeFeature,
  newBiomeSpawn,
  newVanillaRule,
  readSimpleDrop,
  ruleTargetField,
  type SimpleDrop,
  simpleDropsSupported,
  suggestTablesIn,
  TABLE_GROUPS,
  tableGroupLabel,
  VANILLA_RULE_LISTS,
  VANILLA_RULE_WORDS,
  type VanillaRuleList,
  vanillaPairOf,
  writeSimpleDrop,
} from './additions-model';
import { asObject, choicesThrough, moved, pathSetter, pointerOf } from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import { CheckField, ProblemsAt } from './parts';

/** The kind of placed features (`@msm/plugin-worldgen`). */
const PLACED_FEATURE_KIND = 'minecraft:worldgen/placed_feature';

/** A vanilla placed feature id (`minecraft:` or no namespace), or `undefined`. */
export function vanillaPlacedFeature(id: Json | undefined): string | undefined {
  if (typeof id !== 'string' || id === '' || id.startsWith('#')) return undefined;
  const full = id.includes(':') ? id : `minecraft:${id}`;
  return full.startsWith('minecraft:') ? full : undefined;
}

/**
 * The vanilla configured feature a vanilla placed feature most likely places, by id: the same
 * path, else the longest configured feature path it starts with at a `_` (`ore_coal_upper`
 * places `ore_coal`). Only used when the game's own file cannot be read.
 */
export function guessConfiguredFeature(path: string, configured: readonly string[]): string {
  if (configured.includes(path)) return `minecraft:${path}`;
  const prefix = configured
    .filter((candidate) => path.startsWith(`${candidate}_`))
    .sort((a, b) => b.length - a.length)[0];
  return `minecraft:${prefix ?? path}`;
}

/** What "Make my own copy" changes: the new placed feature and the addition's new data. */
export interface OwnCopyPlan {
  id: ResourceLocation;
  /** The new placed feature's data. */
  data: Json;
  /** Whether the vanilla placement was copied from the game's file (else it is empty). */
  copied: boolean;
  items: ChangeItem[];
}

/**
 * Plans "Make my own copy" for feature row `index` of `addition` (ADR 0097 D3): a project placed
 * feature in the addition's namespace named after the vanilla one (`_copy`, `_copy_2`... when
 * taken) holding `vanilla`'s `feature` and `placement` when given (the game's own file), else the
 * guessed configured feature and no placement; and the addition with the row pointing at it.
 */
export function planOwnCopy(input: {
  project: Project;
  addition: { id: ResourceLocation; kind: string; data: Json };
  index: number;
  vanilla: Json | null;
  configured: readonly string[];
}): OwnCopyPlan | undefined {
  const { project, addition, index } = input;
  const features = listAt(addition.data, 'features');
  const row = asObject(features[index]);
  const vanillaId = vanillaPlacedFeature(row.feature);
  if (vanillaId === undefined) return undefined;
  const path = vanillaId.slice('minecraft:'.length);
  const namespace = addition.id.slice(0, addition.id.indexOf(':'));
  const taken = new Set(project.namespaces.flatMap((entry) => entry.elements.map((e) => e.id)));
  let id = `${namespace}:${path}` as ResourceLocation;
  for (let n = 1; taken.has(id); n += 1) {
    id = `${namespace}:${path}_copy${n === 1 ? '' : `_${n}`}` as ResourceLocation;
  }
  const vanilla = input.vanilla === null ? undefined : asObject(input.vanilla);
  const copied =
    vanilla !== undefined && vanilla.feature !== undefined && Array.isArray(vanilla.placement);
  const data: Json = copied
    ? { feature: vanilla.feature as Json, placement: vanilla.placement as Json }
    : { feature: guessConfiguredFeature(path, input.configured), placement: [] };
  const after = structuredClone(addition.data) as { features: Json[] };
  after.features[index] = { ...row, feature: id };
  return {
    id,
    data,
    copied,
    items: [
      {
        itemId: 'own-copy',
        op: 'create',
        elementId: id,
        kind: PLACED_FEATURE_KIND,
        after: data,
        accepted: true,
        problems: [],
      },
      {
        itemId: 'own-copy-addition',
        op: 'update',
        elementId: addition.id,
        kind: addition.kind,
        before: addition.data,
        after,
        accepted: true,
        problems: [],
      },
    ],
  };
}

/** "Make my own copy" under a feature row that names a vanilla placed feature. */
function OwnCopyButton(
  props: StudioProps & { index: number; feature: string; onNote(note: string): void },
) {
  const { project, element, context, index, feature, onNote: setNote } = props;
  const host = useBlocksItemsStudioHost();
  const apply = host?.applyChanges;
  const make = async () => {
    const path = `data/minecraft/worldgen/placed_feature/${feature.slice('minecraft:'.length)}.json`;
    let vanilla: Json | null = null;
    try {
      const bytes = await host?.modelPreview?.vanilla?.readAsset(path);
      if (bytes !== null && bytes !== undefined) {
        vanilla = JSON.parse(new TextDecoder().decode(bytes)) as Json;
      }
    } catch {
      vanilla = null;
    }
    const plan = planOwnCopy({
      project,
      addition: { id: element.id, kind: element.kind, data: element.data },
      index,
      vanilla,
      configured: context.vanillaRegistries['worldgen/configured_feature'] ?? [],
    });
    if (plan === undefined || apply === undefined) return;
    try {
      await apply(plan.items, `Make my own copy of ${feature}`, []);
      setNote(
        plan.copied
          ? `Made ${plan.id}, a copy of ${feature}; this addition now adds it.`
          : `Made ${plan.id} from ${feature}'s configured feature; this addition now adds it. The game's own file could not be read, so it has no placement yet: open it and add where it goes.`,
      );
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Button
      className="self-start text-xs"
      data-testid={`world-addition-feature-${index}-copy`}
      disabled={apply === undefined}
      title={apply === undefined ? 'Not available here' : undefined}
      onClick={() => {
        void make();
      }}
    >
      <Copy size={12} aria-hidden />
      Make my own copy
    </Button>
  );
}

/** Problems inside `pointer` (the row and its fields). */
function RowProblems(props: { problems: StudioProps['problems']; pointer: string }) {
  return (
    <ProblemList
      problems={props.problems.filter((problem) => isWithin(problem.path, props.pointer))}
    />
  );
}

/** Move up, move down and remove buttons of a list row. */
function RowButtons(props: {
  name: string;
  index: number;
  count: number;
  onMove(to: number): void;
  onRemove(): void;
}) {
  const { name, index, count } = props;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Move ${name} up`}
        className={iconButtonClass}
        disabled={index === 0}
        onClick={() => props.onMove(index - 1)}
      >
        <ArrowUp size={12} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Move ${name} down`}
        className={iconButtonClass}
        disabled={index === count - 1}
        onClick={() => props.onMove(index + 1)}
      >
        <ArrowDown size={12} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        className={iconButtonClass}
        onClick={props.onRemove}
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}

/** "World addition": features and spawns added to vanilla or other biomes (ADR 0060 D2). */
export function WorldAdditionStudio(props: StudioProps) {
  const { element, node, problems, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  if (advanced) {
    return (
      <section
        aria-label="World addition"
        data-testid="world-addition-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="world-addition-advanced"
        />
        {props.form}
      </section>
    );
  }
  const data = element.data;
  const set = pathSetter(data, onChange);
  const biomes = idsAt(data, 'biomes');
  const features = listAt(data, 'features');
  const spawns = listAt(data, 'spawns');
  const steps = choicesThrough(node, data, ['features', 0, 'step']);
  const categories = choicesThrough(node, data, ['spawns', 0, 'category']);
  /** Sets a list; an emptied list is removed (each list holds at least one entry). */
  const setList = (key: string, next: Json[]) => set([key], next.length === 0 ? undefined : next);

  const biomesSection = (
    <Section title="Biomes" testId="world-addition-biomes">
      <IdList
        label="Biomes"
        ids={biomes}
        registry="worldgen/biome"
        suggest={suggest}
        pointer="/biomes"
        problems={problems}
        onChange={(next) => set(['biomes'], next)}
      />
      <p className="text-muted text-xs">
        Biome ids such as minecraft:plains, or biome tags starting with # such as
        #minecraft:is_overworld; the addition applies to all of them.
      </p>
      <ProblemsAt problems={problems} pointer="/biomes" />
    </Section>
  );

  const featuresSection = (
    <Section title="Features" testId="world-addition-features">
      {features.length === 0 && <p className="text-muted text-xs">No features.</p>}
      <ol className="flex flex-col gap-2">
        {features.map((raw, index) => {
          const row = asObject(raw);
          const name = `Feature ${index + 1}`;
          const pointer = pointerOf(['features', index]);
          return (
            <li
              key={index}
              className="flex flex-col gap-1"
              data-testid={`world-addition-feature-${index}`}
            >
              <div className="flex flex-wrap items-end gap-2">
                <IdField
                  label={`${name} placed feature`}
                  value={typeof row.feature === 'string' ? row.feature : ''}
                  registry="worldgen/placed_feature"
                  suggest={suggest}
                  className="min-w-56"
                  testId={`world-addition-feature-${index}-id`}
                  onCommit={(text) => set(['features', index, 'feature'], text)}
                />
                <SelectField
                  label={`${name} step`}
                  value={typeof row.step === 'string' ? row.step : undefined}
                  choices={steps}
                  testId={`world-addition-feature-${index}-step`}
                  onChange={(value) => {
                    if (value !== undefined) set(['features', index, 'step'], value);
                  }}
                />
                <RowButtons
                  name={name}
                  index={index}
                  count={features.length}
                  onMove={(to) => setList('features', moved(features, index, to))}
                  onRemove={() =>
                    setList(
                      'features',
                      features.filter((_, at) => at !== index),
                    )
                  }
                />
              </div>
              <RowProblems problems={problems} pointer={pointer} />
              {vanillaPlacedFeature(row.feature) !== undefined && (
                <OwnCopyButton
                  {...props}
                  index={index}
                  feature={vanillaPlacedFeature(row.feature) as string}
                  onNote={setCopyNote}
                />
              )}
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid="world-addition-add-feature"
        onClick={() =>
          features.length === 0
            ? set(['features'], [newBiomeFeature(steps)])
            : set(['features', features.length], newBiomeFeature(steps))
        }
      >
        <Plus size={12} aria-hidden />
        Add feature
      </Button>
      {copyNote !== null && (
        <p className="text-muted text-xs" data-testid="world-addition-copy-note">
          {copyNote}
        </p>
      )}
      <p className="text-muted text-xs">
        Placed features from this project or the game. Only chunks generated after the mod is added
        get them: explore new land to see them. Prefer your own placed features: an added game
        feature runs after features the game runs later, which can stop worlds with "Feature order
        cycle", so make your own copy of it.
      </p>
      <ProblemsAt problems={problems} pointer="/features" />
    </Section>
  );

  const spawnNumber = (index: number, key: string, label: string, value: Json | undefined) => (
    <NumberField
      key={key}
      label={label}
      value={value}
      integer
      testId={`world-addition-spawn-${index}-${key.replace('_', '-')}`}
      onCommit={(next) =>
        set(['spawns', index, key], next, typingKey(pointerOf(['spawns', index, key])))
      }
    />
  );
  const spawnsSection = (
    <Section title="Spawns" testId="world-addition-spawns">
      {spawns.length === 0 && <p className="text-muted text-xs">No spawns.</p>}
      <ol className="flex flex-col gap-2">
        {spawns.map((raw, index) => {
          const row = asObject(raw);
          const name = `Spawn ${index + 1}`;
          const pointer = pointerOf(['spawns', index]);
          return (
            <li
              key={index}
              className="flex flex-col gap-1"
              data-testid={`world-addition-spawn-${index}`}
            >
              <div className="flex flex-wrap items-end gap-2">
                <IdField
                  label={`${name} entity`}
                  value={typeof row.entity === 'string' ? row.entity : ''}
                  registry="entity_type"
                  suggest={suggest}
                  className="min-w-48"
                  testId={`world-addition-spawn-${index}-entity`}
                  onCommit={(text) => set(['spawns', index, 'entity'], text)}
                />
                <SelectField
                  label={`${name} category`}
                  value={typeof row.category === 'string' ? row.category : undefined}
                  choices={categories}
                  testId={`world-addition-spawn-${index}-category`}
                  onChange={(value) => {
                    if (value !== undefined) set(['spawns', index, 'category'], value);
                  }}
                />
                {spawnNumber(index, 'weight', `${name} weight`, row.weight)}
                {spawnNumber(index, 'min_group', `${name} min group`, row.min_group)}
                {spawnNumber(index, 'max_group', `${name} max group`, row.max_group)}
                <RowButtons
                  name={name}
                  index={index}
                  count={spawns.length}
                  onMove={(to) => setList('spawns', moved(spawns, index, to))}
                  onRemove={() =>
                    setList(
                      'spawns',
                      spawns.filter((_, at) => at !== index),
                    )
                  }
                />
              </div>
              <RowProblems problems={problems} pointer={pointer} />
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid="world-addition-add-spawn"
        onClick={() =>
          spawns.length === 0
            ? set(['spawns'], [newBiomeSpawn(categories)])
            : set(['spawns', spawns.length], newBiomeSpawn(categories))
        }
      >
        <Plus size={12} aria-hidden />
        Add spawn
      </Button>
      <p className="text-muted text-xs">
        Weight is how often the entity is picked against the other spawns of its category in these
        biomes.
      </p>
      <ProblemsAt problems={problems} pointer="/spawns" />
    </Section>
  );

  return (
    <section
      aria-label="World addition"
      data-testid="world-addition-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="world-addition-advanced" />
      <p className="text-muted text-xs">
        Adds features and spawns to existing biomes when the game starts. It needs the Fabric mod
        export; vanilla packs do not carry it.
      </p>
      <ProblemsAt problems={problems} pointer="" />
      {biomesSection}
      {featuresSection}
      {spawnsSection}
    </section>
  );
}

/** One simple drop row: item, count, chance and player kill only. */
function DropRow(props: {
  index: number;
  drop: SimpleDrop;
  suggest: StudioProps['suggest'];
  write(next: SimpleDrop, coalesce?: string): void;
}) {
  const { index, drop, write } = props;
  const name = `Drop ${index + 1}`;
  const key = (field: string) => typingKey(pointerOf(['pools', index, field]));
  return (
    <>
      <IdField
        label={`${name} item`}
        value={drop.item}
        registry="item"
        suggest={props.suggest}
        className="min-w-48"
        testId={`extra-drops-${index}-item`}
        onCommit={(text) => write({ ...drop, item: text })}
      />
      <NumberField
        label={`${name} smallest count`}
        value={drop.min}
        integer
        testId={`extra-drops-${index}-min`}
        onCommit={(value) => {
          if (value === undefined || value < 1) return;
          write({ ...drop, min: value, max: Math.max(value, drop.max) }, key('min'));
        }}
      />
      <NumberField
        label={`${name} largest count`}
        value={drop.max}
        integer
        testId={`extra-drops-${index}-max`}
        onCommit={(value) => {
          if (value === undefined || value < 1) return;
          write({ ...drop, max: value, min: Math.min(value, drop.min) }, key('max'));
        }}
      />
      <NumberField
        label={`${name} chance (%)`}
        value={Math.round(drop.chance * 10000) / 100}
        testId={`extra-drops-${index}-chance`}
        onCommit={(value) => {
          if (value === undefined || value < 0 || value > 100) return;
          write({ ...drop, chance: Math.round(value * 100) / 10000 }, key('chance'));
        }}
      />
      <CheckField
        label="Only when a player kills it"
        checked={drop.playerKill}
        testId={`extra-drops-${index}-player-kill`}
        onChange={(checked) => write({ ...drop, playerKill: checked })}
      />
    </>
  );
}

/** "Extra drops": pools added to built-in loot tables (ADR 0060 D3). */
export function ExtraDropsStudio(props: StudioProps) {
  const { element, node, problems, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  const [group, setGroup] = useState<string>('entities');
  if (advanced) {
    return (
      <section
        aria-label="Extra drops"
        data-testid="extra-drops-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="extra-drops-advanced" />
        {props.form}
      </section>
    );
  }
  const data = element.data;
  const set = pathSetter(data, onChange);
  const tables = idsAt(data, 'tables');
  const pools = listAt(data, 'pools');
  const simple = simpleDropsSupported(node, data);
  const groupLabel = TABLE_GROUPS.find((entry) => entry.id === group)?.label ?? '';

  const tablesSection = (
    <Section title="Loot tables" testId="extra-drops-tables">
      <SelectField
        label="Suggest tables of"
        value={groupLabel === '' ? undefined : groupLabel}
        choices={TABLE_GROUPS.map((entry) => entry.label)}
        emptyLabel="(all tables)"
        testId="extra-drops-table-group"
        onChange={(value) =>
          setGroup(TABLE_GROUPS.find((entry) => entry.label === value)?.id ?? '')
        }
      />
      <IdList
        label="Loot tables"
        ids={tables}
        registry="loot_table"
        suggest={suggestTablesIn(suggest, group)}
        pointer="/tables"
        problems={problems}
        onChange={(next) => set(['tables'], next)}
      />
      {tables.length > 0 && (
        <p className="text-muted text-xs" data-testid="extra-drops-table-groups">
          {tables.map((id) => `${id} (${tableGroupLabel(id)})`).join(', ')}
        </p>
      )}
      <p className="text-muted text-xs">
        {group === ''
          ? 'Suggestions cover every loot table.'
          : `Suggestions show ${groupLabel.toLowerCase()} first: type a name such as zombie.`}{' '}
        Mob tables are entities/…, block tables blocks/…, chest tables chests/….
      </p>
      <ProblemsAt problems={problems} pointer="/tables" />
    </Section>
  );

  const writeAt = (index: number) => (next: SimpleDrop, coalesce?: string) =>
    set(['pools', index], writeSimpleDrop(next), coalesce);
  const dropsSection = (
    <Section title="Drops" testId="extra-drops-pools">
      {pools.length === 0 && <p className="text-muted text-xs">No drops.</p>}
      <ol className="flex flex-col gap-2">
        {pools.map((pool, index) => {
          const drop = simple ? readSimpleDrop(pool) : undefined;
          const name = `Drop ${index + 1}`;
          return (
            <li key={index} className="flex flex-col gap-1" data-testid={`extra-drops-${index}`}>
              <div className="flex flex-wrap items-end gap-2">
                {drop === undefined ? (
                  <p className="text-muted text-xs" data-testid={`extra-drops-${index}-custom`}>
                    {name} uses more than an item, a count, a chance and a player kill: edit it
                    under "Advanced (all fields)" or in Raw JSON.
                  </p>
                ) : (
                  <DropRow index={index} drop={drop} suggest={suggest} write={writeAt(index)} />
                )}
                <RowButtons
                  name={name}
                  index={index}
                  count={pools.length}
                  onMove={(to) => set(['pools'], moved(pools, index, to))}
                  onRemove={() =>
                    set(
                      ['pools'],
                      pools.filter((_, at) => at !== index),
                    )
                  }
                />
              </div>
              <RowProblems problems={problems} pointer={pointerOf(['pools', index])} />
            </li>
          );
        })}
      </ol>
      {simple ? (
        <Button
          className="self-start text-xs"
          data-testid="extra-drops-add"
          onClick={() =>
            pools.length === 0
              ? set(['pools'], [writeSimpleDrop(NEW_DROP)])
              : set(['pools', pools.length], writeSimpleDrop(NEW_DROP))
          }
        >
          <Plus size={12} aria-hidden />
          Add drop
        </Button>
      ) : (
        <p className="text-muted text-xs" data-testid="extra-drops-no-simple">
          This target's loot pools have another shape: add drops under "Advanced (all fields)".
        </p>
      )}
      <p className="text-muted text-xs">
        Each drop is rolled once, on top of the table's usual drops. A world data pack that replaces
        the table wins over these drops.
      </p>
      <ProblemsAt problems={problems} pointer="/pools" />
    </Section>
  );

  return (
    <section
      aria-label="Extra drops"
      data-testid="extra-drops-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="extra-drops-advanced" />
      <p className="text-muted text-xs">
        Adds drops to existing loot tables of mobs, blocks and chests. It needs the Fabric mod
        export; vanilla packs do not carry it.
      </p>
      <ProblemsAt problems={problems} pointer="" />
      {tablesSection}
      {dropsSection}
    </section>
  );
}

/** A block or item: an id field in Easy, a named chip opening the ThingPicker in Very easy. */
function ThingIdField(props: {
  label: string;
  value: string;
  sort: 'block' | 'item';
  testId: string;
  project: StudioProps['project'];
  suggest: StudioProps['suggest'];
  registries: ThingRegistries;
  pictures: ThingPictures | null;
  texturesFolder: string;
  /** The words of the empty value; the picker offers it as its first tile when given. */
  emptyLabel?: string;
  onCommit(value: string): void;
}) {
  const veryEasy = useVeryEasy();
  const [open, setOpen] = useState(false);
  const sections = useMemo(
    () =>
      open
        ? thingSections({
            project: props.project,
            registries: props.registries,
            sort: props.sort,
            texturesFolder: props.texturesFolder,
          })
        : [],
    [open, props.project, props.registries, props.sort, props.texturesFolder],
  );
  if (!veryEasy) {
    return (
      <IdField
        label={props.label}
        value={props.value}
        registry={props.sort}
        suggest={props.suggest}
        className="min-w-56"
        testId={props.testId}
        onCommit={(text) => props.onCommit(text.trim())}
      />
    );
  }
  const words =
    props.value === ''
      ? (props.emptyLabel ?? `Pick ${props.sort === 'item' ? 'an item' : 'a block'}`)
      : thingName(props.project, props.value, props.sort);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <span className="text-muted">{props.label}</span>
      <Button
        className="self-start text-xs"
        data-testid={props.testId}
        onClick={() => setOpen(true)}
      >
        {words}
      </Button>
      {open && (
        <ThingPicker
          title={`Pick ${props.sort === 'item' ? 'an item' : 'a block'}: ${props.label.toLowerCase()}`}
          sort={props.sort}
          sections={sections}
          value={props.value === '' ? undefined : props.value}
          pictures={props.pictures}
          noneLabel={props.emptyLabel}
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
 * "Vanilla block rules" (ADR 0105 D4): rules for Minecraft's own blocks, one list per tool and
 * one for burning.
 */
export function VanillaBlockRulesStudio(props: StudioProps) {
  const { project, element, problems, suggest, onChange, target } = props;
  const [advanced, setAdvanced] = useState(false);
  const host = useBlocksItemsStudioHost();
  const registries = useMemo(
    () => props.context.registries(project, element.kind),
    [props.context, project, element.kind],
  );
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
  if (advanced) {
    return (
      <section
        aria-label="Vanilla block rules"
        data-testid="vanilla-block-rules-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="vanilla-block-rules-advanced"
        />
        {props.form}
      </section>
    );
  }
  const data = element.data;
  const set = pathSetter(data, onChange);
  const facts = target.blocks?.vanillaPairs;
  const texturesFolder = target.folders.resource.textures;
  /** Sets a list; an emptied list is removed (each list holds at least one entry). */
  const setList = (key: VanillaRuleList, next: Json[]) =>
    set([key], next.length === 0 ? undefined : next);
  const thing = (
    label: string,
    value: Json | undefined,
    sort: 'block' | 'item',
    testId: string,
    onCommit: (value: string) => void,
    emptyLabel?: string,
  ) => (
    <ThingIdField
      label={label}
      value={typeof value === 'string' ? value : ''}
      sort={sort}
      testId={testId}
      project={project}
      suggest={suggest}
      registries={registries}
      pictures={pictures}
      texturesFolder={texturesFolder}
      {...(emptyLabel === undefined ? {} : { emptyLabel })}
      onCommit={onCommit}
    />
  );

  const section = (list: VanillaRuleList) => {
    const words = VANILLA_RULE_WORDS[list];
    const rows = listAt(data, list);
    const targetField = ruleTargetField(list);
    return (
      <Section key={list} title={words.title} testId={`vanilla-rules-${list}`}>
        <p className="text-muted text-xs">{words.note}</p>
        {rows.length === 0 && <p className="text-muted text-xs">None.</p>}
        <ol className="flex flex-col gap-2">
          {rows.map((raw, index) => {
            const row = asObject(raw);
            const name = `${words.title}, rule ${index + 1}`;
            const replaced = vanillaPairOf(facts, list, row.block);
            const base = `vanilla-rules-${list}-${index}`;
            return (
              <li key={index} className="flex flex-col gap-1" data-testid={base}>
                <div className="flex flex-wrap items-end gap-2">
                  {thing('Block', row.block, 'block', `${base}-block`, (text) =>
                    set([list, index, 'block'], text),
                  )}
                  {targetField !== undefined &&
                    thing(words.into, row[targetField], 'block', `${base}-${targetField}`, (text) =>
                      set([list, index, targetField], text),
                    )}
                  {list === 'till' &&
                    thing(
                      'Drops once',
                      row.drops,
                      'item',
                      `${base}-drops`,
                      (text) => set([list, index, 'drops'], text === '' ? undefined : text),
                      'Nothing',
                    )}
                  {list === 'burn' && (
                    <>
                      <NumberField
                        label="Catches fire (0 to 300)"
                        value={row.burn_odds}
                        integer
                        testId={`${base}-burn-odds`}
                        onCommit={(value) =>
                          set(
                            [list, index, 'burn_odds'],
                            value ?? NEW_BURN_ODDS.burn_odds,
                            typingKey(`/${list}/${index}/burn_odds`),
                          )
                        }
                      />
                      <NumberField
                        label="Burns away (0 to 300)"
                        value={row.ignite_odds}
                        integer
                        testId={`${base}-ignite-odds`}
                        onCommit={(value) =>
                          set(
                            [list, index, 'ignite_odds'],
                            value ?? NEW_BURN_ODDS.ignite_odds,
                            typingKey(`/${list}/${index}/ignite_odds`),
                          )
                        }
                      />
                    </>
                  )}
                  <RowButtons
                    name={name}
                    index={index}
                    count={rows.length}
                    onMove={(to) => set([list], moved(rows, index, to))}
                    onRemove={() =>
                      setList(
                        list,
                        rows.filter((_, at) => at !== index),
                      )
                    }
                  />
                </div>
                {replaced !== undefined && (
                  <p className="text-warning text-xs" data-testid={`${base}-replaces`}>
                    Minecraft already turns it into {thingName(project, replaced, 'block')}; this
                    rule replaces that.
                  </p>
                )}
                <RowProblems problems={problems} pointer={pointerOf([list, index])} />
              </li>
            );
          })}
        </ol>
        <Button
          className="self-start text-xs"
          data-testid={`vanilla-rules-${list}-add`}
          onClick={() =>
            rows.length === 0
              ? set([list], [newVanillaRule(list)])
              : set([list, rows.length], newVanillaRule(list))
          }
        >
          <Plus size={12} aria-hidden />
          Add a block
        </Button>
        <ProblemsAt problems={problems} pointer={`/${list}`} />
      </Section>
    );
  };

  return (
    <section
      aria-label="Vanilla block rules"
      data-testid="vanilla-block-rules-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle
        checked={advanced}
        onChange={setAdvanced}
        testId="vanilla-block-rules-advanced"
      />
      <p className="text-muted text-xs">
        Rules for Minecraft's own blocks: what a tool turns them into, how they age and how they
        burn. They need the Fabric mod export; vanilla packs do not carry them.
      </p>
      <ProblemsAt problems={problems} pointer="" />
      {VANILLA_RULE_LISTS.map(section)}
    </section>
  );
}
