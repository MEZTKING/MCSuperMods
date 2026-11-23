/**
 * Sounds, chips and portal hums in Try it (ADR 0085 D6, L13; B398).
 *
 * - **Sounds.** A sound the simulation asks for is shown as a caption, the way the game's
 *   subtitles show one. A project sound (an event key of the project's `sounds.json`) also plays:
 *   its first `.ogg` file is read from the lowered files or the project's assets and played
 *   through the Web Audio API ({@link webAudioOut}; the page's Content Security Policy allows no
 *   `data:` media, and decoding bytes needs none). Minecraft's own sounds are never played: they
 *   are not in the client jar and never bundled (ADR 0011), so they stay a caption (L13).
 *   Volume falls off with distance as the game's does, over 16 blocks times the volume.
 * - **Chips** (D6) are short words about the player or a mob ("Glowing for 3 seconds"). Each
 *   stays as long as its words say, else {@link CHIP_TICKS} ticks.
 * - **Portal hums.** A portal block near the player plays its ambient sound about once in
 *   {@link PORTAL_HUM_ONE_IN} ticks (the runtime's `MsmPortalBlock.animateTick`); like the ambient
 *   particles, every portal block within range gets the chance each tick.
 *
 * Time is counted in simulation ticks, so a paused clock keeps chips and captions on screen. No
 * React and no GL: the view reads {@link TryItEffects.chips} and {@link TryItEffects.captions}.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import {
  type BlockPos,
  type BlockState,
  readJsonFile,
  type SimEffect,
  type SimFiles,
  type SimOrigin,
  soundName,
  type Vec3,
} from '@msm/sim';
import { type SoundOut, webAudioOut } from '../audio/player';
import { resolveSoundEvent, splitSoundId } from '../audio/resolve';
import { AMBIENT_RANGE, type Random, seededRandom } from './ambient';

export { type SoundOut, webAudioOut };

/** How long a chip without a time in its words stays, in ticks. */
export const CHIP_TICKS = 60;
/** The longest a chip stays, in ticks. */
export const CHIP_TICKS_MAX = 600;
/** How long a caption stays after its sound, in ticks. */
export const CAPTION_TICKS = 50;
/** The most chips and captions shown at once; the oldest go first. */
export const MAX_SHOWN = 6;
/** A portal plays its ambient sound about once in this many ticks (ADR 0077 D4). */
export const PORTAL_HUM_ONE_IN = 100;
/** How far a sound of volume 1 carries, in blocks (the game's linear fall-off). */
export const SOUND_RANGE = 16;

/** The words under the sounds list for Minecraft's own sounds (ADR 0085 L13). */
export const VANILLA_SOUND_NOTE = 'Minecraft sound: it plays only in the game.';

/** How long a chip stays: the seconds its words name, else {@link CHIP_TICKS}. */
export function chipTicks(text: string): number {
  const match = /for (\d+(?:\.\d+)?) seconds?/.exec(text);
  if (match === null) return CHIP_TICKS;
  return Math.min(CHIP_TICKS_MAX, Math.max(1, Math.round(Number(match[1]) * 20)));
}

/** A chip on screen. */
export interface ShownChip {
  readonly serial: number;
  readonly text: string;
  /** `player`, or the mob's entity id. */
  readonly target: 'player' | number;
  /** The tick it goes. */
  readonly until: number;
  readonly origin?: SimOrigin;
}

/** A caption on screen. */
export interface ShownCaption {
  /** The sound event id (one caption per sound; a repeat keeps it on screen longer). */
  readonly id: string;
  /** The sound in plain words. */
  readonly text: string;
  /** True for a project sound the view plays; false for a caption only. */
  readonly played: boolean;
  /** Why it was not played, for a caption only. */
  readonly note?: string;
  readonly until: number;
  readonly origin?: SimOrigin;
}

/** Reads a project asset (`assets/<namespace>/<path>`) the lowered files do not hold. */
export type ReadProjectAsset = (namespace: string, path: string) => Promise<Uint8Array | null>;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A namespace's `sounds.json` with every bare name made the namespace's own (`hum` in `demo`'s
 * file is `demo:hum`): Try it has always read a bare name as the event's namespace, where the
 * shared resolver reads it as Minecraft's, as the game does. Kept so Try it plays what it did.
 */
