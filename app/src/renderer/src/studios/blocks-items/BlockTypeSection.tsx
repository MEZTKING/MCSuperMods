/**
 * The Block Studio's Type section (B268, ADR 0069 D5): the Type picker, which changes the type
 * in one undoable edit (shared fields stay, the old type's fields go, {@link withBlockType}),
 * and the building types' own fields: base block (stairs), set type (doors, trapdoors,
 * buttons, pressure plates), press time (buttons), weighted maximum (pressure plates), wood
 * type (fence gates) and whether a fence is wooden. Set and wood types come from the target's
 * block facts (`Target.blocks`), else from the schema. The plant types (crop, sapling, leaves)
 * are offered too (B272); their own fields are in `PlantSection`.
 *
 * B452 (ADR 0101 D1): the picker groups every type as "Building blocks", "Plants" and
 * "Furniture and lights", with a picture for each type (the picture of the chosen type beside the
 * picker, and every type as a picture under "Pick from pictures"); the furniture types' own
 * fields: a bed's rule and colour, a torch's flame particle, a sign's wood type (sounds); the
 * companion block shown as part of the element ("Also makes: ..."); and the Waterlogging switch
 * (`WaterloggingSwitch`).
 *
 * B516 (ADR 0103, ADR 0105 D2, ADR 0112 D1): the growing plants and the flower pot join the
 * "Plants" group; the set type picker also edits an own set type's `base` (its own sounds and
 * rules are in the Sounds section); the companions of the new types are said in words, and in
 * Very easy without their ids.
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
import { useVeryEasy } from '../very-easy';
import { Section } from '../worldgen/parts';
import {
  appearanceTexture,
  BED_RULE_LABELS,
  BLOCK_TYPE_GROUPS,
  BLOCK_TYPE_LABELS,
  type BlockTypeName,
  blockTypeOfData,
  companionRows,
  dyeColourLabel,
  isBlockType,
  isSignType,
  SET_TYPE_LABELS,
  WOOD_TYPE_LABELS,
  withBlockType,
} from './block-type-model';
import { BlockTypePicture } from './block-type-pictures';
import { asObject, choicesAt, pointerOf } from './blocks-items-model';
import { CheckField, ProblemsAt } from './parts';
import { isOwnSetType, setTypeBase, withSetTypeBase } from './sounds-model';
import { WaterloggingSwitch } from './WaterloggingSwitch';

/** A select whose options show words for their values. */
function LabelledSelect(props: {
  label: string;
  value: string | undefined;
  choices: readonly string[];
  labels: Readonly<Record<string, string>>;
  onChange(value: string | undefined): void;
  emptyLabel?: string;
  testId?: string;
  /** Option groups (`<optgroup>`); `choices` not in a group come first. */
  groups?: readonly { label: string; choices: readonly string[] }[];
}) {
  const id = useId();
  const current = props.value ?? '';
  const grouped = new Set((props.groups ?? []).flatMap((group) => group.choices));
  const options = props.choices.filter((choice) => !grouped.has(choice));
  if (current !== '' && !props.choices.includes(current) && !grouped.has(current)) {
    options.unshift(current);
  }
  const option = (value: string) => (
    <option key={value} value={value}>
      {props.labels[value] ?? value}
    </option>
  );
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
        {options.map(option)}
        {(props.groups ?? []).map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.choices.map(option)}
          </optgroup>
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
  /** The element's id: the companion blocks and a new berry bush's berry (B452). */
  elementId?: string;
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

/** The bed rule names: the target's facts (`blocks.bedRules`), else the schema's choices. */
function bedRuleChoices(props: BlockTypeSectionProps): readonly string[] {
  const facts = props.target.blocks?.bedRules;
  if (facts !== undefined && Object.keys(facts).length > 0) return Object.keys(facts);
  return choicesAt(props.node, props.data, ['rule']);
}

/** The dye colours: the target's facts (`blocks.dyeColours`), else the schema's choices. */
function dyeColourChoices(props: BlockTypeSectionProps): readonly string[] {
  const facts = props.target.blocks?.dyeColours;
  if (facts !== undefined && facts.length > 0) return facts;
  return choicesAt(props.node, props.data, ['colour']);
}

/** Every type as a picture, in the picker's groups ("Pick from pictures"). */
function TypePictures(props: {
  current: BlockTypeName | undefined;
  pick(type: BlockTypeName): void;
}) {
  return (
    <details className="text-xs" data-testid="block-type-pictures">
      <summary className="cursor-pointer text-muted">Pick from pictures</summary>
      <div className="mt-1 flex flex-col gap-2">
        {BLOCK_TYPE_GROUPS.map((group) => (
          <fieldset key={group.id} className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="font-medium text-xs" data-testid={`block-type-group-${group.id}`}>
              {group.label}
            </legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1">
              {group.types.map((type) => {
                const chosen = type === props.current;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={chosen}
                    title={BLOCK_TYPE_LABELS[type]}
                    data-testid={`block-type-tile-${type}`}
                    className={`flex flex-col items-center gap-0.5 rounded border p-1 text-center ${
                      chosen ? 'border-accent bg-accent/10' : 'border-border hover:bg-hover'
                    }`}
                    onClick={() => props.pick(type)}
                  >
                    <BlockTypePicture type={type} size={22} />
                    <span className="leading-tight">{BLOCK_TYPE_LABELS[type].split(' (')[0]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </details>
  );
}

export function BlockTypeSection(props: BlockTypeSectionProps) {
  const { data, problems, set } = props;
  const object = asObject(data);
  const type = blockTypeOfData(data);
  const at = (path: readonly string[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );
  const groups = BLOCK_TYPE_GROUPS.map((group) => ({
    label: group.label,
    choices: group.types,
  }));
  const veryEasy = useVeryEasy();
  // An own set type (ADR 0105 D2) stands on its `base`, which this picker shows and changes.
  const setType = setTypeBase(object.set_type);
  const ownSetType = isOwnSetType(object.set_type);
  const wooden = setType !== undefined && WOODEN_SET_TYPES.includes(setType);
  const soundType = typeof object.sound_type === 'string' ? object.sound_type : 'stone';

  const changeType = (next: string) => {
    if (!isBlockType(next) || next === type) return;
    props.replace(
      withBlockType(data, next, {
        setTypes: props.target.blocks?.setTypes,
        woodTypes: props.target.blocks?.woodTypes,
        texture: appearanceTexture(props.project, data),
        blockId: props.elementId,
      }),
    );
  };
  const companions =
    props.elementId === undefined ? [] : companionRows({ id: props.elementId, data });
  const torchDefault = props.target.blocks?.defaultTorchParticle;

  const setTypeField = (
    <>
      <LabelledSelect
        label={ownSetType ? 'Set type (its own sounds stand on this one)' : 'Set type'}
        value={setType}
        choices={setTypeChoices(props)}
        labels={SET_TYPE_LABELS}
        testId="block-set-type"
        onChange={(value) =>
          set(
            ['set_type'],
            value === undefined ? undefined : withSetTypeBase(object.set_type, value),
          )
        }
      />
      {at(['set_type'])}
    </>
  );

  return (
    <Section title="Type" testId="block-type">
      <div className="flex items-end gap-2">
        {type !== undefined && (
          <span className="mb-1 shrink-0" data-testid="block-type-current-picture">
            <BlockTypePicture type={type} size={28} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <LabelledSelect
            label="Type"
            value={type ?? (typeof object.type === 'string' ? object.type : undefined)}
            choices={[]}
            groups={groups}
            labels={BLOCK_TYPE_LABELS}
            testId="block-type-picker"
            onChange={(value) => changeType(value === undefined ? 'block' : value)}
          />
        </div>
      </div>
      <TypePictures current={type} pick={changeType} />
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
      {type === 'bed' && (
        <>
          <LabelledSelect
            label="Sleeping rule"
            value={typeof object.rule === 'string' ? object.rule : undefined}
            choices={bedRuleChoices(props)}
            labels={BED_RULE_LABELS}
            emptyLabel="(like a bed)"
            testId="block-bed-rule"
            onChange={(value) => set(['rule'], value)}
          />
          {at(['rule'])}
          <LabelledSelect
            label="Bed colour"
            value={typeof object.colour === 'string' ? object.colour : undefined}
            choices={dyeColourChoices(props)}
            labels={Object.fromEntries(
              dyeColourChoices(props).map((colour) => [colour, dyeColourLabel(colour)]),
            )}
            emptyLabel="(white)"
            testId="block-bed-colour"
            onChange={(value) => set(['colour'], value)}
          />
          <p className="text-muted text-xs">
            The colour is only read by Minecraft's own code that asks what colour a bed is; the look
            comes from the bed picture. Players sleep in it and set their spawn; villagers do not
            use it.
          </p>
          {at(['colour'])}
        </>
      )}
      {type === 'torch' && (
        <>
          <IdField
            label={`Flame particle (empty: ${torchDefault ?? "the game's torch flame"})`}
            value={typeof object.particle === 'string' ? object.particle : ''}
            registry="particle_type"
            suggest={props.suggest}
            testId="block-torch-particle"
            onCommit={(value) => set(['particle'], value === '' ? undefined : value)}
          />
          <p className="text-muted text-xs">
            A particle without settings, such as a flame or one of your own particles.
          </p>
          {at(['particle'])}
        </>
      )}
      {isSignType(type) && (
        <>
          <LabelledSelect
            label="Wood type (sounds)"
            value={typeof object.wood_type === 'string' ? object.wood_type : undefined}
            choices={woodTypeChoices(props)}
            labels={WOOD_TYPE_LABELS}
            testId="block-sign-wood-type"
            onChange={(value) => set(['wood_type'], value)}
          />
          <p className="text-muted text-xs">
            Players write on it in Minecraft's own sign screen, with dyes, glow ink and honeycomb.
            The look is your own: set the pictures in the Textures section.
          </p>
          {at(['wood_type'])}
        </>
      )}
      {companions.length > 0 && (
        <div className="flex flex-col gap-0.5 text-xs" data-testid="block-companion">
          {companions.map((companion) => (
            <p key={companion.id} data-testid="block-companion-row">
              <span className="text-muted">Also makes:</span>{' '}
              {veryEasy ? (
                <span>{companion.words}</span>
              ) : (
                <>
                  <span className="font-mono">{companion.id}</span>{' '}
                  <span className="text-muted">({companion.words})</span>
                </>
              )}
            </p>
          ))}
          <p className="text-muted">
            {type === 'flower_pot'
              ? 'They are part of this pot: none has an item of its own, and breaking one drops the pot and the plant.'
              : "It is part of this block: it has no item of its own and drops this block's item."}
          </p>
        </div>
      )}
      {type !== undefined && (
        <WaterloggingSwitch type={type} data={data} problems={problems} replace={props.replace} />
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
    </Section>
  );
}
