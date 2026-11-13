/**
 * Biome Studio (plan D7, B80) for `minecraft:worldgen/biome`, built on the target's schema:
 *
 * - Climate: `temperature`, `downfall`, `has_precipitation`, `temperature_modifier`.
 * - Colours: the `effects` colour fields the schema declares (water, grass, foliage, dry
 *   foliage) plus the target's biome colour attributes (sky, fog, water fog live in
 *   `attributes` since the effects fields were retired), and `grass_color_modifier`.
 * - Features: one ordered placed-feature list per decoration step, named from
 *   `target.worldgen.featureSteps`.
 * - Spawns: the target's natural mob spawns attribute, one list per mob category (categories
 *   from the schema's map key type), plus its spawn costs as a schema sub-form.
 * - Carvers as a schema sub-form; everything else behind "Advanced (all fields)".
 */

import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { IdInput, idSuggestions, inputClass, ProblemList } from '../../forms';
import { typingKey } from '../../forms/context';
import { childPointer, isJsonObject, parsePointer, valueAt } from '../../forms/pointer';
import { defaultValue, flattenUnion, resolveNode, structShape } from '../../forms/schema-utils';
import type { StudioProps } from '../types';
import { ColourField } from './ColourField';
import { AdvancedToggle, IdList, Section, SubForm } from './parts';
import {
  asObject,
  choicesOf,
  entryValueNode,
  fieldOf,
  humanise,
  listItem,
  shortKey,
  stepLists,
  wildcardOf,
  writeAt,
} from './worldgen-model';

type JsonObject = { [key: string]: Json };

/** The `min_inclusive`/`max_inclusive` of an int provider, or `null` for other forms. */
function countRange(count: Json | undefined): [number, number] | null {
  if (typeof count === 'number') return [count, count];
  if (
    isJsonObject(count) &&
    typeof count.min_inclusive === 'number' &&
    typeof count.max_inclusive === 'number'
  ) {
    return [count.min_inclusive, count.max_inclusive];
  }
  return null;
}

/** The int provider type with an inclusive range, when the count schema offers it. */
function rangeProviderType(count: SchemaNode | undefined): string | undefined {
  if (count === undefined) return undefined;
  const target = resolveNode(count);
  const members = target.kind === 'union' ? flattenUnion(target) : [count];
  for (const member of members) {
    const resolved = resolveNode(member);
    if (resolved.kind !== 'struct') continue;
    for (const discriminator of structShape(resolved, undefined).discriminators) {
      if (discriminator.dispatcher.keys().includes('uniform')) return 'minecraft:uniform';
    }
  }
  return undefined;
}

