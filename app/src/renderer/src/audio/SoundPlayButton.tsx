/**
 * The Play button every sound shows (ADR 0121 D2; B620 stub, B622). One press resolves the sound
 * and plays it through the app's one player; a second press, or a press of another button,
 * stops it (one sound at a time).
 *
 * - **An event** (`event`): resolved through the project's `sounds.json` (its `minecraft:sounds`
 *   elements, else a `sounds.json` kept as a plain asset), then vanilla's (`resolve.ts`); a file
 *   is picked by weight and played at its volume and pitch, times the button's own `volume` and
 *   `pitch` (a block's sound volume, say).
 * - **A file** (`file`, named as `sounds.json` names it, under `sounds/` without `.ogg`).
 * - **Bytes** (`bytes`, the Creator's picked song).
 *
 * A file is the project's own (`assets/<ns>/sounds/<path>.ogg`) first; a `minecraft:` file not in
 * the project is read from the user's own Minecraft folder (`vanilla-sounds.ts`). A sound that
 * needs Minecraft's files is off while that folder is not set up, with the set-up link; project
 * sounds always play. Nothing is copied or kept but the player's decoded cache.
 *
 * Test ids: `sound-play-button` (state in `data-state`: `idle`, `loading`, `playing`, `off`,
 * `missing`; the time from the press to the player in `data-start-ms`), `sound-setup`.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/plugin-api';
import { Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PlayingSound } from './player';
import {
  type ReadProjectSound,
  useSoundPlayer,
  useSoundSources,
  vanillaSoundsAvailable,
} from './provider';
import { type PickedSound, pickEntry, resolveSoundEvent, splitSoundId } from './resolve';
import { type VanillaSoundReader, vanillaSoundKey } from './vanilla-sounds';

/** Props of {@link SoundPlayButton}. */
export interface SoundPlayButtonProps {
  /** A sound event id (`minecraft:entity.wolf.ambient`, `my_mod:thing.hum`). */
  event?: string | undefined;
  /** A sound file (`namespace:path` as `sounds.json` names it: under `sounds/`, no extension). */
  file?: { namespace: string; path: string } | undefined;
  /** Bytes to play as they are (an Ogg file the user picked), under a key for the cache. */
  bytes?: { key: string; bytes: Uint8Array } | undefined;
  /** The project; the shell's open project by default. */
  project?: Project | null | undefined;
  /** Reads vanilla's sounds, or `null` when the Minecraft folder is not set up; the shell's by default. */
  sounds?: VanillaSoundReader | null | undefined;
  /** Reads project files; the shell's by default. */
  readProjectAsset?: ReadProjectSound | null | undefined;
  /** Multiplies the file's volume (default 1). */
  volume?: number | undefined;
  /** Multiplies the file's pitch (default 1). */
  pitch?: number | undefined;
  /** Streams the bytes or file (an event's entries say it themselves). */
  stream?: boolean | undefined;
  /** The button's words; "Play" by default. */
  label?: string | undefined;
  /** An icon only, for a tile or a field's side. */
  compact?: boolean | undefined;
  /** Told which file each press picked (`null`: nothing to play). */
  onPicked?: ((picked: PickedSound | null) => void) | undefined;
  /** The test id; `sound-play-button` by default. */
  testId?: string | undefined;
  /** The button's tab index (-1 inside a grid that moves by the arrow keys). */
  tabIndex?: number | undefined;
}

type State = 'idle' | 'loading' | 'playing' | 'off' | 'missing';

type JsonObject = { [key: string]: Json };
const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Each namespace's `sounds.json` from the project's `minecraft:sounds` elements. */
export function projectSoundsOf(project: Project | null | undefined): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements) {
      if (element.kind !== 'minecraft:sounds' || !isObject(element.data)) continue;
      out[splitSoundId(element.id).namespace] = element.data;
    }
  }
  return out;
}

/** Whether the project holds an asset at `assets/<namespace>/<path>`. */
const hasAsset = (project: Project | null | undefined, namespace: string, path: string) =>
  project?.namespaces.some(
    (entry) => entry.name === namespace && entry.assets.some((asset) => asset.path === path),
  ) === true;

