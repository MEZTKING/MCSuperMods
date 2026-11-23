// @vitest-environment happy-dom
/**
 * Songs and calls (B630, ADR 0121): the music disc song's Play, time line, its stated length
 * against the file's (read from made-up Ogg containers, never a Mojang file) and the comparator
 * signal; the goat horn call's Play, its blow against the file and its range circle with
 * Minecraft's own horns' ring from a made-up `instrument` folder; Very easy draws no ids.
 */
import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type {
  PlayingSound,
  SoundPlayer,
  SoundRequest,
} from '../../../../src/renderer/src/audio/player';
import type { VanillaSoundReader } from '../../../../src/renderer/src/audio/vanilla-sounds';
import { forbiddenIn } from '../../../../src/renderer/src/components/ai/ai-words';
import InstrumentView, {
  scaleStep,
  vanillaRange,
} from '../../../../src/renderer/src/liveviews/looks/instrument/InstrumentView';
import JukeboxSongView from '../../../../src/renderer/src/liveviews/looks/jukebox/JukeboxSongView';
import {
  lengthVerdict,
  lengthWords,
  namedSound,
  readFileLengths,
  soundWords,
} from '../../../../src/renderer/src/liveviews/looks/jukebox/song-files';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import {
  NOT_SET_UP_VANILLA_DATA,
  type VanillaDataReader,
} from '../../../../src/renderer/src/liveviews/vanilla-data';
import { DEFAULT_PREFS } from '../../../../src/renderer/src/liveviews/view-prefs';
import { SoundHarness } from '../../audio/fake-player';
import { element } from '../../fixtures';

/** Made-up Ogg Vorbis bytes: an identification header and a last page `seconds` long. */
export function oggSeconds(seconds: number, rate = 44_100): Uint8Array {
  const out = new Uint8Array(27 + 1 + 30 + 27 + 1 + 1);
  const view = new DataView(out.buffer);
  const page = (at: number, granule: number, size: number) => {
    out.set([0x4f, 0x67, 0x67, 0x53], at);
    view.setUint32(at + 6, granule % 2 ** 32, true);
    view.setUint32(at + 10, Math.floor(granule / 2 ** 32), true);
    out[at + 26] = 1;
    out[at + 27] = size;
  };
  page(0, 0, 30);
  out.set([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73], 28);
  out[28 + 11] = 2;
  view.setUint32(28 + 12, rate, true);
  page(58, Math.round(seconds * rate), 1);
  return out;
}

/** A fake player whose sound has got `at` seconds in. */
function timedPlayer(at: number): { player: SoundPlayer; played: SoundRequest[] } {
  const played: SoundRequest[] = [];
  let current: PlayingSound | null = null;
  const player: SoundPlayer = {
    play(request) {
      player.stopAll();
      let finish: () => void = () => {};
      const ended = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const sound: PlayingSound = {
        key: request.key,
        stop: () => {
          if (current === sound) current = null;
          finish();
        },
        ended,
        position: () => at,
        duration: null,
      };
      current = sound;
      played.push(request);
      return sound;
    },
    stopAll() {
      current?.stop();
      current = null;
    },
    get current() {
      return current;
    },
  };
  return { player, played };
}

const WALTZ_SOUNDS = {
  'music_disc.waltz': { sounds: [{ name: 'demo:music/waltz', stream: true }] },
};

function project(extra: Element[], files: Record<string, Uint8Array>): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        elements: [
          element('demo:sounds' as ResourceLocation, 'minecraft:sounds', WALTZ_SOUNDS),
          element('demo:en_us' as ResourceLocation, 'minecraft:lang', {
            'jukebox_song.demo.waltz': 'You - Ruby Waltz',
          }),
          ...extra,
        ],
        assets: Object.keys(files).map((path) => ({ path, mediaType: 'audio/ogg' })),
      },
    ],
  };
}

