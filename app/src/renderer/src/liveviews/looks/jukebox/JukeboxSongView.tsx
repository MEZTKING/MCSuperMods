/**
 * The live view of `minecraft:jukebox_song` (ADR 0121, the plan's batch 3 table; B630): the
 * song's name as the disc shows it, Play and Stop with a time line, the length the data states
 * against the length of the file it plays (read from the Ogg file itself), and the signal a
 * comparator reads from the playing jukebox. It follows an edit 150 ms after it settles; the
 * Play button reads the element as it is now.
 *
 * About right: heard flat (no distance), and the length check reads the file, not the game.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { useMemo, useState } from 'react';
import { useSoundSources } from '../../../audio/provider';
import type { PickedSound } from '../../../audio/resolve';
import { SoundPlayButton } from '../../../audio/SoundPlayButton';
import { useVeryEasy } from '../../../studios/very-easy';
import { useLang, useSettled } from '../../data/lines/lang';
import { plainTextOf } from '../../data/lines/text-component';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import {
  type FileLength,
  lengthVerdict,
  lengthWords,
  namedSound,
  projectPathReader,
  soundWords,
  useFileLengths,
  verdictWords,
} from './song-files';
import { TimeLine, usePlayingTime } from './TimeLine';

type JsonObject = { [key: string]: Json };
const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** The notes under the view. */
export const JUKEBOX_VIEW_NOTES: readonly string[] = [
  'Heard flat: no distance from the jukebox, no music volume setting.',
  'The game goes by the length the data states, not by the file: the jukebox counts the song as playing for that long.',
  "Minecraft's own songs play from your Minecraft folder; nothing is copied.",
];

/** The comparator's fifteen lit strengths (0 is none). */
const LEVELS: readonly number[] = Array.from({ length: 15 }, (_, index) => index + 1);

/** The comparator's strengths, lit up to the song's. */
export function ComparatorSignal({ strength }: { strength: number }) {
  const lit = Math.max(0, Math.min(15, Math.round(strength)));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-0.5" aria-hidden data-testid="song-comparator" data-strength={lit}>
        {LEVELS.map((level) => (
          <span
            key={level}
            className={`h-3 w-3 rounded-sm border border-border ${level <= lit ? 'bg-error' : 'bg-bg'}`}
          />
        ))}
      </div>
      <span className="text-xs text-muted">
        A comparator beside the playing jukebox gives a signal of {lit} out of 15.
      </span>
    </div>
  );
}

/** One file's length line. */
function FileLine(props: { file: FileLength; stated: number | null; veryEasy: boolean }) {
  const { file, stated, veryEasy } = props;
  const name = veryEasy ? soundWords(file.name) : file.name;
  const words =
    file.status === 'ready' && file.seconds !== null
      ? `lasts ${lengthWords(file.seconds)}`
      : file.status === 'reading'
        ? 'reading…'
        : file.status === 'needs_minecraft'
          ? 'needs your Minecraft folder'
          : file.status === 'not_ogg'
            ? 'is not an Ogg Vorbis file'
            : 'was not found';
  const verdict =
    stated !== null && file.seconds !== null ? lengthVerdict(stated, file.seconds) : null;
  return (
    <li
      className="flex flex-col gap-0.5 text-xs"
      data-testid="song-file"
      data-status={file.status}
      {...(verdict === null ? {} : { 'data-verdict': verdict })}
      {...(file.seconds === null ? {} : { 'data-seconds': file.seconds.toFixed(2) })}
    >
      <span>
        <span className={veryEasy ? '' : 'font-mono [overflow-wrap:anywhere]'}>{name}</span> {words}
        {file.chance < 0.995 ? ` (picked ${Math.round(file.chance * 100)}% of the time)` : ''}
      </span>
      {stated !== null && file.seconds !== null && (
        <span
          className={verdict === 'matches' ? 'text-muted' : 'text-warning'}
          data-testid="song-verdict"
        >
          {verdictWords(stated, file.seconds)}
        </span>
      )}
    </li>
  );
}

