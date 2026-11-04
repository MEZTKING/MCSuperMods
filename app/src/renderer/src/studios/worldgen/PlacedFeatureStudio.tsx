/**
 * Placed Feature Studio (plan D7, B80) for `minecraft:worldgen/placed_feature`: the configured
 * feature it places (project or vanilla `worldgen/feature` ids), its ordered placement
 * modifiers (type from the schema's placement modifier dispatcher plus the registry's
 * settings-free types, settings as a schema sub-form per modifier) and "Used in" (project
 * biomes and decoration steps). Everything else behind "Advanced (all fields)".
 */

import type { Json } from '@msm/core';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { IdInput, idSuggestions, inputClass, ProblemList } from '../../forms';
import { discriminatorKeys } from '../../forms/StructEditor';
import { defaultObject, resolveNode, stripMinecraft, structShape } from '../../forms/schema-utils';
import type { StudioProps } from '../types';
import { AdvancedToggle, Section, SubForm } from './parts';
import { asObject, fieldOf, humanise, listItem, moved, placedFeatureUses } from './worldgen-model';

/** Settings-free modifiers have only their type; the sub-form hides it. */
const HIDDEN_TYPE: readonly string[] = ['/type'];

/** A dispatcher key as the game writes it: namespaced. */
const typeId = (key: string): string => (key.includes(':') ? key : `minecraft:${key}`);

export function PlacedFeatureStudio(props: StudioProps) {
  const { project, element, node, target, problems, completions, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  const [newType, setNewType] = useState('');
  const data = asObject(element.data);

  if (advanced) {
    return (
      <section
        aria-label="Placed Feature Studio"
        data-testid="placed-feature-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="placed-feature-advanced-toggle"
        />
        {props.form}
      </section>
    );
  }

  const itemNode = listItem(fieldOf(node, 'placement', element.data)?.type);
  const item = itemNode === undefined ? undefined : resolveNode(itemNode);
  const itemStruct = item?.kind === 'struct' || item?.kind === 'dispatcher' ? item : undefined;
  const typesFor = (value: Json | undefined): string[] => {
    if (itemStruct === undefined) return [];
    const discriminator = structShape(itemStruct, value).discriminators.find(
      (entry) => entry.key === 'type',
    );
    return discriminator === undefined ? [] : discriminatorKeys(discriminator, completions);
  };
  const types = typesFor({});
  const placement = Array.isArray(data.placement) ? data.placement : [];
  const setPlacement = (next: Json[]) => onChange('/placement', next);
  const newModifier = (key: string): Json =>
    itemStruct === undefined
      ? { type: typeId(key) }
      : defaultObject(itemStruct, { type: typeId(key) });

  const feature = data.feature;
  const uses = placedFeatureUses(project, element.id);
  const steps = target.worldgen.featureSteps;
  const addType = newType !== '' ? newType : (types[0] ?? '');

  return (
    <section
      aria-label="Placed Feature Studio"
      data-testid="placed-feature-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle
        checked={advanced}
        onChange={setAdvanced}
        testId="placed-feature-advanced-toggle"
      />
      <Section title="Feature" testId="placed-feature-feature-section">
        {feature === undefined || typeof feature === 'string' ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-36 shrink-0">Configured feature</span>
            <IdInput
              value={typeof feature === 'string' ? feature : ''}
              label="Configured feature"
              testId="placed-feature-feature"
              placeholder="namespace:id"
              suggestions={(text) => idSuggestions(suggest, 'worldgen/feature', text)}
              onCommit={(text) => onChange('/feature', text.trim())}
            />
          </div>
        ) : (
          <p className="text-muted text-sm">
            This placed feature holds its configured feature inline; edit it under Advanced.
          </p>
        )}
        <ProblemList problems={problems.filter((problem) => problem.path === '/feature')} />
      </Section>

      <Section title="Placement modifiers" testId="placed-feature-modifiers">
        <p className="text-muted text-xs">
          Modifiers run in order: each turns every position it receives into zero or more.
        </p>
        {placement.length === 0 && <p className="text-muted text-xs">None.</p>}
        <ol className="flex flex-col gap-2">
          {placement.map((modifier, index) => {
            const name = `Modifier ${index + 1}`;
            const value = asObject(modifier);
            const current = typeof value.type === 'string' ? stripMinecraft(value.type) : '';
            const choices = typesFor(modifier);
            const settings =
              itemStruct === undefined ? [] : structShape(itemStruct, modifier).fields;
            return (
              <li
                key={index}
                data-testid={`placement-modifier-${index}`}
                className="flex flex-col gap-1 rounded border border-border p-1.5"
              >
                <div className="flex items-center gap-1">
                  <span className="font-medium text-sm">{name}</span>
                  <select
                    aria-label={`${name} type`}
                    className={`${inputClass} w-auto`}
                    value={current}
                    onChange={(event) =>
                      onChange(`/placement/${index}`, newModifier(event.target.value))
                    }
                  >
                    {current === '' && (
                      <option value="" disabled>
                        Choose a type…
                      </option>
                    )}
                    {current !== '' && !choices.includes(current) && (
                      <option value={current}>{current}</option>
                    )}
                    {choices.map((choice) => (
                      <option key={choice} value={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Move ${name} up`}
                    className={`${iconButtonClass} ml-auto`}
                    disabled={index === 0}
                    onClick={() => setPlacement(moved(placement, index, index - 1))}
                  >
                    <ArrowUp size={12} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${name} down`}
                    className={iconButtonClass}
                    disabled={index === placement.length - 1}
                    onClick={() => setPlacement(moved(placement, index, index + 1))}
                  >
                    <ArrowDown size={12} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    className={iconButtonClass}
                    onClick={() => setPlacement(placement.filter((_, at) => at !== index))}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </div>
                {itemNode !== undefined && settings.length > 0 ? (
                  <SubForm
                    node={itemNode}
                    value={modifier}
                    pointer={`/placement/${index}`}
                    label={`${name} settings`}
                    problems={problems}
                    completions={completions}
                    hiddenPaths={HIDDEN_TYPE}
                    onChange={onChange}
                  />
                ) : (
                  <p className="text-muted text-xs">No settings.</p>
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-1">
          <select
            aria-label="New modifier type"
            className={`${inputClass} w-auto`}
            value={addType}
            onChange={(event) => setNewType(event.target.value)}
          >
            {types.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
          <Button
            className="text-xs"
            disabled={addType === ''}
            onClick={() => setPlacement([...placement, newModifier(addType)])}
          >
            <Plus size={12} aria-hidden />
            Add modifier
          </Button>
        </div>
      </Section>

      <Section title="Used in" testId="placed-feature-used-in">
        {uses.length === 0 ? (
          <p className="text-muted text-xs">No biome in this project places it.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-sm">
            {uses.map((use) => (
              <li key={`${use.biome}:${use.step}`}>
                <code className="font-mono">{use.biome}</code> —{' '}
                {steps[use.step] === undefined
                  ? `step ${use.step + 1}`
                  : humanise(steps[use.step] as string)}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </section>
  );
}