const reader = (files: Record<string, Uint8Array>) => async (path: string) => {
  const match = /^assets\/demo\/(.+)$/.exec(path);
  return match === null ? null : (files[match[1] as string] ?? null);
};

/** A vanilla sound reader over made-up `sounds.json` and files. */
function vanillaSounds(
  json: Json,
  files: Record<string, Uint8Array>,
  setUp = true,
): VanillaSoundReader {
  return {
    available: async () => setUp,
    soundsJson: async () => (setUp ? json : null),
    file: async (key) => (setUp ? (files[key] ?? null) : null),
  };
}

function props(
  over: Partial<LiveViewProps> & Pick<LiveViewProps, 'project' | 'element'>,
): LiveViewProps {
  return {
    vanilla: NOT_SET_UP_VANILLA_DATA,
    vanillaAssets: null,
    sounds: null,
    preferences: DEFAULT_PREFS,
    onPreferences() {},
    onSetup() {},
    ...over,
  };
}

function wrap(player: SoundPlayer | null, children: ReactNode) {
  return (
    <SoundHarness player={player} sources={{ project: null, sounds: null, readProjectAsset: null }}>
      {children}
    </SoundHarness>
  );
}

beforeAll(async () => {
  // The views' imports, once, outside the cases' timeouts.
  await import('../../../../src/renderer/src/liveviews/looks/jukebox/JukeboxSongView');
});

afterEach(() => {
  cleanup();
});

describe('song-files', () => {
  it('reads the sound field in both forms', () => {
    expect(namedSound('minecraft:music_disc.cat')).toEqual({
      event: 'minecraft:music_disc.cat',
      range: null,
    });
    expect(namedSound({ sound_id: 'demo:x', range: 64 })).toEqual({ event: 'demo:x', range: 64 });
    expect(namedSound('')).toBeNull();
    expect(namedSound({ range: 3 })).toBeNull();
  });

  it('words lengths and compares them within a second', () => {
    expect(lengthWords(185)).toBe('3 min 5 s');
    expect(lengthWords(120)).toBe('2 min');
    expect(lengthWords(7.25)).toBe('7.3 s');
    expect(lengthVerdict(185, 184.4)).toBe('matches');
    expect(lengthVerdict(185, 190)).toBe('shorter');
    expect(lengthVerdict(185, 120)).toBe('longer');
    expect(soundWords('demo:music_disc.ruby_waltz')).toBe('Music disc ruby waltz');
  });

  it('reads a project file and a Minecraft file, and says which needs the folder', async () => {
    const files = { 'sounds/music/waltz.ogg': oggSeconds(190) };
    const own = project([], files);
    const lengths = await readFileLengths('demo:music_disc.waltz', own, reader(files), null);
    expect(lengths.origin).toBe('project');
    expect(lengths.files[0]?.seconds).toBeCloseTo(190, 3);
    const vanilla = vanillaSounds(
      { 'music_disc.cat': { sounds: [{ name: 'records/cat', stream: true }] } },
      { 'minecraft/sounds/records/cat.ogg': oggSeconds(185) },
    );
    const cat = await readFileLengths('minecraft:music_disc.cat', own, null, vanilla);
    expect(cat.files[0]?.seconds).toBeCloseTo(185, 3);
    const unset = await readFileLengths('minecraft:music_disc.cat', own, null, null);
    expect(unset.files[0]?.status).toBe('needs_minecraft');
    const none = await readFileLengths('demo:nothing', own, reader(files), null);
    expect(none.origin).toBe('missing');
  });
});

