/**
 * The one app-level sound player and what the Play buttons read (ADR 0121 D2; B620, B622). The
 * shell (`App.tsx`) mounts {@link SoundPlayerProvider} and {@link SoundSourcesProvider} once,
 * around everything; nothing here reads the session store. A button given its own `project` or
 * `sounds` (a live view over a bundle) uses those instead of the shell's.
 */

import type { Project } from '@msm/plugin-api';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { type SoundPlayer, webAudioPlayer } from './player';
import type { VanillaSoundReader } from './vanilla-sounds';

const PlayerContext = createContext<SoundPlayer | null>(null);

/** Gives its children the app's sound player (`null` where the page has no Web Audio). */
export function SoundPlayerProvider({
  player,
  children,
}: {
  player?: SoundPlayer | null;
  children: ReactNode;
}) {
  const value = useMemo(() => (player === undefined ? webAudioPlayer() : player), [player]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/** The app's sound player, or `null`. */
export function useSoundPlayer(): SoundPlayer | null {
  return useContext(PlayerContext);
}

/** Reads a project asset (`assets/<namespace>/<path>`), or `null` when it is not there. */
export type ReadProjectSound = (namespace: string, path: string) => Promise<Uint8Array | null>;

/** What a Play button reads beyond its own props. */
export interface SoundSources {
  /** The open project, or `null`. */
  readonly project: Project | null;
  /** Reads Minecraft's own sounds, or `null` when there is no version to read. */
  readonly sounds: VanillaSoundReader | null;
  /** Reads the project's sound files (and a `sounds.json` kept as a plain asset). */
  readonly readProjectAsset: ReadProjectSound | null;
  /** Opens the Minecraft folder settings (the set-up link of a button that is off). */
  readonly onSetup?: (() => void) | undefined;
  /** Picks by weight; `Math.random` by default (tests pass their own). */
  readonly random?: (() => number) | undefined;
}

const NO_SOURCES: SoundSources = Object.freeze({
  project: null,
  sounds: null,
  readProjectAsset: null,
});

const SourcesContext = createContext<SoundSources>(NO_SOURCES);

/** Gives the Play buttons the open project, the vanilla reader and the set-up link. */
export function SoundSourcesProvider({
  value,
  children,
}: {
  value: SoundSources;
  children: ReactNode;
}) {
  return <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>;
}

/** What the Play buttons read; empty outside a {@link SoundSourcesProvider}. */
export function useSoundSources(): SoundSources {
  return useContext(SourcesContext);
}

/** How long an answer of {@link vanillaSoundsAvailable} is reused. */
const AVAILABLE_FOR_MS = 5_000;
const availability = new WeakMap<VanillaSoundReader, { at: number; answer: Promise<boolean> }>();

/**
 * Whether the reader can read vanilla's sounds, asked once for every button on screen: the
 * answer is kept for {@link AVAILABLE_FOR_MS}, so a folder set up meanwhile is seen soon after.
 */
export function vanillaSoundsAvailable(
  reader: VanillaSoundReader | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (reader === null) return Promise.resolve(false);
  const kept = availability.get(reader);
  if (kept !== undefined && now - kept.at < AVAILABLE_FOR_MS) return kept.answer;
  const answer = reader.available().catch(() => false);
  availability.set(reader, { at: now, answer });
  return answer;
}