function ownNames(soundsJson: JsonObject, namespace: string): JsonObject {
  const own = (name: string): string => (name.includes(':') ? name : `${namespace}:${name}`);
  const out: JsonObject = {};
  for (const [path, registration] of Object.entries(soundsJson)) {
    if (!isRecord(registration) || !Array.isArray(registration.sounds)) {
      out[path] = registration;
      continue;
    }
    out[path] = {
      ...registration,
      sounds: registration.sounds.map((one): Json => {
        if (typeof one === 'string') return one === '' ? one : own(one);
        if (isRecord(one) && typeof one.name === 'string' && one.name !== '') {
          return { ...one, name: own(one.name) };
        }
        return one;
      }),
    };
  }
  return out;
}

/**
 * The `.ogg` file of a project sound event: the first file of its entries as the shared resolver
 * (`audio/resolve.ts`) lists them; an event entry (`"type": "event"`) is followed, at most three
 * deep. `null` when the definitions do not name one. Minecraft's own `sounds.json` is never read
 * here (Try it plays only the project's sounds, L13).
 */
export function soundFileOf(
  soundsJson: Json | undefined,
  id: string,
  read: (namespace: string) => Json | undefined = () => undefined,
  depth = 0,
): { namespace: string; path: string } | null {
  const { namespace, path } = splitSoundId(id);
  if (!isRecord(soundsJson)) return null;
  const resolved = resolveSoundEvent(
    `${namespace}:${path}`,
    { [namespace]: ownNames(soundsJson, namespace) },
    null,
  );
  for (const entry of resolved.entries) {
    if (entry.type === 'event') {
      if (depth > 2) continue;
      const next = splitSoundId(entry.name);
      const found = soundFileOf(
        read(next.namespace),
        `${next.namespace}:${next.path}`,
        read,
        depth + 1,
      );
      if (found !== null) return found;
      continue;
    }
    const file = splitSoundId(entry.name);
    return { namespace: file.namespace, path: `sounds/${file.path}.ogg` };
  }
  return null;
}

/** Options of {@link TryItEffects}. */
export interface TryItEffectsOptions {
  files: SimFiles;
  /** The current tick. */
  now: () => number;
  /** Where the player listens from (the eye). */
  listener: () => Vec3;
  /** Reads project assets the lowered files do not hold (sound files, `sounds.json`). */
  readProjectAsset?: ReadProjectAsset;
  /** Plays project sounds; `null` shows captions only. */
  audio?: SoundOut | null;
}

/** The chips and captions of one test area; see the module comment. */
export class TryItEffects {
  private files: SimFiles;
  private readonly options: TryItEffectsOptions;
  private chipList: ShownChip[] = [];
  private captionList: ShownCaption[] = [];
  private serial = 0;
  private revisionCount = 0;
  /** `sounds.json` read from the project's assets, by namespace (when the files lack it). */
  private readonly soundsRead = new Map<string, Json | null>();
  private readonly soundsPending = new Map<string, Promise<Json | null>>();

  constructor(options: TryItEffectsOptions) {
    this.options = options;
    this.files = options.files;
  }

  /** New lowered files: project sounds are looked up again. */
  setFiles(files: SimFiles): void {
    if (files === this.files) return;
    this.files = files;
    this.soundsRead.clear();
    this.soundsPending.clear();
  }

  /** The chips on screen, oldest first. */
  get chips(): readonly ShownChip[] {
    return this.chipList;
  }

  /** The captions on screen, oldest first. */
  get captions(): readonly ShownCaption[] {
    return this.captionList;
  }

  /** Grows with every chip or caption that comes or goes. */
  get revision(): number {
    return this.revisionCount;
  }

  /** A `chip` effect. */
  chip(effect: SimEffect): void {
    const target = effect.target ?? 'player';
    this.serial += 1;
    // The same words about the same one replace the older chip.
    this.chipList = this.chipList.filter(
      (chip) => !(chip.text === effect.id && chip.target === target),
    );
    this.chipList.push({
      serial: this.serial,
      text: effect.id,
      target,
      until: this.options.now() + chipTicks(effect.id),
      ...(effect.origin === undefined ? {} : { origin: effect.origin }),
    });
    if (this.chipList.length > MAX_SHOWN) this.chipList.splice(0, this.chipList.length - MAX_SHOWN);
    this.revisionCount += 1;
  }