describe('the music disc song view', () => {
  const files = { 'sounds/music/waltz.ogg': oggSeconds(190) };
  const song = (length: number, comparator = 7) =>
    element('demo:waltz' as ResourceLocation, 'minecraft:jukebox_song', {
      description: { translate: 'jukebox_song.demo.waltz' },
      sound_event: 'demo:music_disc.waltz',
      length_in_seconds: length,
      comparator_output: comparator,
    });

  it("shows the stated length against the file's, and follows an edit", async () => {
    const { player } = timedPlayer(0);
    const first = song(185);
    const view = render(
      wrap(
        player,
        <JukeboxSongView
          {...props({
            project: project([first], files),
            element: first,
            readProject: reader(files),
          })}
        />,
      ),
    );
    expect(screen.getByTestId('song-name').textContent).toBe('You - Ruby Waltz');
    expect(screen.getByTestId('song-stated').textContent).toContain('3 min 5 s');
    await waitFor(() => expect(screen.getByTestId('song-file').dataset.status).toBe('ready'));
    const line = screen.getByTestId('song-file');
    expect(line.dataset.seconds).toBe('190.00');
    expect(line.dataset.verdict).toBe('shorter');
    expect(line.textContent).toContain('lasts 3 min 10 s');
    expect(screen.getByTestId('song-verdict').textContent).toContain('5 s less');
    expect(screen.getByTestId('song-comparator').dataset.strength).toBe('7');
    // Both marks on the time line.
    expect(screen.getByTestId('song-time-file-end')).toBeTruthy();
    expect(screen.getByTestId('song-time-stated-end')).toBeTruthy();

    const fixed = song(190, 12);
    view.rerender(
      wrap(
        player,
        <JukeboxSongView
          {...props({
            project: project([fixed], files),
            element: fixed,
            readProject: reader(files),
          })}
        />,
      ),
    );
    expect(screen.getByTestId('song-comparator').dataset.strength).toBe('12');
    await waitFor(() => expect(screen.getByTestId('song-file').dataset.verdict).toBe('matches'));
    expect(screen.getByTestId('song-verdict').textContent).toBe(
      'The length the data states matches the file.',
    );
  });

  it('plays the song, streamed, and moves the time line', async () => {
    const { player, played } = timedPlayer(42);
    const one = song(185);
    render(
      wrap(
        player,
        <JukeboxSongView
          {...props({ project: project([one], files), element: one, readProject: reader(files) })}
        />,
      ),
    );
    expect(screen.getByTestId('song-time-now').textContent).toContain('Not playing');
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-play'));
    });
    await waitFor(() => expect(played).toHaveLength(1));
    expect(played[0]?.stream).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId('song-time-now').textContent).toBe('42 s of 3 min 5 s'),
    );
    expect(screen.getByTestId('song-time-played').style.width).toMatch(/%$/);
    // A second press stops it, and the line says so.
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-play'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('song-time-now').textContent).toContain('Not playing'),
    );
  });

  it("reads Minecraft's own song from the folder, and asks for it when it is not set up", async () => {
    const cat = element('demo:cat' as ResourceLocation, 'minecraft:jukebox_song', {
      description: 'Cat',
      sound_event: 'minecraft:music_disc.cat',
      length_in_seconds: 185,
      comparator_output: 2,
    });
    const json = { 'music_disc.cat': { sounds: [{ name: 'records/cat', stream: true }] } };
    const view = render(
      wrap(
        timedPlayer(0).player,
        <JukeboxSongView
          {...props({
            project: project([cat], {}),
            element: cat,
            sounds: vanillaSounds(json, { 'minecraft/sounds/records/cat.ogg': oggSeconds(185.2) }),
          })}
        />,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('song-file').dataset.verdict).toBe('matches'));
    view.unmount();
    render(
      wrap(
        timedPlayer(0).player,
        <JukeboxSongView
          {...props({
            project: project([cat], {}),
            element: cat,
            sounds: vanillaSounds(json, {}, false),
          })}
        />,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('live-view-set-up')).toBeTruthy());
    expect(screen.getByTestId('song-file').dataset.status).toBe('needs_minecraft');
  });

  it('draws no ids in Very easy', async () => {
    const one = song(185);
    render(
      wrap(
        timedPlayer(0).player,
        <JukeboxSongView
          {...props({ project: project([one], files), element: one, readProject: reader(files) })}
        />,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('song-file').dataset.status).toBe('ready'));
    expect(forbiddenIn(screen.getByTestId('live-view').textContent ?? '')).toEqual([]);
  });
});

