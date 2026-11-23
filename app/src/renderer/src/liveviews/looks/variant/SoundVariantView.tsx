/**
 * A mob's sound variant (the plan's batch 3 table; B627): a Play button per sound of the set, the
 * grown-up's sounds and the baby's, each sound named in words, resolved through the project's
 * `sounds.json` and then Minecraft's own (`SoundPlayButton`; ADR 0121 D2). A sound may be written
 * as an id or as `{ sound_id, range }`; the range is named. Follows an edit at once: the view
 * reads the element as it is now.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { useMemo, useState } from 'react';
import type { ReadProjectSound } from '../../../audio/provider';
import type { PickedSound } from '../../../audio/resolve';
import { SoundPlayButton } from '../../../audio/SoundPlayButton';
import { thingName, thingWords } from '../../../components/thing-picker/thing-sources';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import { SOUNDS_VIEW_NOTES } from '../sounds/SoundsView';
import { mobWordsOf } from './variant-model';

type JsonObject = { [key: string]: Json };
const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One sound of a set. */
export interface VariantSound {
  /** The field (`ambient_sound`). */
  readonly field: string;
  /** In words ("Ambient"). */
  readonly words: string;
  /** The sound event id, or `undefined` when the field is empty. */
  readonly event?: string;
  /** The fixed range of `{ sound_id, range }`. */
  readonly range?: number;
}

/** A sound field in words: `beg_for_food_sound` is "Beg for food". */
export function soundFieldWords(field: string): string {
  const words = field.replace(/_sound$/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The sounds of one set (`adult_sounds` or `baby_sounds`), in the data's order. */
export function variantSounds(set: Json | undefined): VariantSound[] {
  if (!isObject(set)) return [];
  return Object.entries(set).map(([field, value]) => {
    const words = soundFieldWords(field);
    if (typeof value === 'string' && value !== '') return { field, words, event: value };
    if (isObject(value) && typeof value.sound_id === 'string' && value.sound_id !== '') {
      return {
        field,
        words,
        event: value.sound_id,
        ...(typeof value.range === 'number' ? { range: value.range } : {}),
      };
    }
    return { field, words };
  });
}

/** The two sets of a sound variant: grown-up and baby. */
export const SOUND_SETS: readonly { key: 'adult_sounds' | 'baby_sounds'; words: string }[] = [
  { key: 'adult_sounds', words: 'Grown-up' },
  { key: 'baby_sounds', words: 'Baby' },
];

/** The view; see the module comment. */
export default function SoundVariantView(props: LiveViewProps) {
  const { project, element } = props;
  const readProject = props.readProject;
  const readProjectAsset = useMemo<ReadProjectSound | undefined>(
    () =>
      readProject === undefined
        ? undefined
        : (namespace: string, path: string) => readProject(`assets/${namespace}/${path}`),
    [readProject],
  );
  const [picked, setPicked] = useState<{ field: string; sound: PickedSound | null } | null>(null);
  const data = isObject(element.data) ? element.data : {};
  const mob = mobWordsOf(element.kind).toLowerCase();
  const sets = SOUND_SETS.map((set) => ({ ...set, sounds: variantSounds(data[set.key]) }));
  const count = sets.reduce((sum, set) => sum + set.sounds.length, 0);
  return (
    <LiveViewFrame
      title={`${mobWordsOf(element.kind)} voice`}
      fidelity="about_right"
      notes={SOUNDS_VIEW_NOTES}
    >
      <p className="text-sm" data-testid="sound-variant-words">
        {`${thingName(project, element.id)}: the voice of a ${mob}, ${count} sound${count === 1 ? '' : 's'}.`}
      </p>
      {sets.map((set) => (
        <section
          key={set.key}
          aria-label={set.words}
          className="flex flex-col gap-1"
          data-testid={`sound-variant-${set.key}`}
        >
          <h4 className="text-xs font-medium">{set.words}</h4>
          {set.sounds.length === 0 ? (
            <p className="text-muted text-xs">No sounds named.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {set.sounds.map((sound) => (
                <li
                  key={sound.field}
                  className="flex flex-wrap items-center gap-2 text-sm"
                  data-testid="sound-variant-sound"
                  data-field={sound.field}
                  data-event={sound.event ?? ''}
                >
                  {sound.event === undefined ? (
                    <span className="text-muted text-xs">(none)</span>
                  ) : (
                    <SoundPlayButton
                      event={sound.event}
                      compact
                      project={project}
                      {...(props.sounds === undefined ? {} : { sounds: props.sounds })}
                      {...(readProjectAsset === undefined ? {} : { readProjectAsset })}
                      label={`Play ${sound.words.toLowerCase()}`}
                      onPicked={(found) =>
                        setPicked({ field: `${set.key}/${sound.field}`, sound: found })
                      }
                      testId={`sound-variant-play-${set.key}-${sound.field}`}
                    />
                  )}
                  <span>{sound.words}</span>
                  {sound.event !== undefined && (
                    <span className="text-muted text-xs">
                      {thingWords(sound.event, 'sound')}
                      {sound.range === undefined ? '' : `, heard ${sound.range} blocks away`}
                    </span>
                  )}
                  {picked?.field === `${set.key}/${sound.field}` && (
                    <span className="text-muted text-xs" data-testid="sound-variant-picked">
                      {picked.sound === null
                        ? 'nothing to play'
                        : `played ${thingWords(`${picked.sound.file.namespace}:${picked.sound.file.path}`)}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </LiveViewFrame>
  );
}
