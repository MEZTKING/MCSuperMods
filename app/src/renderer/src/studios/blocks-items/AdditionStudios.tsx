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
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { isWithin, ProblemList } from '../../forms';
import { typingKey } from '../../forms/context';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, IdList, Section } from '../worldgen/parts';
import {
  idsAt,
  listAt,
  NEW_DROP,
  newBiomeFeature,
  newBiomeSpawn,
  readSimpleDrop,
  type SimpleDrop,
  simpleDropsSupported,
  suggestTablesIn,
  TABLE_GROUPS,
  tableGroupLabel,
  writeSimpleDrop,
} from './additions-model';
import { asObject, choicesThrough, moved, pathSetter, pointerOf } from './blocks-items-model';
import { CheckField, ProblemsAt } from './parts';

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
      <p className="text-muted text-xs">
        Placed features from this project or the game. Only chunks generated after the mod is added
        get them: explore new land to see them.
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