describe('the goat horn call view', () => {
  const horn = (range: number, seconds = 7) =>
    element('demo:storm_call' as ResourceLocation, 'minecraft:instrument', {
      description: 'Storm Call',
      sound_event: { sound_id: 'demo:item.goat_horn.storm_call' },
      use_duration: seconds,
      range,
    });
  const sounds = {
    'item.goat_horn.storm_call': { sounds: [{ name: 'demo:item/goat_horn/storm_call' }] },
  };
  const files = { 'sounds/item/goat_horn/storm_call.ogg': oggSeconds(5.5) };
  const hornProject = (one: Element): Project => ({
    ...project([one], files),
    namespaces: [
      {
        name: 'demo',
        elements: [element('demo:sounds' as ResourceLocation, 'minecraft:sounds', sounds), one],
        assets: Object.keys(files).map((path) => ({ path, mediaType: 'audio/ogg' })),
      },
    ],
  });
  /** A vanilla data reader whose `instrument` folder holds two made-up horns. */
  const vanillaHorns: VanillaDataReader = {
    ...NOT_SET_UP_VANILLA_DATA,
    folder: async () => ({
      status: 'ready',
      version: 'test',
      files: { 'minecraft:a': { range: 256 }, 'minecraft:b': { range: 256 } },
    }),
  };

  it('plays the call, words the blow against the file and draws the range with a scale', async () => {
    const { player, played } = timedPlayer(0);
    const one = horn(128);
    const view = render(
      wrap(
        player,
        <InstrumentView
          {...props({
            project: hornProject(one),
            element: one,
            readProject: reader(files),
            vanilla: vanillaHorns,
          })}
        />,
      ),
    );
    expect(screen.getByTestId('instrument-name').textContent).toBe('Storm Call');
    expect(screen.getByTestId('instrument-range').dataset.range).toBe('128');
    await waitFor(() => expect(screen.getByTestId('instrument-vanilla-circle')).toBeTruthy());
    const small = Number(screen.getByTestId('instrument-range-circle').getAttribute('r'));
    expect(small).toBeCloseTo(48, 3);
    await waitFor(() =>
      expect(screen.getByTestId('instrument-blow').textContent).toContain(
        'The sound file lasts 5.5 s',
      ),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('instrument-play'));
    });
    await waitFor(() => expect(played).toHaveLength(1));
    // An edit of the range redraws the circle at once.
    const wide = horn(512, 3);
    view.rerender(
      wrap(
        player,
        <InstrumentView
          {...props({
            project: hornProject(wide),
            element: wide,
            readProject: reader(files),
            vanilla: vanillaHorns,
          })}
        />,
      ),
    );
    expect(screen.getByTestId('instrument-range').dataset.range).toBe('512');
    expect(Number(screen.getByTestId('instrument-range-circle').getAttribute('r'))).toBeCloseTo(
      96,
      3,
    );
    expect(screen.getByTestId('instrument-blow').textContent).toContain('One blow lasts 3 s');
  });

  it('picks a tidy scale and reads one shared vanilla range', () => {
    expect(scaleStep(256)).toBe(64);
    expect(scaleStep(512)).toBe(128);
    expect(scaleStep(20)).toBe(4);
    expect(vanillaRange({ a: { range: 256 }, b: { range: 256 } })).toBe(256);
    expect(vanillaRange({ a: { range: 256 }, b: { range: 64 } })).toBeNull();
  });

  it('draws no ids in Very easy', async () => {
    const one = horn(256);
    render(
      wrap(
        timedPlayer(0).player,
        <InstrumentView
          {...props({ project: hornProject(one), element: one, readProject: reader(files) })}
        />,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('instrument-blow').textContent).toContain('file lasts'),
    );
    expect(forbiddenIn(screen.getByTestId('live-view').textContent ?? '')).toEqual([]);
  });
});