  /** A `sound` effect: a caption, and the sound itself when it is the project's. */
  sound(effect: SimEffect): void {
    const id = effect.id.includes(':') ? effect.id : `minecraft:${effect.id}`;
    const { namespace } = splitSoundId(id);
    const volume = this.volumeAt(effect);
    if (namespace === 'minecraft') {
      this.caption(id, false, VANILLA_SOUND_NOTE, effect.origin);
      return;
    }
    const known = this.soundsJson(namespace);
    if (known instanceof Promise) {
      // The first sound of a namespace waits for its `sounds.json`.
      void known.then(() => this.playProjectSound(id, volume, effect));
      return;
    }
    this.playProjectSound(id, volume, effect);
  }

  /** Takes the chips and captions whose time is up. */
  tick(): void {
    const now = this.options.now();
    const chips = this.chipList.filter((chip) => chip.until > now);
    const captions = this.captionList.filter((caption) => caption.until > now);
    if (chips.length !== this.chipList.length || captions.length !== this.captionList.length) {
      this.chipList = chips;
      this.captionList = captions;
      this.revisionCount += 1;
    }
  }

  /** No chips and no captions ("Clear the area"). */
  clear(): void {
    this.chipList = [];
    this.captionList = [];
    this.revisionCount += 1;
  }

  private volumeAt(effect: SimEffect): number {
    const volume = effect.volume ?? 1;
    if (effect.position === undefined) return Math.min(1, volume);
    const ear = this.options.listener();
    const distance = Math.hypot(
      effect.position.x - ear.x,
      effect.position.y - ear.y,
      effect.position.z - ear.z,
    );
    const range = SOUND_RANGE * Math.max(1, volume);
    return Math.min(1, volume) * Math.max(0, 1 - distance / range);
  }

  private soundsJson(namespace: string): Json | undefined | Promise<Json | null> {
    const lowered = readJsonFile(this.files, `assets/${namespace}/sounds.json`);
    if (lowered !== undefined) return lowered;
    if (this.soundsRead.has(namespace)) return this.soundsRead.get(namespace) ?? undefined;
    const read = this.options.readProjectAsset;
    if (read === undefined) return undefined;
    let pending = this.soundsPending.get(namespace);
    if (pending === undefined) {
      pending = read(namespace, 'sounds.json').then(
        (bytes) => {
          let parsed: Json | null = null;
          if (bytes !== null) {
            try {
              parsed = JSON.parse(new TextDecoder().decode(bytes)) as Json;
            } catch {
              parsed = null;
            }
          }
          this.soundsRead.set(namespace, parsed);
          return parsed;
        },
        () => {
          this.soundsRead.set(namespace, null);
          return null;
        },
      );
      this.soundsPending.set(namespace, pending);
    }
    return pending;
  }

  private playProjectSound(id: string, volume: number, effect: SimEffect): void {
    const read = (namespace: string): Json | undefined => {
      const found = this.soundsJson(namespace);
      return found instanceof Promise ? undefined : found;
    };
    const file = soundFileOf(read(splitSoundId(id).namespace), id, read);
    if (file === null) {
      this.caption(id, false, 'This sound is not in the project.', effect.origin);
      return;
    }
    this.caption(id, true, undefined, effect.origin);
    const audio = this.options.audio;
    if (audio === null || audio === undefined || volume <= 0) return;
    const key = `${file.namespace}/${file.path}`;
    const lowered = this.files.get(`assets/${key}`);
    if (lowered instanceof Uint8Array) {
      audio.play(key, lowered, volume, effect.pitch ?? 1);
      return;
    }
    void this.options
      .readProjectAsset?.(file.namespace, file.path)
      .then((bytes) => {
        if (bytes !== null && bytes.length > 0) audio.play(key, bytes, volume, effect.pitch ?? 1);
      })
      .catch(() => {});
  }

  private caption(id: string, played: boolean, note?: string, origin?: SimOrigin): void {
    const until = this.options.now() + CAPTION_TICKS;
    this.captionList = this.captionList.filter((caption) => caption.id !== id);
    this.captionList.push({
      id,
      text: soundName(id),
      played,
      until,
      ...(note === undefined ? {} : { note }),
      ...(origin === undefined ? {} : { origin }),
    });
    if (this.captionList.length > MAX_SHOWN) {
      this.captionList.splice(0, this.captionList.length - MAX_SHOWN);
    }
    this.revisionCount += 1;
  }
}

