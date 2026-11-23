/**
 * The Block Studio's Sounds section, "How it sounds" (B516, ADR 0105 D1, D2, ADR 0112 D1):
 *
 * - The block's own sounds (`block_sounds`): when it breaks, when you walk on it, when you place
 *   it, while you mine it and when something lands on it, each a vanilla or project sound event;
 *   a sound left empty is the sound type's. Volume and pitch. On a target whose sounds are data
 *   (`blocks.soundModel` `block_sound_set`) a change shows after the world is opened again.
 * - For a door, trapdoor, button or pressure plate, its own set type ("Own door sounds"): the
 *   open and close (or press and release) sounds and the rules that go with the set type (opened
 *   by hand or by a wind charge, pressed by arrows, what presses a plate), every one left empty
 *   being the vanilla set type's it stands on.
 *
 * Easy picks a sound by id with suggestions; Very easy picks it by name in the ThingPicker, so no
 * id is shown. Every change is one undo step. Each sound has a Play button (ADR 0121 D2, B622),
 * at the block's own volume and pitch; an empty one plays nothing.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { WOODEN_SET_TYPES } from '@msm/plugin-blocks-items';
import { useId, useMemo, useState } from 'react';
import { SoundPlayButton } from '../../audio/SoundPlayButton';
import {
  ThingPicker,
  type ThingPictures,
  type ThingRegistries,
  thingName,
  thingSections,
} from '../../components/thing-picker/ThingPicker';
import { buttonClass } from '../../components/ui/Button';
import { type FormProblem, inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { IdField, NumberField } from '../structures/pickers';
import { useVeryEasy } from '../very-easy';
import { Section } from '../worldgen/parts';
import { blockTypeOfData } from './block-type-model';
import { asObject, pointerOf } from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import { CheckField, ProblemsAt } from './parts';
import {
  BLOCK_SOUND_EVENTS,
  BLOCK_SOUND_LABELS,
  BLOCK_SOUND_LIMITS,
  type BlockSoundEvent,
  blockSoundsOf,
  isOwnSetType,
  ownSetTypeLabel,
  PLATE_SENSITIVITY_LABELS,
  SET_TYPE_SOUND_LABELS,
  type SetTypeRule,
  setTypeBase,
  setTypeSoundsOf,
  takesSetType,
  withBlockSound,
  withOwnSetType,
  withSetTypeRule,
  withSetTypeSound,
} from './sounds-model';

type SetPath = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

/** Props of {@link SoundsSection}. */
export interface SoundsSectionProps {
  project: Project;
  element: Element;
  target: Target;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  set: SetPath;
  /**
   * Every sound event id (vanilla and the project's), for the ThingPicker; absent: the
   * suggestions (at most 200).
   */
  registries?: ThingRegistries | undefined;
}

/** One sound: an id field in Easy, a named chip opening the ThingPicker in Very easy. */
function SoundField(props: {
  project: Project;
  label: string;
  value: string;
  emptyLabel: string;
  testId: string;
  suggest(registry: string, prefix: string): string[];
  registries: ThingRegistries;
  pictures: ThingPictures | null;
  texturesFolder: string;
  /** The volume and pitch Play multiplies by (the block's own). */
  sound?: { volume?: number; pitch?: number } | undefined;
  onChange(value: string | undefined): void;
}) {
  const veryEasy = useVeryEasy();
  const [open, setOpen] = useState(false);
  const sections = useMemo(
    () =>
      open
        ? thingSections({
            project: props.project,
            registries: props.registries,
            sort: 'sound',
            texturesFolder: props.texturesFolder,
          })
        : [],
    [open, props.project, props.registries, props.texturesFolder],
  );
  if (!veryEasy) {
    return (
      <IdField
        label={`${props.label} (empty: ${props.emptyLabel})`}
        value={props.value}
        registry="sound_event"
        suggest={props.suggest}
        testId={props.testId}
        sound={props.sound}
        onCommit={(text) => props.onChange(text.trim() === '' ? undefined : text.trim())}
      />
    );
  }
  const words =
    props.value === '' ? props.emptyLabel : thingName(props.project, props.value, 'sound');
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <span className="text-muted">{props.label}</span>
      <span className="flex items-center gap-1 self-start">
        <button
          type="button"
          className={buttonClass}
          data-testid={props.testId}
          onClick={() => setOpen(true)}
        >
          {words}
        </button>
        {props.value !== '' && (
          <SoundPlayButton event={props.value} compact {...(props.sound ?? {})} />
        )}
      </span>
      {open && (
        <ThingPicker
          title={`Pick a sound: ${props.label.toLowerCase()}`}
          sort="sound"
          sections={sections}
          value={props.value === '' ? undefined : props.value}
          pictures={props.pictures}
          noneLabel={props.emptyLabel}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            props.onChange(id ?? undefined);
          }}
        />
      )}
    </div>
  );
}

