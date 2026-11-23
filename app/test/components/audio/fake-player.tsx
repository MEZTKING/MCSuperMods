/**
 * A fake sound player and the providers around a Play button (B622). Every sound file here is
 * made-up bytes; no Mojang file is used.
 */
import type { Json, Project, ResourceLocation } from '@msm/core';
import type { ReactNode } from 'react';
import type {
  PlayingSound,
  SoundPlayer,
  SoundRequest,
} from '../../../src/renderer/src/audio/player';
import {
  SoundPlayerProvider,
  type SoundSources,
  SoundSourcesProvider,
} from '../../../src/renderer/src/audio/provider';
import type { VanillaSoundReader } from '../../../src/renderer/src/audio/vanilla-sounds';
import { element } from '../fixtures';

/** A player that records each request and plays until stopped. */
export function fakePlayer(): { player: SoundPlayer; played: SoundRequest[]; stopped: string[] } {
  const played: SoundRequest[] = [];
  const stopped: string[] = [];
  let current: PlayingSound | null = null;
  const player: SoundPlayer = {
    play(request) {
      player.stopAll();
      let finish: () => void = () => {};
      const ended = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let done = false;
      const sound: PlayingSound = {
        key: request.key,
        stop() {
          if (done) return;
          done = true;
          stopped.push(request.key);
          finish();
        },
        ended,
        position: () => 0,
        duration: null,
      };
      current = sound;
      played.push(request);
      void ended.then(() => {
        if (current === sound) current = null;
      });
      return sound;
    },
    stopAll() {
      const now = current;
      current = null;
      now?.stop();
    },
    get current() {
      return current;
    },
  };
  return { player, played, stopped };
}

/** Made-up Ogg bytes for a name. */
export const oggOf = (name: string): Uint8Array =>
  new Uint8Array([79, 103, 103, 83, ...new TextEncoder().encode(name)]);

/** A vanilla reader over a made-up `sounds.json`; `setUp.value` false answers "not set up". */
export function fakeVanilla(
  soundsJson: Json,
  setUp: { value: boolean } = { value: true },
): VanillaSoundReader & { files: string[] } {
  const files: string[] = [];
  return {
    files,
    available: async () => setUp.value,
    soundsJson: async () => (setUp.value ? soundsJson : null),
    file: async (key) => {
      if (!setUp.value) return null;
      files.push(key);
      return oggOf(key);
    },
  };
}

/** A project with a `sounds.json` element in `demo` and its sound files as assets. */
export function soundProject(sounds: Json, files: readonly string[] = []): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        elements: [element('demo:sounds' as ResourceLocation, 'minecraft:sounds', sounds)],
        assets: files.map((path) => ({ path, mediaType: 'audio/ogg' })),
      },
    ],
  };
}

/** Reads `assets/<ns>/<path>` of a project's assets as made-up bytes. */
export function projectReader(project: Project): {
  read: (namespace: string, path: string) => Promise<Uint8Array | null>;
  reads: string[];
} {
  const reads: string[] = [];
  return {
    reads,
    read: async (namespace, path) => {
      reads.push(`${namespace}:${path}`);
      const found = project.namespaces.some(
        (entry) => entry.name === namespace && entry.assets.some((asset) => asset.path === path),
      );
      return found ? oggOf(`${namespace}:${path}`) : null;
    },
  };
}

/** The providers a Play button reads. */
export function SoundHarness(props: {
  player: SoundPlayer | null;
  sources: SoundSources;
  children: ReactNode;
}) {
  return (
    <SoundPlayerProvider player={props.player}>
      <SoundSourcesProvider value={props.sources}>{props.children}</SoundSourcesProvider>
    </SoundPlayerProvider>
  );
}