/** The world the portal hums read; `SimWorld` fits. */
export interface HumWorld {
  get(pos: BlockPos): BlockState | null;
  blocks(): Iterable<{ readonly pos: BlockPos; readonly state: BlockState }>;
  onChange?(listener: (change: { readonly pos: BlockPos }) => void): () => void;
}

const BLOCK_PATH = /^msm\/([a-z0-9_.-]+)\/block\/(.+)\.json$/;

/**
 * The ambient sound of each project portal block (ADR 0077): `sounds.ambient`, `false` for none,
 * else the target's portal sound.
 */
export function portalHumsFromFiles(
  files: SimFiles,
  defaultSound: string | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const path of files.keys()) {
    const match = BLOCK_PATH.exec(path);
    if (match === null) continue;
    const definition = readJsonFile(files, path);
    if (!isRecord(definition) || definition.type !== 'portal') continue;
    const sounds = isRecord(definition.sounds) ? definition.sounds : {};
    const ambient = sounds.ambient;
    if (ambient === false) continue;
    const sound = typeof ambient === 'string' && ambient !== '' ? ambient : defaultSound;
    if (sound !== undefined) out.set(`${match[1]}:${match[2]}`, sound);
  }
  return out;
}

const posKey = (pos: BlockPos): string => `${pos.x},${pos.y},${pos.z}`;

/** Portal hums of the test area; see the module comment. */
export class PortalHums {
  private hums: Map<string, string>;
  private readonly defaultSound: string | undefined;
  private readonly random: Random;
  private world: HumWorld | null = null;
  private unsubscribe: (() => void) | null = null;
  private index: Map<string, BlockPos> | null = null;

  constructor(options: { files: SimFiles; defaultSound?: string; seed?: number; random?: Random }) {
    this.defaultSound = options.defaultSound;
    this.hums = portalHumsFromFiles(options.files, this.defaultSound);
    this.random = options.random ?? seededRandom((options.seed ?? 1) ^ 0x51ed);
  }

  /** New lowered files. */
  setFiles(files: SimFiles): void {
    this.hums = portalHumsFromFiles(files, this.defaultSound);
    this.index = null;
  }

  /** One tick: each portal block within range hums about once in {@link PORTAL_HUM_ONE_IN}. */
  tick(world: HumWorld, player: Vec3, play: (effect: SimEffect) => void): void {
    if (this.world !== world) {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.world = world;
      this.index = null;
      if (world.onChange !== undefined) {
        this.unsubscribe = world.onChange(({ pos }) => {
          if (this.index === null) return;
          const state = world.get(pos);
          if (state !== null && this.hums.has(state.name)) this.index.set(posKey(pos), pos);
          else this.index.delete(posKey(pos));
        });
      }
    }
    if (this.hums.size === 0) return;
    if (this.index === null) {
      const index = new Map<string, BlockPos>();
      for (const { pos, state } of world.blocks()) {
        if (this.hums.has(state.name)) index.set(posKey(pos), { x: pos.x, y: pos.y, z: pos.z });
      }
      this.index = index;
    }
    const range2 = AMBIENT_RANGE * AMBIENT_RANGE;
    for (const pos of this.index.values()) {
      const dx = pos.x + 0.5 - player.x;
      const dy = pos.y + 0.5 - player.y;
      const dz = pos.z + 0.5 - player.z;
      if (dx * dx + dy * dy + dz * dz > range2) continue;
      if (Math.floor(this.random() * PORTAL_HUM_ONE_IN) !== 0) continue;
      const state = world.get(pos);
      const sound = state === null ? undefined : this.hums.get(state.name);
      if (sound === undefined || state === null) continue;
      play({
        kind: 'sound',
        id: sound,
        position: { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 },
        volume: 0.5,
        pitch: 0.8 + this.random() * 0.4,
        origin: { elementId: state.name, pointer: '/sounds/ambient' },
      });
    }
  }

  /** Stops following the world. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.world = null;
    this.index = null;
  }
}