/** A yes or no rule whose empty choice is the base's. */
function RuleSelect(props: {
  label: string;
  value: Json | undefined;
  baseWords: string;
  labels?: Readonly<Record<string, string>>;
  testId: string;
  onChange(value: Json | undefined): void;
}) {
  const id = useId();
  const labels = props.labels ?? { yes: 'Yes', no: 'No' };
  const current =
    props.labels !== undefined
      ? typeof props.value === 'string'
        ? props.value
        : ''
      : props.value === true
        ? 'yes'
        : props.value === false
          ? 'no'
          : '';
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
        onChange={(event) => {
          const next = event.target.value;
          if (next === '') props.onChange(undefined);
          else if (props.labels !== undefined) props.onChange(next);
          else props.onChange(next === 'yes');
        }}
      >
        <option value="">{`(as the set type it stands on: ${props.baseWords})`}</option>
        {Object.entries(labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SoundsSection(props: SoundsSectionProps) {
  const { project, element, target, problems, suggest, set } = props;
  const host = useBlocksItemsStudioHost();
  const data = asObject(element.data);
  const type = blockTypeOfData(element.data);
  const sounds = blockSoundsOf(element.data);
  const soundType = typeof data.sound_type === 'string' ? data.sound_type : 'stone';
  const dataDriven = target.blocks?.soundModel === 'block_sound_set';
  const texturesFolder = target.folders.resource.textures;
  const registries = useMemo<ThingRegistries>(
    () =>
      props.registries ?? {
        ids: (registry) => suggest(registry, ''),
      },
    [props.registries, suggest],
  );
  const pictures = useMemo<ThingPictures | null>(
    () => (host === null ? null : { project: host.thumbnail, revision: host.revision }),
    [host],
  );
  const blockPlay = {
    ...(typeof sounds.volume === 'number' ? { volume: sounds.volume } : {}),
    ...(typeof sounds.pitch === 'number' ? { pitch: sounds.pitch } : {}),
  };
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path.map(String))} />
  );
  const field = (key: BlockSoundEvent) => (
    <SoundField
      key={key}
      project={project}
      label={BLOCK_SOUND_LABELS[key]}
      value={typeof sounds[key] === 'string' ? (sounds[key] as string) : ''}
      emptyLabel={`the ${soundType.replaceAll('_', ' ')} sound`}
      testId={`block-sound-${key}`}
      sound={blockPlay}
      suggest={suggest}
      registries={registries}
      pictures={pictures}
      texturesFolder={texturesFolder}
      onChange={(value) => set(['block_sounds'], withBlockSound(element.data, key, value))}
    />
  );
  const setType = data.set_type;
  const own = isOwnSetType(setType);
  const base = setTypeBase(setType) ?? 'wood';
  const wooden = WOODEN_SET_TYPES.includes(base);
  const ownSounds = asObject(asObject(setType).sounds);
  const rule = (key: SetTypeRule, value: Json | undefined) =>
    set(['set_type'], withSetTypeRule(setType, key, value));

  return (
    <Section title="How it sounds" testId="block-sounds">
      <p className="text-muted text-xs">
        Its own sounds, each a Minecraft sound or one of this project's; an empty one is the{' '}
        {soundType.replaceAll('_', ' ')} sound type's (Light and sound).
      </p>
      {BLOCK_SOUND_EVENTS.map((key) => (
        <div key={key} className="flex flex-col gap-0.5">
          {field(key)}
          {at(['block_sounds', key])}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <NumberField
          label={`Volume (${BLOCK_SOUND_LIMITS.volume.min} to ${BLOCK_SOUND_LIMITS.volume.max}; empty: the sound type's)`}
          value={sounds.volume}
          allowEmpty
          testId="block-sound-volume"
          onCommit={(value) =>
            set(
              ['block_sounds'],
              withBlockSound(element.data, 'volume', value),
              typingKey('/block_sounds/volume'),
            )
          }
        />
        <NumberField
          label={`Pitch (${BLOCK_SOUND_LIMITS.pitch.min} to ${BLOCK_SOUND_LIMITS.pitch.max}; empty: the sound type's)`}
          value={sounds.pitch}
          allowEmpty
          testId="block-sound-pitch"
          onCommit={(value) =>
            set(
              ['block_sounds'],
              withBlockSound(element.data, 'pitch', value),
              typingKey('/block_sounds/pitch'),
            )
          }
        />
      </div>
      {at(['block_sounds'])}
      {at(['block_sounds', 'volume'])}
      {at(['block_sounds', 'pitch'])}
      {dataDriven && (
        <p className="text-muted text-xs" data-testid="block-sounds-reopen">
          On this version of Minecraft a change to these sounds shows after the world is opened
          again.
        </p>
      )}
      {type !== undefined && takesSetType(type) && (
        <div className="flex flex-col gap-1" data-testid="block-own-set-type">
          <CheckField
            label={`${ownSetTypeLabel(type)} (instead of the ${base.replaceAll('_', ' ')} set type's)`}
            checked={own}
            testId="block-own-set-type-on"
            onChange={(checked) => set(['set_type'], withOwnSetType(setType, checked))}
          />
          {own && (
            <>
              {setTypeSoundsOf(type).map((key) => (
                <div key={key} className="flex flex-col gap-0.5">
                  <SoundField
                    project={project}
                    label={SET_TYPE_SOUND_LABELS[key]}
                    value={typeof ownSounds[key] === 'string' ? (ownSounds[key] as string) : ''}
                    emptyLabel={`the ${base.replaceAll('_', ' ')} sound`}
                    testId={`block-set-type-sound-${key}`}
                    suggest={suggest}
                    registries={registries}
                    pictures={pictures}
                    texturesFolder={texturesFolder}
                    onChange={(value) => set(['set_type'], withSetTypeSound(setType, key, value))}
                  />
                  {at(['set_type', 'sounds', key])}
                </div>
              ))}
              {(type === 'door' || type === 'trapdoor') && (
                <div className="flex flex-wrap gap-2">
                  <RuleSelect
                    label="Opened by hand"
                    value={asObject(setType).can_open_by_hand}
                    baseWords={base === 'iron' ? 'no' : 'yes'}
                    testId="block-set-type-by-hand"
                    onChange={(value) => rule('can_open_by_hand', value)}
                  />
                  <RuleSelect
                    label="Opened by a wind charge"
                    value={asObject(setType).can_open_by_wind_charge}
                    baseWords="as by hand"
                    testId="block-set-type-by-wind-charge"
                    onChange={(value) => rule('can_open_by_wind_charge', value)}
                  />
                </div>
              )}
              {type === 'button' && (
                <RuleSelect
                  label="Arrows press it"
                  value={asObject(setType).arrows_press}
                  baseWords={wooden ? 'yes' : 'no'}
                  testId="block-set-type-arrows"
                  onChange={(value) => rule('arrows_press', value)}
                />
              )}
              {type === 'pressure_plate' && (
                <RuleSelect
                  label="What presses it"
                  value={asObject(setType).plate_sensitivity}
                  baseWords={wooden ? 'anything' : 'mobs and players'}
                  labels={PLATE_SENSITIVITY_LABELS}
                  testId="block-set-type-sensitivity"
                  onChange={(value) => rule('plate_sensitivity', value)}
                />
              )}
              <p className="text-muted text-xs">
                Built for this block alone; anything left empty is the {base.replaceAll('_', ' ')}{' '}
                set type's (Type section).
              </p>
            </>
          )}
          {at(['set_type'])}
        </div>
      )}
    </Section>
  );
}

export default SoundsSection;
