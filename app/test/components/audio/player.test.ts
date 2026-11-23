/**
 * The Play buttons' player (ADR 0121 D2; B622, B619 3S2): one sound at a time, decoded buffers
 * in a byte-capped cache, `stream` and large files through a media element on a `blob:` URL
 * that is dropped when the sound ends, never cached. Web Audio and the media element are fakes.
 */
import { describe, expect, it } from 'vitest';
import {
  type PlayerContextLike,
  type PlayerMediaLike,
  STREAM_ABOVE_BYTES,
  webAudioPlayer,
} from '../../../src/renderer/src/audio/player';

/** A fake `AudioContext`: decodes to a buffer of one second per byte, counts decodes. */
function fakeContext() {
  const log = { decodes: 0, started: [] as { rate: number; gain: number }[], stopped: 0 };
  let lastGain = { gain: { value: 1 }, connect: () => undefined };
  const sources: { onended: (() => void) | null }[] = [];
  const context: PlayerContextLike = {
    destination: {},
    currentTime: 0,
    decodeAudioData: async (data) => {
      log.decodes += 1;
      return { duration: data.byteLength, length: data.byteLength * 1000, numberOfChannels: 1 };
    },
    createBufferSource: () => {
      const source = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        onended: null as (() => void) | null,
        connect: () => undefined,
        start: () =>
          log.started.push({ rate: source.playbackRate.value, gain: lastGain.gain.value }),
        stop: () => {
          log.stopped += 1;
        },
      };
      sources.push(source);
      return source;
    },
    createGain: () => {
      lastGain = { gain: { value: 1 }, connect: () => undefined };
      return lastGain;
    },
  };
  return { context, log, sources };
}

function fakeMedia() {
  const made: (PlayerMediaLike & { paused: boolean })[] = [];
  const urls = { made: [] as string[], revoked: [] as string[] };
  return {
    made,
    urls,
    createMedia: () => {
      const media = {
        src: '',
        volume: 1,
        playbackRate: 1,
        preservesPitch: true,
        currentTime: 0,
        duration: Number.NaN,
        onended: null as (() => void) | null,
        onerror: null as (() => void) | null,
        paused: true,
        play: async () => {
          media.paused = false;
        },
        pause: () => {
          media.paused = true;
        },
      };
      made.push(media);
      return media;
    },
    urlMaker: {
      create: () => {
        const url = `blob:fake/${urls.made.length}`;
        urls.made.push(url);
        return url;
      },
      revoke: (url: string) => urls.revoked.push(url),
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('webAudioPlayer', () => {
  it('is null without Web Audio and without a context maker', () => {
    expect(webAudioPlayer()).toBeNull();
  });

  it('plays one sound at a time at its volume and pitch, clamped as the game does', async () => {
    const { context, log } = fakeContext();
    const player = webAudioPlayer({ createContext: () => context });
    if (player === null) throw new Error('no player');
    const first = player.play({
      key: 'a',
      bytes: new Uint8Array(4),
      volume: 2,
      pitch: 3,
      stream: false,
    });
    await flush();
    expect(log.started).toEqual([{ rate: 2, gain: 1 }]);
    expect(player.current).toBe(first);
    const second = player.play({
      key: 'b',
      bytes: new Uint8Array(5),
      volume: 0.25,
      pitch: 0.75,
      stream: false,
    });
    await first?.ended;
    expect(log.stopped).toBe(1);
    await flush();
    expect(log.started[1]).toEqual({ rate: 0.75, gain: 0.25 });
    expect(player.current).toBe(second);
    expect(second?.duration).toBe(5);
    player.stopAll();
    await second?.ended;
    expect(player.current).toBeNull();
  });

  it('keeps decoded buffers under its byte cap, the least recently played going first', async () => {
    const { context, log } = fakeContext();
    // Each fake buffer of n bytes decodes to n * 4000 bytes: two of 4 bytes fit in 40,000.
    const player = webAudioPlayer({ createContext: () => context, maxCachedBytes: 40_000 });
    if (player === null) throw new Error('no player');
    const play = async (key: string) => {
      player.play({ key, bytes: new Uint8Array(4), volume: 1, pitch: 1, stream: false });
      await flush();
    };
    await play('a');
    await play('b');
    await play('a');
    expect(log.decodes).toBe(2);
    await play('c');
    // Over the cap: b (least recently played) went, a stayed.
    await play('a');
    expect(log.decodes).toBe(3);
    await play('b');
    expect(log.decodes).toBe(4);
  });

  it('streams `stream` sounds and large files through a media element, never cached', async () => {
    const { context, log } = fakeContext();
    const media = fakeMedia();
    const player = webAudioPlayer({
      createContext: () => context,
      createMedia: media.createMedia,
      urls: media.urlMaker,
    });
    if (player === null) throw new Error('no player');
    const song = player.play({
      key: 'song',
      bytes: new Uint8Array(8),
      volume: 0.5,
      pitch: 1.5,
      stream: true,
    });
    await flush();
    expect(log.decodes).toBe(0);
    expect(media.made[0]).toMatchObject({
      src: 'blob:fake/0',
      volume: 0.5,
      playbackRate: 1.5,
      preservesPitch: false,
      paused: false,
    });
    media.made[0]?.onended?.();
    await song?.ended;
    expect(media.urls.revoked).toEqual(['blob:fake/0']);

    const big = player.play({
      key: 'big',
      bytes: new Uint8Array(STREAM_ABOVE_BYTES + 1),
      volume: 1,
      pitch: 1,
      stream: false,
    });
    await flush();
    expect(log.decodes).toBe(0);
    expect(media.made).toHaveLength(2);
    big?.stop();
    await big?.ended;
    expect(media.made[1]?.paused).toBe(true);
    expect(media.urls.revoked).toEqual(['blob:fake/0', 'blob:fake/1']);
    // Played again, it is streamed again (nothing kept).
    player.play({ key: 'song', bytes: new Uint8Array(8), volume: 1, pitch: 1, stream: true });
    expect(media.made).toHaveLength(3);
  });

  it('ends a sound whose bytes do not decode', async () => {
    const { context } = fakeContext();
    const player = webAudioPlayer({
      createContext: () => ({
        ...context,
        decodeAudioData: async () => Promise.reject(new Error('bad')),
      }),
    });
    const sound = player?.play({
      key: 'bad',
      bytes: new Uint8Array(2),
      volume: 1,
      pitch: 1,
      stream: false,
    });
    await sound?.ended;
    expect(player?.current).toBeNull();
  });
});
