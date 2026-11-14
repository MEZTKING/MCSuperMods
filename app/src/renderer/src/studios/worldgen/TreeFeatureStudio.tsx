/**
 * Tree Feature Studio (ADR 0068 D5, B270) for `minecraft:worldgen/feature` elements of type
 * `minecraft:tree` (other feature types keep the schema form): the trunk and foliage placers
 * (types from the target's vendored registries, settings as a schema sub-form), the trunk,
 * leaves and below-trunk block providers (one block or a registered provider such as
 * `minecraft:soil_beneath_tree`), the leaf state filled in for project leaves, and the
 * decorators list. Everything else (minimum size, roots, vines) is behind "Advanced (all
 * fields)".
 */

import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { IdInput, idSuggestions, inputClass, ProblemList } from '../../forms';
import { defaultObject, resolveNode, stripMinecraft, structShape } from '../../forms/schema-utils';
import type { StudioProps } from '../types';
import { AdvancedToggle, Section, SubForm } from './parts';
import {
  blockProvider,
  lacksLeavesState,
  type ProviderShape,
  projectLeaves,
  readProvider,
  registryTypes,
  TREE_REGISTRIES,
  withLeavesState,
} from './tree-model';
import { asObject, fieldOf, humanise, listItem, moved, normaliseId } from './worldgen-model';

/** The sub-forms hide the type; the picker above them sets it. */
const HIDDEN_TYPE: readonly string[] = ['/type'];

type StructLike = SchemaNode & { kind: 'struct' | 'dispatcher' };

function structOf(node: SchemaNode | undefined): StructLike | undefined {
  if (node === undefined) return undefined;
  const resolved = resolveNode(node);
  return resolved.kind === 'struct' || resolved.kind === 'dispatcher' ? resolved : undefined;
}

/** A new typed value (placer or decorator) with the schema's required fields filled in. */
function typedValue(struct: StructLike | undefined, type: string): Json {
  return struct === undefined ? { type } : defaultObject(struct, { type });
}

/** A `<select>` of registry types, keeping an unknown current value as its own option. */
function TypeSelect({
  label,
  value,
  choices,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  choices: readonly string[];
  onChange(next: string): void;
  testId?: string;
}) {
  const current = value === '' ? '' : normaliseId(value);
  return (
    <select
      aria-label={label}
      data-testid={testId}
      className={`${inputClass} w-auto`}
      value={current}
      onChange={(event) => onChange(event.target.value)}
    >
      {current === '' && (
        <option value="" disabled>
          Choose a type…
        </option>
      )}
      {current !== '' && !choices.includes(current) && (
        <option value={current}>{stripMinecraft(current)}</option>
      )}
      {choices.map((choice) => (
        <option key={choice} value={choice}>
          {stripMinecraft(choice)}
        </option>
      ))}
    </select>
  );
}

interface PlacerProps {
  field: 'trunk_placer' | 'foliage_placer';
  label: string;
  choices: readonly string[];
  props: StudioProps;
}

/** One placer: its type from the registry and its settings as a schema sub-form. */
function PlacerPart({ field, label, choices, props }: PlacerProps) {
  const { node, element, problems, completions, onChange } = props;
  const value = asObject(element.data)[field];
  const placerNode = fieldOf(node, field, element.data)?.type;
  const struct = structOf(placerNode);
  const type = typeof asObject(value).type === 'string' ? (asObject(value).type as string) : '';
  const settings = struct === undefined ? [] : structShape(struct, value).fields;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="w-36 shrink-0">{label}</span>
        <TypeSelect
          label={label}
          testId={`tree-${field}-type`}
          value={type}
          choices={choices}
          onChange={(next) => onChange(`/${field}`, typedValue(struct, next))}
        />
      </div>
      {placerNode !== undefined && value !== undefined && settings.length > 0 && (
        <SubForm
          node={placerNode}
          value={value}
          pointer={`/${field}`}
          label={`${label} settings`}
          problems={problems}
          completions={completions}
          hiddenPaths={HIDDEN_TYPE}
          onChange={onChange}
        />
      )}
    </div>
  );
}