export default function JukeboxSongView(props: LiveViewProps) {
  const { element, onSetup } = props;
  const veryEasy = useVeryEasy();
  const sources = useSoundSources();
  const sounds = props.sounds === undefined ? sources.sounds : props.sounds;
  const readProject = useMemo(
    () => props.readProject ?? projectPathReader(sources.readProjectAsset),
    [props.readProject, sources.readProjectAsset],
  );
  const data = asObject(element.data) ?? {};
  const named = namedSound(data.sound_event);
  const project = useSettled(props.project);
  const event = useSettled(named?.event ?? null);
  const lengths = useFileLengths(event, project, readProject, sounds ?? null);
  const { lookup } = useLang(props.project, props.vanillaAssets);
  const time = usePlayingTime();
  const [picked, setPicked] = useState<string | null>(null);

  const stated =
    typeof data.length_in_seconds === 'number' && data.length_in_seconds > 0
      ? data.length_in_seconds
      : null;
  const comparator = typeof data.comparator_output === 'number' ? data.comparator_output : 0;
  const description = plainTextOf(data.description, lookup).trim();
  const files = lengths?.files ?? [];
  const pickedFile =
    files.find((file) => file.name === picked) ?? (files.length === 1 ? files[0] : undefined);
  const fileSeconds = pickedFile?.seconds ?? time.duration ?? null;
  const needsMinecraft = files.some((file) => file.status === 'needs_minecraft');

  const onPicked = (one: PickedSound | null): void => {
    if (one === null) return;
    setPicked(one.entry.name);
    time.pressed();
  };

  return (
    <LiveViewFrame
      title="Music disc song"
      fidelity="about_right"
      notes={JUKEBOX_VIEW_NOTES}
      needsSetUp={needsMinecraft}
      onSetup={onSetup}
    >
      <div className="flex flex-col gap-3" data-testid="song-view">
        <p className="text-sm" data-testid="song-name">
          {description === '' ? 'A song with no name yet' : description}
        </p>
        {named === null ? (
          <p className="text-sm text-muted" data-testid="song-no-sound">
            No sound picked yet: pick one to hear it here.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <SoundPlayButton
                event={named.event}
                project={props.project}
                {...(sounds === undefined ? {} : { sounds })}
                {...(props.readProject === undefined
                  ? {}
                  : {
                      readProjectAsset: (namespace: string, path: string) =>
                        (props.readProject as NonNullable<typeof props.readProject>)(
                          `assets/${namespace}/${path}`,
                        ),
                    })}
                onPicked={onPicked}
                testId="song-play"
              />
              <span
                className={`text-xs text-muted ${veryEasy ? '' : 'font-mono [overflow-wrap:anywhere]'}`}
              >
                {veryEasy ? soundWords(named.event) : named.event}
              </span>
            </div>
            <TimeLine position={time.position} stated={stated} file={fileSeconds} />
          </>
        )}
        <div className="flex flex-col gap-1 text-sm">
          <span data-testid="song-stated">
            {stated === null
              ? 'The data states no length.'
              : `The data states ${lengthWords(stated)} (${Math.round(stated * 10) / 10} seconds).`}
          </span>
          {lengths?.origin === 'missing' && named !== null && (
            <span className="text-xs text-warning" data-testid="song-missing">
              No sound of that name was found in your mod or in Minecraft.
            </span>
          )}
          {lengths?.origin === 'reading' && (
            <span className="text-xs text-muted">Reading the song file…</span>
          )}
          {files.length > 0 && (
            <ul className="flex flex-col gap-1" data-testid="song-files">
              {files.map((file) => (
                <FileLine key={file.name} file={file} stated={stated} veryEasy={veryEasy} />
              ))}
            </ul>
          )}
        </div>
        <ComparatorSignal strength={comparator} />
        {named?.range !== null && named?.range !== undefined && (
          <p className="text-xs text-muted" data-testid="song-range">
            Heard up to {named.range} blocks from the jukebox.
          </p>
        )}
      </div>
    </LiveViewFrame>
  );
}
