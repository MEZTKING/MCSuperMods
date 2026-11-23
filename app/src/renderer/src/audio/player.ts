/**
 * The app's sound player (ADR 0121 D1; B620 moved it here from `tryit/effects.ts`).
 *
 * - {@link webAudioOut} is Try it's player as it was: one `AudioContext`, made at the first
 *   sound, decoded sounds kept by key, Ogg Vorbis bytes.
 * - {@link SoundPlayer} is the player of the Play buttons ({@link webAudioPlayer}, B622): one
 *   sound at a time, a byte-capped cache of decoded buffers (least recently played dropped
 *   first), `stream` sounds and files over {@link STREAM_ABOVE_BYTES} through a media element on
 *   a `blob:` URL (the CSP allows `media-src 'self' blob:`; B619 3S2: the longest track decodes
 *   to over 300 MB), streamed sounds never cached. Pitch is the playback rate (0.5 to 2, as the
 *   game clamps it), volume the gain (0 to 1). A sound is heard flat: no distance, category
 *   volume or echo (ADR 0121 D2).
 */

/** Plays sound bytes; {@link webAudioOut} is the app's, tests pass a fake. */
export interface SoundOut {
  /** Plays an Ogg Vorbis file at a volume (0 to 1) and pitch (playback rate). */
  play(key: string, bytes: Uint8Array, volume: number, pitch: number): void;
}

interface AudioContextLike {
  readonly destination: unknown;
  readonly state?: string;
  resume?(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): {
    buffer: unknown;
    playbackRate: { value: number };
    connect(node: unknown): unknown;
    start(): void;
  };
  createGain(): { gain: { value: number }; connect(node: unknown): unknown };
}

/**
 * The Web Audio player: one `AudioContext`, made at the first sound; decoded sounds kept by key.
 * `null` where the page has no Web Audio (tests under happy-dom).
 */
export function webAudioOut(): SoundOut | null {
  const Context = (globalThis as { AudioContext?: new () => AudioContextLike }).AudioContext;
  if (Context === undefined) return null;
  let context: AudioContextLike | null = null;
  const decoded = new Map<string, Promise<unknown>>();
  return {
    play(key, bytes, volume, pitch) {
      try {
        context ??= new Context();
        const ctx = context;
        if (ctx.state === 'suspended') void ctx.resume?.().catch(() => {});
        let buffer = decoded.get(key);
        if (buffer === undefined) {
          const copy = bytes.slice().buffer;
          buffer = ctx.decodeAudioData(copy).catch(() => null);
          decoded.set(key, buffer);
        }
        void buffer.then((audio) => {
          if (audio === null) return;
          const source = ctx.createBufferSource();
          source.buffer = audio;
          source.playbackRate.value = Math.min(2, Math.max(0.5, pitch));
          const gain = ctx.createGain();
          gain.gain.value = Math.min(1, Math.max(0, volume));
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start();
        });
      } catch {
        // No sound here; the caption still shows.
      }
    },
  };
}

/** One sound to play. */
export interface SoundRequest {
  key: string;
  bytes: Uint8Array;
  /** 0 to 1. */
  volume: number;
  /** The playback rate. */
  pitch: number;
  /** Plays through a media element and is never cached. */
  stream: boolean;
}

/** A sound that is playing. */
export interface PlayingSound {
  readonly key: string;
  stop(): void;
  /** Resolves when it ends or is stopped. */
  readonly ended: Promise<void>;
  /** Seconds played. */
  position(): number;
  /** Seconds long, or `null` until known. */
  readonly duration: number | null;
}

/** The player of the Play buttons: one sound at a time, so a second `play` stops the first. */
export interface SoundPlayer {
  play(request: SoundRequest): PlayingSound | null;
  stopAll(): void;
  readonly current: PlayingSound | null;
}

