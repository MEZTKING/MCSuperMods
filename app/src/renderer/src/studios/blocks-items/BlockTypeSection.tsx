/**
 * The Block Studio's Type section (B268, ADR 0069 D5): the Type picker, which changes the type
 * in one undoable edit (shared fields stay, the old type's fields go, {@link withBlockType}),
 * and the building types' own fields: base block (stairs), set type (doors, trapdoors,
 * buttons, pressure plates), press time (buttons), weighted maximum (pressure plates), wood
 * type (fence gates) and whether a fence is wooden. Set and wood types come from the target's
 * block facts (`Target.blocks`), else from the schema.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { WOOD_SOUND_TYPES, WOODEN_SET_TYPES } from '@msm/plugin-blocks-items';
import type { SchemaNode } from '@msm/schemas';
import { useId } from 'react';
import { type FormProblem, inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { IdField, NumberField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import {
  appearanceTexture,
  BLOCK_TYPE_LABELS,
  type BlockTypeName,
  BUILDING_BLOCK_TYPES,
  blockTypeOfData,
  isBlockType,
  SET_TYPE_LABELS,
  WOOD_TYPE_LABELS,
  withBlockType,
} from './block-type-model';
import { asObject, choicesAt, pointerOf } from './blocks-items-model';
import { CheckField, ProblemsAt } from './parts';

/** A select whose options show words for their values. */
function LabelledSelect(props: {
  label: string;
  value: string | undefined;
  choices: readonly string[];
  labels: Readonly<Record<string, string>>;
  onChange(value: string | undefined): void;
  emptyLabel?: string;
  testId?: string;
}) {
  const id = useId();
  const current = props.value ?? '';
  const options = [...props.choices];
  if (current !== '' && !options.includes(current)) options.unshift(current);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={props.testId}
        value={current}
        onChange={(event) =>
          props.onChange(event.target.value === '' ? undefined : event.target.value)
        }
      >
        {(props.emptyLabel !== undefined || current === '') && (
          <option value="">{props.emptyLabel ?? '(none)'}</option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {props.labels[option] ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Props of {@link BlockTypeSection}. */
export interface BlockTypeSectionProps {
  project: Project;
  data: Json;
  node: SchemaNode;
  target: Target;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  /** Sets one field (the Studio's path setter). */
  set(path: readonly (string | number)[], value: Json | undefined, coalesce?: string): void;
  /** Replaces the whole element data in one edit (the type change). */
  replace(data: Json): void;
}

/** The set type names: the target's facts, else the schema's choices. */
function setTypeChoices(props: BlockTypeSectionProps): readonly string[] {
  const facts = props.target.blocks?.setTypes;
  if (facts !== undefined && facts.length > 0) return facts;
  return choicesAt(props.node, props.data, ['set_type']);
}

/** The wood type names: the target's facts, else the schema's choices. */
function woodTypeChoices(props: BlockTypeSectionProps): readonly string[] {
  const facts = props.target.blocks?.woodTypes;
  if (facts !== undefined && facts.length > 0) return facts;
  return choicesAt(props.node, props.data, ['wood_type']);
}

export function BlockTypeSection(props: BlockTypeSectionProps) {
  const { data, problems, set } = props;
  const object = asObject(data);
  const type = blockTypeOfData(data);
  const at = (path: readonly string[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );
  const choices: BlockTypeName[] = [...BUILDING_BLOCK_TYPES];
  if (type !== undefined && !choices.includes(type)) choices.push(type);
  const setType = typeof object.set_type === 'string' ? object.set_type : undefined;
  const wooden = setType !== undefined && WOODEN_SET_TYPES.includes(setType);
  const soundType = typeof object.sound_type === 'string' ? object.sound_type : 'stone';

  const setTypeField = (
    <>
      <LabelledSelect
        label="Set type"
        value={setType}
        choices={setTypeChoices(props)}
        labels={SET_TYPE_LABELS}
        testId="block-set-type"
        onChange={(value) => set(['set_type'], value)}
      />
      {at(['set_type'])}
    </>
  );

  return (
    <Section title="Type" testId="block-type">
      <LabelledSelect
        label="Type"
        value={type ?? (typeof object.type === 'string' ? object.type : undefined)}
        choices={choices}
        labels={BLOCK_TYPE_LABELS}
        testId="block-type-picker"
        onChange={(value) => {
          const next = value === undefined ? 'block' : value;
          if (!isBlockType(next) || next === type) return;
          props.replace(
            withBlockType(data, next, {
              setTypes: props.target.blocks?.setTypes,
              woodTypes: props.target.blocks?.woodTypes,
              texture: appearanceTexture(props.project, data),
            }),
          );
        }}
      />
      <p className="text-muted text-xs" data-testid="block-type-note">
        Changing the type keeps the name, mining, sounds, item and events, and drops the fields of
        the old type.
      </p>
      {at(['type'])}
      {type === 'stairs' && (
        <>
          <IdField
            label="Base block"
            value={typeof object.base_block === 'string' ? object.base_block : ''}
            registry="block"
            suggest={props.suggest}
            testId="block-base-block"
            onCommit={(value) => set(['base_block'], value === '' ? undefined : value)}
          />
          <p className="text-muted text-xs">
            The block whose look and behaviour the stairs copy; empty means stone. A block from this
            project is registered before the stairs.
          </p>
          {at(['base_block'])}
        </>
      )}
      {(type === 'door' || type === 'trapdoor') && setTypeField}
      {type === 'button' && (
        <>
          {setTypeField}
          <NumberField
            label="Press time (ticks)"
            value={object.press_ticks}
            integer
            allowEmpty
            testId="block-press-ticks"
            onCommit={(value) => set(['press_ticks'], value, typingKey('/press_ticks'))}
          />
          <p className="text-muted text-xs">
            How long the button stays pressed; empty means {wooden ? 30 : 20} ticks (
            {wooden ? 'wooden buttons' : 'other buttons'}, as vanilla). Arrows press only wooden
            buttons.
          </p>
          {at(['press_ticks'])}
        </>
      )}
      {type === 'pressure_plate' && (
        <>
          {setTypeField}
          <CheckField
            label="Weighted (the signal grows with the number of entities, like gold and iron plates)"
            checked={object.weighted_max !== undefined}
            testId="block-weighted"
            onChange={(checked) => set(['weighted_max'], checked ? 15 : undefined)}
          />
          {object.weighted_max !== undefined && (
            <NumberField
              label="Entities for the full signal"
              value={object.weighted_max}
              integer
              testId="block-weighted-max"
              onCommit={(value) => set(['weighted_max'], value, typingKey('/weighted_max'))}
            />
          )}
          <p className="text-muted text-xs">
            {wooden
              ? 'A wooden plate is pressed by any entity, items included.'
              : 'This plate is pressed by mobs and players only.'}
          </p>
          {at(['weighted_max'])}
        </>
      )}
      {type === 'fence_gate' && (
        <>
          <LabelledSelect
            label="Wood type (open and close sounds)"
            value={typeof object.wood_type === 'string' ? object.wood_type : undefined}
            choices={woodTypeChoices(props)}
            labels={WOOD_TYPE_LABELS}
            testId="block-wood-type"
            onChange={(value) => set(['wood_type'], value)}
          />
          {at(['wood_type'])}
        </>
      )}
      {type === 'fence' && (
        <>
          <LabelledSelect
            label="Connects to wooden fences"
            value={object.wooden === true ? 'yes' : object.wooden === false ? 'no' : undefined}
            choices={['yes', 'no']}
            labels={{ yes: 'Yes', no: 'No' }}
            emptyLabel={`(from the sound type: ${WOOD_SOUND_TYPES.includes(soundType) ? 'yes' : 'no'})`}
            testId="block-fence-wooden"
            onChange={(value) => set(['wooden'], value === undefined ? undefined : value === 'yes')}
          />
          {at(['wooden'])}
        </>
      )}
      {type !== undefined && ['crop', 'sapling', 'leaves'].includes(type) && (
        <p className="text-muted text-xs" data-testid="block-type-plant-note">
          Edit this plant's own fields under "Advanced (all fields)".
        </p>
      )}
    </Section>
  );
}