/** Whether a sound needs Minecraft's own files (as far as can be told before reading them). */
export function needsVanilla(
  props: Pick<SoundPlayButtonProps, 'event' | 'file' | 'bytes'>,
  project: Project | null | undefined,
): boolean {
  if (props.bytes !== undefined) return false;
  if (props.file !== undefined) {
    return (
      props.file.namespace === 'minecraft' &&
      !hasAsset(project, 'minecraft', `sounds/${props.file.path}.ogg`)
    );
  }
  if (props.event === undefined || props.event.trim() === '') return false;
  const { namespace, path } = splitSoundId(props.event.trim());
  if (namespace !== 'minecraft') return false;
  // A project event that replaces vanilla's and names only project files needs none.
  const own = projectSoundsOf(project).minecraft;
  const entry = isObject(own) ? own[path] : undefined;
  if (!isObject(entry) || entry.replace !== true || !Array.isArray(entry.sounds)) return true;
  return entry.sounds.some((sound) => {
    const name = typeof sound === 'string' ? sound : isObject(sound) ? sound.name : undefined;
    return typeof name !== 'string' || splitSoundId(name).namespace === 'minecraft';
  });
}

/** Reads the bytes of a picked file: the project's first, then Minecraft's. */
async function readFile(
  file: { namespace: string; path: string },
  project: Project | null | undefined,
  readProject: ReadProjectSound | null,
  vanilla: VanillaSoundReader | null,
): Promise<{ bytes: Uint8Array; origin: 'project' | 'vanilla' } | null> {
  const assetPath = `sounds/${file.path}.ogg`;
  if (
    readProject !== null &&
    (file.namespace !== 'minecraft' || hasAsset(project, file.namespace, assetPath))
  ) {
    const bytes = await readProject(file.namespace, assetPath).catch(() => null);
    if (bytes !== null) return { bytes, origin: 'project' };
  }
  if (file.namespace !== 'minecraft' || vanilla === null) return null;
  const key = vanillaSoundKey(`minecraft:${file.path}`);
  if (key === null) return null;
  const bytes = await vanilla.file(key);
  return bytes === null ? null : { bytes, origin: 'vanilla' };
}

/** `sounds.json` of each namespace the event may need that is not an element: a plain asset. */
async function withAssetSounds(
  base: Record<string, Json>,
  namespaces: readonly string[],
  project: Project | null | undefined,
  readProject: ReadProjectSound | null,
): Promise<Record<string, Json>> {
  if (readProject === null) return base;
  const out = { ...base };
  for (const namespace of namespaces) {
    if (out[namespace] !== undefined || !hasAsset(project, namespace, 'sounds.json')) continue;
    const bytes = await readProject(namespace, 'sounds.json').catch(() => null);
    if (bytes === null) continue;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Json;
      if (isObject(parsed)) out[namespace] = parsed;
    } catch {
      // Not JSON: as if it were not there.
    }
  }
  return out;
}

/** Plain words of a state, for the button's title. */
const TITLES: Readonly<Record<State, string>> = {
  idle: 'Play this sound',
  loading: 'Getting the sound…',
  playing: 'Stop',
  off: "Minecraft's own sounds play once MSM has found your Minecraft folder.",
  missing: 'Nothing to play: no sound file was found.',
};

