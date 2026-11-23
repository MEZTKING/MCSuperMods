/**
 * The app's sound player (ADR 0121 D1; B620 moved it here from `tryit/effects.ts`).
 *
 * - {@link webAudioOut} is Try it's player as it was: one `AudioContext`, made at the first
 *   sound, decoded sounds kept by key, Ogg Vorbis bytes.
 * - {@link SoundPlayer} is the player of the Play buttons (B622 builds {@link webAudioPlayer}): one
 *   sound at a time, a byte-capped cache of decoded buffers, long and `stream` sounds through a
 *   media element (the CSP needs `media-src 'self' blob:`, B622), streamed sounds never cached.
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

/** The Play buttons' player; `null` where the page has no Web Audio. Until B622 it is `null`. */
export function webAudioPlayer(_options?: { maxCachedBytes?: number }): SoundPlayer | null {
  return null;
}
