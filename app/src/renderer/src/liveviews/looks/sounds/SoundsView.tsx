/**
 * The live view of `minecraft:sounds` (ADR 0121 D2, the plan's batch 3 table; B622): each event of
 * the namespace's `sounds.json` with a Play button, its subtitle, whether it replaces Minecraft's
 * own, and each of its entries with its own Play, volume, pitch, weight, the chance it is picked
 * and whether it streams. A press of an event's Play names the file it picked. It follows an
 * edit at once: the view reads the element as it is now.
 */

import type { Json } from '@msm/plugin-api';
import { useCallback, useMemo, useState } from 'react';
import type { ReadProjectSound } from '../../../audio/provider';
import {
  fileChances,
  type PickedSound,
  resolveSoundEvent,
  type SoundEntry,
  splitSoundId,
} from '../../../audio/resolve';
import { SoundPlayButton } from '../../../audio/SoundPlayButton';
import { useVeryEasy } from '../../../studios/very-easy';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';

type JsonObject = { [key: string]: Json };
const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** The notes under the view. */
export const SOUNDS_VIEW_NOTES: readonly string[] = [
  'Heard flat: no distance, sound category volume or echo.',
  "Minecraft's own files play from your Minecraft folder; nothing is copied.",
];

/** A sound id in words, for Very easy (B630: My things opens this view there): no ids drawn. */
export function soundIdWords(id: string): string {
  const words = splitSoundId(id)
    .path.split(/[._/]+/)
    .filter(Boolean)
    .join(' ');
  return words === '' ? 'A sound' : `${words[0]?.toUpperCase()}${words.slice(1)}`;
}

const percent = (chance: number): string =>
  `${chance >= 0.995 ? 100 : Math.round(chance * 1000) / 10}%`;

/** One entry of an event. */
function EntryRow(props: {
  entry: SoundEntry;
  chance: number | undefined;
  common: Pick<LiveViewProps, 'project' | 'sounds'> & {
    readProjectAsset: ReadProjectSound | undefined;
  };
  veryEasy: boolean;
}) {
  const { entry, common, veryEasy } = props;
  const facts = [
    entry.volume === 1 ? null : `volume ${entry.volume}`,
    entry.pitch === 1 ? null : `pitch ${entry.pitch}`,
    `weight ${entry.weight}`,
    props.chance === undefined ? null : `picked ${percent(props.chance)}`,
    entry.stream ? 'streamed' : null,
  ].filter((fact) => fact !== null);
  const button =
    entry.type === 'event' ? (
      <SoundPlayButton
        event={entry.name}
        compact
        project={common.project}
        {...(common.sounds === undefined ? {} : { sounds: common.sounds })}
        {...(common.readProjectAsset === undefined
          ? {}
          : { readProjectAsset: common.readProjectAsset })}
        volume={entry.volume}
        pitch={entry.pitch}
      />
    ) : (
      <SoundPlayButton
        file={splitSoundId(entry.name)}
        compact
        project={common.project}
        {...(common.sounds === undefined ? {} : { sounds: common.sounds })}
        {...(common.readProjectAsset === undefined
          ? {}
          : { readProjectAsset: common.readProjectAsset })}
        volume={entry.volume}
        pitch={entry.pitch}
        stream={entry.stream}
      />
    );
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs" data-testid="sounds-view-entry">
      {button}
      <span className="font-mono [overflow-wrap:anywhere]">
        {veryEasy
          ? `${entry.type === 'event' ? 'The sound ' : ''}${soundIdWords(entry.name)}`
          : entry.type === 'event'
            ? `event ${entry.name}`
            : entry.name}
      </span>
      <span className="text-muted">{facts.join(', ')}</span>
    </li>
  );
}

export default function SoundsView(props: LiveViewProps) {
  const { project, element, sounds } = props;
  const veryEasy = useVeryEasy();
  const namespace = splitSoundId(element.id).namespace;
  const readProject = props.readProject;
  const readProjectAsset = useMemo<ReadProjectSound | undefined>(
    () =>
      readProject === undefined
        ? undefined
        : (ns: string, path: string) => readProject(`assets/${ns}/${path}`),
    [readProject],
  );
  const [picked, setPicked] = useState<Record<string, PickedSound | null>>({});
  const onPicked = useCallback(
    (event: string) => (one: PickedSound | null) =>
      setPicked((before) => ({ ...before, [event]: one })),
    [],
  );
  const data = asObject(element.data) ?? {};
  const events = Object.keys(data).sort();
  // The project's own definitions with this element as it is now (vanilla's are added on Play).
  const projectSounds = useMemo(() => ({ [namespace]: data as Json }), [namespace, data]);
  const common = {
    project,
    ...(sounds === undefined ? {} : { sounds }),
    readProjectAsset,
  };
  return (
    <LiveViewFrame title="Sounds" fidelity="about_right" notes={SOUNDS_VIEW_NOTES}>
      {events.length === 0 ? (
        <p className="text-sm text-muted" data-testid="sounds-view-empty">
          No sound events yet: add one to hear it here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="sounds-view">
          {events.map((key) => {
            const id = `${namespace}:${key}`;
            const registration = asObject(data[key]) ?? {};
            // The entries as this file lists them (vanilla's added ones are heard on Play).
            const own = resolveSoundEvent(id, projectSounds, null);
            const chances = new Map(fileChances(own).map((one) => [one.name, one.chance]));
            const shown = picked[id];
            return (
              <li
                key={key}
                className="flex flex-col gap-1"
                data-testid={`sounds-view-event-${key}`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <SoundPlayButton
                    event={id}
                    project={project}
                    {...(sounds === undefined ? {} : { sounds })}
                    {...(readProjectAsset === undefined ? {} : { readProjectAsset })}
                    onPicked={onPicked(id)}
                    testId={`sounds-view-play-${key}`}
                  />
                  <span
                    className={`text-sm [overflow-wrap:anywhere] ${veryEasy ? '' : 'font-mono'}`}
                  >
                    {veryEasy ? soundIdWords(id) : id}
                  </span>
                  {typeof registration.subtitle === 'string' && (
                    <span className="text-xs text-muted">Subtitle: {registration.subtitle}</span>
                  )}
                  {namespace === 'minecraft' && (
                    <span className="text-xs text-muted">
                      {registration.replace === true
                        ? "Replaces Minecraft's own sounds"
                        : "Added to Minecraft's own sounds"}
                    </span>
                  )}
                </span>
                {shown !== undefined && (
                  <span className="text-xs" data-testid={`sounds-view-picked-${key}`}>
                    {shown === null
                      ? 'Nothing to play.'
                      : `Picked ${veryEasy ? soundIdWords(shown.file.path) : `${shown.file.namespace}:${shown.file.path}`} at volume ${round(shown.entry.volume)}, pitch ${round(shown.entry.pitch)}.`}
                  </span>
                )}
                <ul className="ml-4 flex flex-col gap-1">
                  {own.entries.map((entry, index) => (
                    <EntryRow
                      // Entries have no id; their place in the list is theirs.
                      key={index}
                      entry={entry}
                      chance={entry.type === 'file' ? chances.get(entry.name) : undefined}
                      common={common}
                      veryEasy={veryEasy}
                    />
                  ))}
                  {own.entries.length === 0 && (
                    <li className="text-xs text-muted">No sound files listed.</li>
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </LiveViewFrame>
  );
}

const round = (value: number): number => Math.round(value * 100) / 100;