interface ProviderProps {
  field: 'trunk_provider' | 'foliage_provider' | 'below_trunk_provider';
  label: string;
  props: StudioProps;
  /** The project's leaves ids: a leaves block gets the tree leaf state. */
  leaves: ReadonlySet<string>;
  /** The provider a switch to "Registered provider" starts with. */
  defaultReference: string;
}

/** One block state provider: one block, a registered provider, or another provider. */
function ProviderPart({ field, label, props, leaves, defaultReference }: ProviderProps) {
  const { element, problems, suggest, onChange } = props;
  const value = asObject(element.data)[field];
  const shape: ProviderShape = readProvider(value);
  const pointer = `/${field}`;
  const commitBlock = (id: string) => {
    const trimmed = id.trim();
    const properties = shape.mode === 'block' ? shape.properties : {};
    const next = leaves.has(normaliseId(trimmed)) ? withLeavesState(properties) : properties;
    onChange(pointer, blockProvider(trimmed, next, value));
  };
  const mode = shape.mode === 'absent' ? 'block' : shape.mode;
  const setMode = (next: string) => {
    if (next === 'block') onChange(pointer, { id: '' });
    else if (next === 'reference') onChange(pointer, defaultReference);
  };
  return (
    <div className="flex flex-col gap-1" data-testid={`tree-${field}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="w-36 shrink-0">{label}</span>
        <select
          aria-label={`${label} source`}
          className={`${inputClass} w-auto`}
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="block">One block</option>
          <option value="reference">Registered provider</option>
          {mode === 'other' && (
            <option value="other" disabled>
              Other provider
            </option>
          )}
        </select>
        {mode === 'block' && (
          <IdInput
            value={shape.mode === 'block' ? shape.id : ''}
            label={label}
            placeholder="namespace:block"
            suggestions={(text) => idSuggestions(suggest, 'block', text)}
            onCommit={commitBlock}
          />
        )}
        {mode === 'reference' && (
          <IdInput
            value={shape.mode === 'reference' ? shape.id : ''}
            label={`${label} provider`}
            placeholder="namespace:id"
            suggestions={(text) => idSuggestions(suggest, TREE_REGISTRIES.provider, text)}
            onCommit={(text) => onChange(pointer, text.trim())}
          />
        )}
      </div>
      {shape.mode === 'other' && (
        <p className="text-muted text-xs">
          A {humanise(shape.type) || 'typed'} provider; edit it under Advanced, or pick a source
          above to replace it.
        </p>
      )}
      {shape.mode === 'block' && Object.keys(shape.properties).length > 0 && (
        <p className="text-muted text-xs">
          State:{' '}
          {Object.entries(shape.properties)
            .map(([key, entry]) => `${key}=${entry}`)
            .join(', ')}
        </p>
      )}
      {lacksLeavesState(shape, leaves) && shape.mode === 'block' && (
        <div className="flex items-center gap-2">
          <p className="text-warning text-xs">
            Project leaves need distance 7 and persistent false here to decay like vanilla leaves.
          </p>
          <Button
            className="text-xs"
            onClick={() =>
              onChange(pointer, blockProvider(shape.id, withLeavesState(shape.properties), value))
            }
          >
            Fill in leaf state
          </Button>
        </div>
      )}
      <ProblemList
        problems={problems.filter(
          (problem) => problem.path === pointer || problem.path.startsWith(`${pointer}/`),
        )}
      />
    </div>
  );
}

/** The decorators list: type from the registry, settings per decorator. */
function DecoratorsPart({ choices, props }: { choices: readonly string[]; props: StudioProps }) {
  const { node, element, problems, completions, onChange } = props;
  const [newType, setNewType] = useState('');
  const itemNode = listItem(fieldOf(node, 'decorators', element.data)?.type);
  const struct = structOf(itemNode);
  const raw = asObject(element.data).decorators;
  const decorators = Array.isArray(raw) ? raw : [];
  const setDecorators = (next: Json[]) => onChange('/decorators', next);
  const addType = newType !== '' ? newType : (choices[0] ?? '');
  return (
    <>
      {decorators.length === 0 && <p className="text-muted text-xs">None.</p>}
      <ol className="flex flex-col gap-2">
        {decorators.map((decorator, index) => {
          const name = `Decorator ${index + 1}`;
          const value = asObject(decorator);
          const type = typeof value.type === 'string' ? value.type : '';
          const settings = struct === undefined ? [] : structShape(struct, decorator).fields;
          return (
            <li
              key={index}
              data-testid={`tree-decorator-${index}`}
              className="flex flex-col gap-1 rounded border border-border p-1.5"
            >
              <div className="flex items-center gap-1">
                <span className="font-medium text-sm">{name}</span>
                <TypeSelect
                  label={`${name} type`}
                  value={type}
                  choices={choices}
                  onChange={(next) => onChange(`/decorators/${index}`, typedValue(struct, next))}
                />
                <button
                  type="button"
                  aria-label={`Move ${name} up`}
                  className={`${iconButtonClass} ml-auto`}
                  disabled={index === 0}
                  onClick={() => setDecorators(moved(decorators, index, index - 1))}
                >
                  <ArrowUp size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${name} down`}
                  className={iconButtonClass}
                  disabled={index === decorators.length - 1}
                  onClick={() => setDecorators(moved(decorators, index, index + 1))}
                >
                  <ArrowDown size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  className={iconButtonClass}
                  onClick={() => setDecorators(decorators.filter((_, at) => at !== index))}
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
              {itemNode !== undefined && settings.length > 0 ? (
                <SubForm
                  node={itemNode}
                  value={decorator}
                  pointer={`/decorators/${index}`}
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
        <TypeSelect
          label="New decorator type"
          value={addType}
          choices={choices}
          onChange={setNewType}
        />
        <Button
          className="text-xs"
          disabled={addType === ''}
          onClick={() => setDecorators([...decorators, typedValue(struct, addType)])}
        >
          <Plus size={12} aria-hidden />
          Add decorator
        </Button>
      </div>
    </>
  );
}

export function TreeFeatureStudio(props: StudioProps) {
  const { project, context } = props;
  const [advanced, setAdvanced] = useState(false);

  if (advanced) {
    return (
      <section
        aria-label="Tree Feature Studio"
        data-testid="tree-feature-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="tree-advanced-toggle" />
        {props.form}
      </section>
    );
  }

  const vanilla = context.vanillaRegistries;
  const trunkPlacers = registryTypes(vanilla, TREE_REGISTRIES.trunkPlacer);
  const foliagePlacers = registryTypes(vanilla, TREE_REGISTRIES.foliagePlacer);
  const decorators = registryTypes(vanilla, TREE_REGISTRIES.decorator);
  const references = props.suggest(TREE_REGISTRIES.provider, '');
  const soil = references.find((id) => normaliseId(id) === 'minecraft:soil_beneath_tree');
  const defaultReference = soil ?? references[0] ?? '';
  const leaves = projectLeaves(project);

  return (
    <section
      aria-label="Tree Feature Studio"
      data-testid="tree-feature-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="tree-advanced-toggle" />
      <Section title="Trunk" testId="tree-trunk-section">
        <PlacerPart field="trunk_placer" label="Trunk shape" choices={trunkPlacers} props={props} />
        <ProviderPart
          field="trunk_provider"
          label="Trunk block"
          props={props}
          leaves={leaves}
          defaultReference={defaultReference}
        />
      </Section>
      <Section title="Leaves" testId="tree-leaves-section">
        <PlacerPart
          field="foliage_placer"
          label="Leaves shape"
          choices={foliagePlacers}
          props={props}
        />
        <ProviderPart
          field="foliage_provider"
          label="Leaves block"
          props={props}
          leaves={leaves}
          defaultReference={defaultReference}
        />
        <p className="text-muted text-xs">
          Leaves decay only when the trunk block is in the minecraft:logs tag.
        </p>
      </Section>
      <Section title="Below the trunk" testId="tree-below-section">
        <ProviderPart
          field="below_trunk_provider"
          label="Ground block"
          props={props}
          leaves={leaves}
          defaultReference={defaultReference}
        />
      </Section>
      <Section title="Decorators" testId="tree-decorators-section">
        <DecoratorsPart choices={decorators} props={props} />
      </Section>
      <p className="text-muted text-xs">
        Tree shapes are vanilla's placers only. Minimum size, roots and vines are under Advanced.
      </p>
    </section>
  );
}