function NumberInput({
  label,
  value,
  step,
  onChange,
  testId,
}: {
  label: string;
  value: number | undefined;
  step?: number;
  onChange(value: number): void;
  testId?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-36 shrink-0">{label}</span>
      <input
        type="number"
        aria-label={label}
        data-testid={testId}
        className={`${inputClass} w-28`}
        step={step}
        value={value ?? ''}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (event.target.value !== '' && Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function ChoiceSelect({
  label,
  value,
  choices,
  optional,
  onChange,
}: {
  label: string;
  value: Json | undefined;
  choices: readonly string[];
  optional: boolean;
  onChange(value: string | undefined): void;
}) {
  const current = typeof value === 'string' ? value : '';
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-36 shrink-0">{label}</span>
      <select
        aria-label={label}
        className={`${inputClass} w-auto`}
        value={current}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      >
        {(optional || current === '') && <option value="">(not set)</option>}
        {current !== '' && !choices.includes(current) && <option value={current}>{current}</option>}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BiomeStudio(props: StudioProps) {
  const { element, node, target, problems, completions, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  const data = asObject(element.data);

  const pointerOf = (path: readonly string[]) =>
    path.reduce<string>((pointer, key) => childPointer(pointer, key), '');
  /** Sets `value` at `path` (keys and indices), creating absent parent objects. */
  const setPath = (path: readonly string[], value: Json | undefined, coalesce?: string) => {
    const options = coalesce === undefined ? undefined : { coalesce };
    if (value === undefined) {
      const pointer = pointerOf(path);
      if (valueAt(element.data, pointer) !== undefined) onChange(pointer, undefined, options);
      return;
    }
    const parent = pointerOf(path.slice(0, -1));
    if (parent === '' || valueAt(element.data, parent) !== undefined) {
      onChange(pointerOf(path), value, options);
      return;
    }
    const edit = writeAt(element.data, path, value);
    onChange(edit.pointer, edit.value, options);
  };
  /** The `onChange` of a sub-form, creating absent parents on the first edit. */
  const subChange = (pointer: string, value: Json | undefined, options?: { coalesce?: string }) =>
    setPath(parsePointer(pointer), value, options?.coalesce);

  const field = (key: string) => fieldOf(node, key, element.data);
  const problemsAt = (path: readonly string[]) => {
    const pointer = pointerOf(path);
    return problems.filter((problem) => problem.path === pointer);
  };

  if (advanced) {
    return (
      <section aria-label="Biome Studio" data-testid="biome-studio" className="flex flex-col gap-3">
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="biome-advanced-toggle" />
        {props.form}
      </section>
    );
  }

  // Climate.
  const climate = (
    <Section title="Climate" testId="biome-climate">
      {field('temperature') !== undefined && (
        <NumberInput
          label="Temperature"
          value={typeof data.temperature === 'number' ? data.temperature : undefined}
          step={0.05}
          onChange={(value) => setPath(['temperature'], value, typingKey('/temperature'))}
        />
      )}
      <ProblemList problems={problemsAt(['temperature'])} />
      {field('downfall') !== undefined && (
        <NumberInput
          label="Downfall"
          value={typeof data.downfall === 'number' ? data.downfall : undefined}
          step={0.05}
          onChange={(value) => setPath(['downfall'], value, typingKey('/downfall'))}
        />
      )}
      <ProblemList problems={problemsAt(['downfall'])} />
      {field('has_precipitation') !== undefined && (
        <label className="flex items-center gap-2 text-sm">
          <span className="w-36 shrink-0">Precipitation</span>
          <input
            type="checkbox"
            aria-label="Precipitation"
            checked={data.has_precipitation === true}
            onChange={(event) => setPath(['has_precipitation'], event.target.checked)}
          />
        </label>
      )}
      {field('temperature_modifier') !== undefined && (
        <ChoiceSelect
          label="Temperature modifier"
          value={data.temperature_modifier}
          choices={choicesOf(field('temperature_modifier')?.type)}
          optional={field('temperature_modifier')?.optional === true}
          onChange={(value) => setPath(['temperature_modifier'], value)}
        />
      )}
    </Section>
  );

  // Colours.
  const effectsField = field('effects');
  const effects = asObject(data.effects);
  const effectFields =
    effectsField === undefined
      ? []
      : (() => {
          const resolved = resolveNode(effectsField.type);
          if (resolved.kind !== 'struct' && resolved.kind !== 'dispatcher') return [];
          return structShape(resolved, effects).fields;
        })();
  const colourEffects = effectFields.filter((entry) => entry.key.endsWith('_color'));
  const grassModifier = effectFields.find((entry) => entry.key === 'grass_color_modifier');
  const attributeColours = target.worldgen.biomeAttributes?.colours ?? [];
  const attributes = asObject(data.attributes);
  const colours = (
    <Section title="Colours" testId="biome-colours">
      {colourEffects.map((entry) => (
        <ColourField
          key={`effects:${entry.key}`}
          label={humanise(entry.key)}
          testId={`biome-colour-${entry.key}`}
          value={effects[entry.key]}
          clearable={entry.optional}
          onChange={(value) =>
            setPath(['effects', entry.key], value, typingKey(`/effects/${entry.key}`))
          }
        />
      ))}
      {field('attributes') !== undefined &&
        attributeColours.map((id) => (
          <ColourField
            key={`attributes:${id}`}
            label={humanise(id)}
            testId={`biome-colour-${shortKey(id)}`}
            value={attributes[id]}
            clearable
            onChange={(value) =>
              setPath(['attributes', id], value, typingKey(pointerOf(['attributes', id])))
            }
          />
        ))}
      {grassModifier !== undefined && (
        <ChoiceSelect
          label="Grass colour modifier"
          value={effects.grass_color_modifier}
          choices={choicesOf(grassModifier.type)}
          optional={grassModifier.optional}
          onChange={(value) => setPath(['effects', 'grass_color_modifier'], value)}
        />
      )}
    </Section>
  );

  // Features, one list per decoration step.
  const steps = target.worldgen.featureSteps;
  const lists = stepLists(data.features);
  const setStep = (index: number, next: string[]) => {
    const features = data.features;
    if (Array.isArray(features) && index < features.length) {
      onChange(`/features/${index}`, next);
      return;
    }
    const padded: Json[] = Array.isArray(features) ? [...features] : [];
    while (padded.length < index) padded.push([]);
    padded[index] = next;
    onChange('/features', padded);
  };
  const featureSection = (
    <Section title="Features" testId="biome-features">
      <p className="text-muted text-xs">
        Placed features run step by step, in list order within a step. Placed features shared by
        several biomes must keep the same relative order within a step in all of them, and are best
        kept in the same step too.
      </p>
      {data.features !== undefined && !Array.isArray(data.features) ? (
        <p className="text-muted text-sm">
          The features are not step lists; edit them under Advanced.
        </p>
      ) : (
        steps.map((step, index) => {
          const list = lists[index];
          const title = humanise(step);
          return (
            <div key={step} data-testid={`biome-step-${index}`} className="flex flex-col gap-1">
              <h4 className="text-sm">
                {index + 1}. {title}
              </h4>
              {list === null ? (
                <p className="text-muted text-xs">
                  This step is not a list of ids; edit it under Advanced.
                </p>
              ) : (
                <IdList
                  label={`${title} features`}
                  ids={list ?? []}
                  registry="worldgen/placed_feature"
                  suggest={suggest}
                  pointer={`/features/${index}`}
                  problems={problems}
                  onChange={(next) => setStep(index, next)}
                />
              )}
            </div>
          );
        })
      )}
      {lists.length > steps.length && (
        <p role="status" className="text-warning text-xs">
          The biome lists {lists.length} steps; this version has {steps.length}. Remove the extra
          lists under Advanced.
        </p>
      )}
    </Section>
  );

  // Spawns, through the natural mob spawns attribute.
  const spawnsKey = target.worldgen.biomeAttributes?.naturalMobSpawns;
  const attributesField = field('attributes');
  const spawnsNode =
    spawnsKey === undefined
      ? undefined
      : entryValueNode(wildcardOf(attributesField?.type)?.type, spawnsKey);
  const spawnsValue = spawnsKey === undefined ? undefined : attributes[spawnsKey];
  const plainSpawns =
    spawnsValue === undefined ||
    (isJsonObject(spawnsValue) &&
      !Object.hasOwn(spawnsValue, 'modifier') &&
      !Object.hasOwn(spawnsValue, 'attribute_track'));
  const byCategoryField = fieldOf(spawnsNode, 'spawns_by_category');
  const categoryMap = wildcardOf(byCategoryField?.type);
  const categories = choicesOf(categoryMap?.keyType).map((entry) =>
    entry.startsWith('minecraft:') ? entry.slice('minecraft:'.length) : entry,
  );
  const spawnerNode = listItem(categoryMap?.type);
  const countNode = fieldOf(spawnerNode, 'count')?.type;
  const rangeType = rangeProviderType(countNode);
  const byCategory = asObject(asObject(spawnsValue).spawns_by_category);
  const spawnCostsField = fieldOf(spawnsNode, 'spawn_costs');

  const spawnSection =
    spawnsKey === undefined || spawnsNode === undefined ? null : (
      <Section title="Spawns" testId="biome-spawns">
        {!plainSpawns ? (
          <p className="text-muted text-sm">
            The spawns are set by a modifier or keyframes; edit them under Advanced.
          </p>
        ) : (
          <>
            {categories.map((category) => {
              const raw = byCategory[category];
              const entries = Array.isArray(raw) ? raw : [];
              const title = humanise(category);
              const path = ['attributes', spawnsKey, 'spawns_by_category', category];
              const setList = (next: Json[]) => setPath(path, next);
              const setEntry = (index: number, key: string, value: Json, typing?: string) => {
                const next = entries.map((entry, at) =>
                  at === index ? { ...asObject(entry), [key]: value } : entry,
                );
                setPath(path, next, typing);
              };
              return (
                <div
                  key={category}
                  data-testid={`biome-spawns-${category}`}
                  className="flex flex-col gap-1"
                >
                  <h4 className="text-sm">{title}</h4>
                  {entries.length === 0 && <p className="text-muted text-xs">None.</p>}
                  {entries.map((entry, index) => {
                    const spawn: JsonObject = asObject(entry);
                    const name = `${title} spawn ${index + 1}`;
                    const range = countRange(spawn.count);
                    const pointer = pointerOf([...path, String(index)]);
                    const setRange = (min: number, max: number) => {
                      const value: Json | undefined =
                        min === max && typeof spawn.count === 'number'
                          ? min
                          : rangeType === undefined
                            ? undefined
                            : { type: rangeType, min_inclusive: min, max_inclusive: max };
                      if (value !== undefined) {
                        setEntry(index, 'count', value, typingKey(`${pointer}/count`));
                      }
                    };
                    return (
                      <div key={index} className="flex flex-wrap items-center gap-1">
                        <IdInput
                          value={typeof spawn.type === 'string' ? spawn.type : ''}
                          label={`${name} entity`}
                          placeholder="minecraft:pig"
                          suggestions={(text) => idSuggestions(suggest, 'entity_type', text)}
                          onCommit={(text) => setEntry(index, 'type', text.trim())}
                          className="w-48"
                        />
                        <input
                          type="number"
                          aria-label={`${name} weight`}
                          className={`${inputClass} w-20`}
                          value={typeof spawn.weight === 'number' ? spawn.weight : ''}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            if (event.target.value !== '' && Number.isInteger(next)) {
                              setEntry(index, 'weight', next, typingKey(`${pointer}/weight`));
                            }
                          }}
                        />
                        {range === null ? (
                          <span className="text-muted text-xs">Count: edit under Advanced.</span>
                        ) : (
                          <>
                            <input
                              type="number"
                              aria-label={`${name} minimum count`}
                              className={`${inputClass} w-16`}
                              value={range[0]}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                if (event.target.value !== '' && Number.isInteger(next)) {
                                  setRange(next, Math.max(next, range[1]));
                                }
                              }}
                            />
                            <input
                              type="number"
                              aria-label={`${name} maximum count`}
                              className={`${inputClass} w-16`}
                              value={range[1]}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                if (event.target.value !== '' && Number.isInteger(next)) {
                                  setRange(Math.min(range[0], next), next);
                                }
                              }}
                            />
                          </>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          className={iconButtonClass}
                          onClick={() => setList(entries.filter((_, at) => at !== index))}
                        >
                          <X size={12} aria-hidden />
                        </button>
                      </div>
                    );
                  })}
                  <Button
                    className="self-start text-xs"
                    aria-label={`Add spawn to ${title}`}
                    disabled={spawnerNode === undefined}
                    onClick={() => {
                      if (spawnerNode === undefined) return;
                      setList([...entries, defaultValue(spawnerNode)]);
                    }}
                  >
                    <Plus size={12} aria-hidden />
                    Add spawn
                  </Button>
                </div>
              );
            })}
            {spawnCostsField !== undefined && (
              <div className="flex flex-col gap-1" data-testid="biome-spawn-costs">
                <h4 className="text-sm">Spawn costs</h4>
                <SubForm
                  node={spawnCostsField.type}
                  value={asObject(spawnsValue).spawn_costs}
                  pointer={pointerOf(['attributes', spawnsKey, 'spawn_costs'])}
                  label="Spawn costs"
                  problems={problems}
                  completions={completions}
                  onChange={subChange}
                />
              </div>
            )}
          </>
        )}
      </Section>
    );

  // Carvers.
  const carversField = field('carvers');
  const carvers =
    carversField === undefined ? null : (
      <Section title="Carvers" testId="biome-carvers">
        <SubForm
          node={carversField.type}
          value={data.carvers}
          pointer="/carvers"
          label="Carvers"
          problems={problems}
          completions={completions}
          onChange={subChange}
        />
      </Section>
    );

  return (
    <section aria-label="Biome Studio" data-testid="biome-studio" className="flex flex-col gap-4">
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="biome-advanced-toggle" />
      {climate}
      {colours}
      {featureSection}
      {spawnSection}
      {carvers}
    </section>
  );
}