export function SoundPlayButton(props: SoundPlayButtonProps) {
  const sources = useSoundSources();
  const player = useSoundPlayer();
  const project = props.project === undefined ? sources.project : props.project;
  const vanilla = props.sounds === undefined ? sources.sounds : props.sounds;
  const readProject =
    props.readProjectAsset === undefined ? sources.readProjectAsset : props.readProjectAsset;
  const random = sources.random ?? Math.random;
  const [state, setState] = useState<State>('idle');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [startMs, setStartMs] = useState<number | null>(null);
  const playingRef = useRef<PlayingSound | null>(null);
  const needs = needsVanilla(props, project);

  useEffect(() => {
    if (!needs) return;
    let live = true;
    void vanillaSoundsAvailable(vanilla).then((answer) => {
      if (live) setAvailable(answer);
    });
    return () => {
      live = false;
    };
  }, [needs, vanilla]);

  // A sound still playing when the button goes stops with it.
  useEffect(
    () => () => {
      const sound = playingRef.current;
      if (sound !== null && player?.current === sound) player.stopAll();
    },
    [player],
  );

  const off = player === null || (needs && available === false);
  const shown: State = off ? 'off' : state;

  const press = async (): Promise<void> => {
    if (player === null) return;
    const mine = playingRef.current;
    if (mine !== null && player.current === mine) {
      player.stopAll();
      return;
    }
    const started = performance.now();
    setState('loading');
    try {
      let bytes: Uint8Array | null = null;
      let key = '';
      let volume = 1;
      let pitch = 1;
      let stream = props.stream === true;
      if (props.bytes !== undefined) {
        ({ bytes, key } = props.bytes);
      } else {
        let file = props.file;
        if (file === undefined && props.event !== undefined && props.event.trim() !== '') {
          const event = props.event.trim();
          const { namespace } = splitSoundId(event);
          const projectSounds = await withAssetSounds(
            projectSoundsOf(project),
            [namespace],
            project,
            readProject,
          );
          const vanillaJson =
            namespace === 'minecraft' && vanilla !== null ? await vanilla.soundsJson() : null;
          const picked = pickEntry(resolveSoundEvent(event, projectSounds, vanillaJson), random);
          props.onPicked?.(picked);
          if (picked !== null) {
            file = { namespace: picked.file.namespace, path: picked.file.path };
            volume = picked.entry.volume;
            pitch = picked.entry.pitch;
            stream = stream || picked.entry.stream;
          }
        }
        if (file !== undefined) {
          const read = await readFile(file, project, readProject, vanilla);
          if (read !== null) {
            bytes = read.bytes;
            key = `${read.origin}:${file.namespace}:${file.path}`;
          }
        }
      }
      if (bytes === null) {
        setState('missing');
        return;
      }
      const sound = player.play({
        key,
        bytes,
        volume: volume * (props.volume ?? 1),
        pitch: pitch * (props.pitch ?? 1),
        stream,
      });
      setStartMs(Math.round(performance.now() - started));
      if (sound === null) {
        setState('missing');
        return;
      }
      playingRef.current = sound;
      setState('playing');
      void sound.ended.then(() => {
        if (playingRef.current === sound) playingRef.current = null;
        setState((now) => (now === 'playing' ? 'idle' : now));
      });
    } catch {
      setState('missing');
    }
  };

  const label = props.label ?? 'Play';
  const playingNow = shown === 'playing';
  const words = playingNow ? 'Stop' : label;
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        data-testid={props.testId ?? 'sound-play-button'}
        data-state={shown}
        {...(startMs === null ? {} : { 'data-start-ms': startMs })}
        disabled={off || shown === 'loading'}
        {...(props.tabIndex === undefined ? {} : { tabIndex: props.tabIndex })}
        aria-pressed={playingNow}
        aria-label={
          props.compact === true ? (playingNow ? 'Stop the sound' : 'Play the sound') : undefined
        }
        title={TITLES[shown]}
        className={
          props.compact === true
            ? 'inline-flex size-6 shrink-0 items-center justify-center rounded border border-border text-muted cursor-pointer hover:enabled:bg-bg hover:enabled:text-text disabled:cursor-default disabled:opacity-50'
            : 'inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs cursor-pointer hover:enabled:bg-bg disabled:cursor-default disabled:opacity-50'
        }
        onClick={(event) => {
          event.stopPropagation();
          void press();
        }}
      >
        {playingNow ? <Square aria-hidden size={12} /> : <Play aria-hidden size={12} />}
        {props.compact === true ? null : <span>{words}</span>}
      </button>
      {shown === 'off' &&
        player !== null &&
        sources.onSetup !== undefined &&
        props.compact !== true && (
          <button
            type="button"
            data-testid="sound-setup"
            className="text-xs text-accent underline cursor-pointer"
            onClick={sources.onSetup}
          >
            Find my Minecraft
          </button>
        )}
      {shown === 'missing' && props.compact !== true && (
        <span className="text-xs text-muted" data-testid="sound-missing">
          No sound file found
        </span>
      )}
    </span>
  );
}

export default SoundPlayButton;
