/**
 * The live view of `minecraft:instrument` (ADR 0121, the plan's batch 3 table; B630): Play the
 * call, how long one blow lasts against how long the file is, and how far it is heard, drawn as a
 * circle around the player with a scale in blocks; Minecraft's own horns' range as a dashed ring
 * when the Minecraft folder is set up (read from its `instrument` files, never written here).
 * It follows an edit 150 ms after it settles; the Play button reads the element as it is now.
 *
 * About right: heard flat, the circle is the data's number.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { useEffect, useMemo, useState } from 'react';
import { useSoundSources } from '../../../audio/provider';
import { SoundPlayButton } from '../../../audio/SoundPlayButton';
import { usePlain } from '../../../studios/plain';
import { useLang, useSettled } from '../../data/lines/lang';
import { plainTextOf } from '../../data/lines/text-component';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import {
  lengthWords,
  namedSound,
  projectPathReader,
  soundWords,
  useFileLengths,
} from '../jukebox/song-files';

type JsonObject = { [key: string]: Json };
const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** The notes under the view. */
export const INSTRUMENT_VIEW_NOTES: readonly string[] = [
  'Heard flat: no distance or direction.',
  'The circle is the range the data states; hills and walls do not block it in the game either.',
  "Minecraft's own calls play from your Minecraft folder; nothing is copied.",
];

/** A tidy scale step: at most five steps across `range` blocks. */
export function scaleStep(range: number): number {
  const steps = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  return steps.find((step) => range / step <= 5) ?? 4096;
}

/** Minecraft's own horns' range when they all share one, else `null`. */
export function vanillaRange(files: Readonly<Record<string, Json>>): number | null {
  const ranges = new Set<number>();
  for (const json of Object.values(files)) {
    const range = asObject(json)?.range;
    if (typeof range === 'number') ranges.add(range);
  }
  return ranges.size === 1 ? ([...ranges][0] as number) : null;
}

/** The range circle with its scale. */
export function RangeCircle({ range, vanilla }: { range: number; vanilla: number | null }) {
  const size = 220;
  const centre = size / 2;
  const outer = 96;
  const largest = Math.max(range, vanilla ?? 0, 1);
  const radius = (blocks: number): number => (blocks / largest) * outer;
  const step = scaleStep(largest);
  const ticks: number[] = [];
  for (let at = 0; at <= largest + 1e-9; at += step) ticks.push(at);
  return (
    <figure className="m-0 flex flex-col items-start gap-1">
      <svg
        width={size}
        height={size + 28}
        viewBox={`0 0 ${size} ${size + 28}`}
        role="img"
        aria-label={`Heard up to ${range} blocks away`}
        data-testid="instrument-range"
        data-range={range}
      >
        <circle
          cx={centre}
          cy={centre}
          r={radius(range)}
          className="fill-accent/15 stroke-accent"
          strokeWidth={2}
          data-testid="instrument-range-circle"
        />
        {vanilla !== null && vanilla !== range && (
          <circle
            cx={centre}
            cy={centre}
            r={radius(vanilla)}
            className="fill-none stroke-muted"
            strokeDasharray="4 3"
            strokeWidth={1}
            data-testid="instrument-vanilla-circle"
          />
        )}
        <circle cx={centre} cy={centre} r={3} className="fill-text" />
        <line
          x1={centre}
          y1={size + 8}
          x2={centre + radius(largest)}
          y2={size + 8}
          className="stroke-text"
          strokeWidth={1}
        />
        {ticks.map((at) => (
          <g key={at}>
            <line
              x1={centre + radius(at)}
              y1={size + 4}
              x2={centre + radius(at)}
              y2={size + 12}
              className="stroke-text"
              strokeWidth={1}
            />
            <text
              x={centre + radius(at)}
              y={size + 24}
              textAnchor="middle"
              className="fill-muted"
              fontSize={9}
            >
              {at}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="text-xs text-muted">
        The dot is the player blowing the horn; the scale is in blocks.
        {vanilla !== null && vanilla !== range
          ? ` Dashed: Minecraft's own horns, ${vanilla} blocks.`
          : ''}
      </figcaption>
    </figure>
  );
}

export default function InstrumentView(props: LiveViewProps) {
  const { element, onSetup } = props;
  const veryEasy = usePlain();
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
  const [vanilla, setVanilla] = useState<number | null>(null);
  const reader = props.vanilla;
  useEffect(() => {
    if (typeof reader?.folder !== 'function') return;
    let live = true;
    void reader
      .folder('instrument')
      .then((answer) => {
        if (live) setVanilla(answer.status === 'ready' ? vanillaRange(answer.files) : null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [reader]);

  const range = typeof data.range === 'number' && data.range > 0 ? data.range : null;
  const blow =
    typeof data.use_duration === 'number' && data.use_duration > 0 ? data.use_duration : null;
  const description = plainTextOf(data.description, lookup).trim();
  const files = lengths?.files ?? [];
  const lengthsRead = files.filter((file) => file.seconds !== null);
  const longest = lengthsRead.reduce((most, file) => Math.max(most, file.seconds ?? 0), 0);
  const needsMinecraft = files.some((file) => file.status === 'needs_minecraft');

  return (
    <LiveViewFrame
      title="Goat horn call"
      fidelity="about_right"
      notes={INSTRUMENT_VIEW_NOTES}
      needsSetUp={needsMinecraft}
      onSetup={onSetup}
    >
      <div className="flex flex-col gap-3" data-testid="instrument-view">
        <p className="text-sm" data-testid="instrument-name">
          {description === '' ? 'A call with no name yet' : description}
        </p>
        {named === null ? (
          <p className="text-sm text-muted" data-testid="instrument-no-sound">
            No sound picked yet: pick one to hear it here.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <SoundPlayButton
              event={named.event}
              label="Play the call"
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
              testId="instrument-play"
            />
            <span
              className={`text-xs text-muted ${veryEasy ? '' : 'font-mono [overflow-wrap:anywhere]'}`}
            >
              {veryEasy ? soundWords(named.event) : named.event}
            </span>
          </div>
        )}
        <p className="text-sm" data-testid="instrument-blow">
          {blow === null
            ? 'The data states no time for one blow.'
            : `One blow lasts ${lengthWords(blow)}; the horn then cools down as long.`}
          {lengthsRead.length > 0 && ` The sound file lasts ${lengthWords(longest)}.`}
        </p>
        {lengths?.origin === 'missing' && named !== null && (
          <p className="text-xs text-warning" data-testid="instrument-missing">
            No sound of that name was found in your mod or in Minecraft.
          </p>
        )}
        {range === null ? (
          <p className="text-sm text-muted">The data states no range.</p>
        ) : (
          <>
            <p className="text-sm">Players up to {range} blocks away hear it.</p>
            <RangeCircle range={range} vanilla={vanilla} />
          </>
        )}
      </div>
    </LiveViewFrame>
  );
}