/** Files larger than this play through a media element even without `stream` (B619 3S2). */
export const STREAM_ABOVE_BYTES = 2 * 1024 * 1024;
/** The default cap of decoded buffers kept for the next press. */
export const DEFAULT_MAX_CACHED_BYTES = 64 * 1024 * 1024;

const clampPitch = (pitch: number): number =>
  Number.isFinite(pitch) ? Math.min(2, Math.max(0.5, pitch)) : 1;
const clampVolume = (volume: number): number =>
  Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;

/** What the player needs of a decoded buffer. */
interface DecodedLike {
  readonly duration: number;
  readonly length?: number;
  readonly numberOfChannels?: number;
}

/** What the player needs of an `AudioContext`. */
export interface PlayerContextLike {
  readonly destination: unknown;
  readonly currentTime: number;
  readonly state?: string;
  resume?(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<DecodedLike>;
  createBufferSource(): {
    buffer: unknown;
    playbackRate: { value: number };
    onended: (() => void) | null;
    connect(node: unknown): unknown;
    start(): void;
    stop(): void;
  };
  createGain(): { gain: { value: number }; connect(node: unknown): unknown };
}

/** What the player needs of an `<audio>` element. */
export interface PlayerMediaLike {
  src: string;
  volume: number;
  playbackRate: number;
  preservesPitch?: boolean;
  readonly currentTime: number;
  readonly duration: number;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void>;
  pause(): void;
}

/** Options of {@link webAudioPlayer}; the last three are for tests. */
export interface WebAudioPlayerOptions {
  /** The most bytes of decoded audio kept (default {@link DEFAULT_MAX_CACHED_BYTES}). */
  maxCachedBytes?: number;
  /** Makes the `AudioContext` (made at the first sound). */
  createContext?: () => PlayerContextLike;
  /** Makes a media element. */
  createMedia?: () => PlayerMediaLike;
  /** Makes and drops `blob:` URLs. */
  urls?: { create(bytes: Uint8Array): string; revoke(url: string): void };
}

/** The bytes a decoded buffer takes (32-bit samples per channel). */
const decodedBytes = (buffer: DecodedLike): number =>
  (buffer.length ?? Math.ceil(buffer.duration * 48_000)) * (buffer.numberOfChannels ?? 1) * 4;

/** A sound being played, and how it ends. */
function playing(key: string): {
  sound: PlayingSound;
  finish(): void;
  setStop(stop: () => void): void;
  setClock(position: () => number, duration: () => number | null): void;
  readonly done: boolean;
} {
  let done = false;
  let resolve: () => void = () => {};
  const ended = new Promise<void>((settle) => {
    resolve = settle;
  });
  let stop: () => void = () => {};
  let position: () => number = () => 0;
  let duration: () => number | null = () => null;
  const finish = () => {
    if (done) return;
    done = true;
    resolve();
  };
  const sound: PlayingSound = {
    key,
    ended,
    stop() {
      if (done) return;
      try {
        stop();
      } catch {
        // Already stopped.
      }
      finish();
    },
    position: () => (done ? 0 : position()),
    get duration() {
      return duration();
    },
  };
  return {
    sound,
    finish,
    setStop: (next) => {
      stop = next;
    },
    setClock: (nextPosition, nextDuration) => {
      position = nextPosition;
      duration = nextDuration;
    },
    get done() {
      return done;
    },
  };
}

/**
 * The Play buttons' player (see the module comment); `null` where the page has no Web Audio
 * (tests under happy-dom) and no context maker is given.
 */
export function webAudioPlayer(options: WebAudioPlayerOptions = {}): SoundPlayer | null {
  const Context = (globalThis as { AudioContext?: new () => PlayerContextLike }).AudioContext;
  const createContext =
    options.createContext ?? (Context === undefined ? undefined : () => new Context());
  if (createContext === undefined) return null;
  const createMedia =
    options.createMedia ??
    (() => new (globalThis as unknown as { Audio: new () => PlayerMediaLike }).Audio());
  const urls = options.urls ?? {
    create: (bytes: Uint8Array) =>
      URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'audio/ogg' })),
    revoke: (url: string) => URL.revokeObjectURL(url),
  };
  const maxCachedBytes = Math.max(0, options.maxCachedBytes ?? DEFAULT_MAX_CACHED_BYTES);
  let context: PlayerContextLike | null = null;
  // Least recently played first; a pending decode counts once it has finished.
  const cache = new Map<string, { buffer: Promise<DecodedLike | null>; bytes: number }>();
  let current: PlayingSound | null = null;

  const cachedBytes = () => [...cache.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  const trim = () => {
    for (const [key, entry] of cache) {
      if (cachedBytes() <= maxCachedBytes) return;
      if (entry.bytes > 0) cache.delete(key);
    }
  };
  const decode = (ctx: PlayerContextLike, key: string, bytes: Uint8Array) => {
    const hit = cache.get(key);
    if (hit !== undefined) {
      cache.delete(key);
      cache.set(key, hit);
      return hit.buffer;
    }
    const entry = { buffer: Promise.resolve<DecodedLike | null>(null), bytes: 0 };
    entry.buffer = ctx
      .decodeAudioData(bytes.slice().buffer)
      .then((buffer) => {
        entry.bytes = decodedBytes(buffer);
        if (entry.bytes > maxCachedBytes) cache.delete(key);
        trim();
        return buffer;
      })
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, entry);
    return entry.buffer;
  };

  const playBuffer = (request: SoundRequest, handle: ReturnType<typeof playing>) => {
    context ??= createContext();
    const ctx = context;
    if (ctx.state === 'suspended') void ctx.resume?.().catch(() => {});
    void decode(ctx, request.key, request.bytes).then((buffer) => {
      if (handle.done) return;
      if (buffer === null) {
        handle.finish();
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const pitch = clampPitch(request.pitch);
      source.playbackRate.value = pitch;
      const gain = ctx.createGain();
      gain.gain.value = clampVolume(request.volume);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => handle.finish();
      const startedAt = ctx.currentTime;
      handle.setStop(() => source.stop());
      handle.setClock(
        () => (ctx.currentTime - startedAt) * pitch,
        () => buffer.duration,
      );
      source.start();
    });
  };

  const playMedia = (request: SoundRequest, handle: ReturnType<typeof playing>) => {
    const url = urls.create(request.bytes);
    const media = createMedia();
    let revoked = false;
    const release = () => {
      if (revoked) return;
      revoked = true;
      urls.revoke(url);
    };
    media.preservesPitch = false;
    media.playbackRate = clampPitch(request.pitch);
    media.volume = clampVolume(request.volume);
    media.onended = () => {
      release();
      handle.finish();
    };
    media.onerror = media.onended;
    handle.setStop(() => {
      media.pause();
      release();
    });
    handle.setClock(
      () => media.currentTime,
      () => (Number.isFinite(media.duration) ? media.duration : null),
    );
    media.src = url;
    void media.play().catch(() => {
      release();
      handle.finish();
    });
  };

  const player: SoundPlayer = {
    play(request) {
      player.stopAll();
      const handle = playing(request.key);
      current = handle.sound;
      void handle.sound.ended.then(() => {
        if (current === handle.sound) current = null;
      });
      try {
        if (request.stream || request.bytes.byteLength > STREAM_ABOVE_BYTES) {
          playMedia(request, handle);
        } else {
          playBuffer(request, handle);
        }
      } catch {
        handle.finish();
        return null;
      }
      return handle.sound;
    },
    stopAll() {
      const playingNow = current;
      current = null;
      playingNow?.stop();
    },
    get current() {
      return current;
    },
  };
  return player;
}

/** The bytes of decoded audio a player made by {@link webAudioPlayer} keeps; for tests. */
export const decodedSizeOf = decodedBytes;
