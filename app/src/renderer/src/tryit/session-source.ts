/**
 * Try it's link to the open project (ADR 0085 D3, D4; B390).
 *
 * - {@link SessionFiles} lowers the expanded project for the current target through the session
 *   (`lowerExpandedProject`, B371), debounced after each edit, and hands on `SimFiles`. When a
 *   lowering gives the same files as before, the same map is kept, so nothing downstream
 *   re-prepares (the renderer, particles and catalogues compare by identity); a changed project
 *   picture makes a new map through {@link SessionFiles.bump}.
 * - {@link TryItArea} is one test area: the `LocalWorldSource` of `@msm/sim` with the view's
 *   particle field, ambient particles, mob field and clock, wired in the order the plan's notes
 *   give. It outlives the view (switching to a Studio and back keeps it; ADR 0085 D13).
 *
 * Part of the lazy Try it chunk.
 */

import { type Project, stableStringify } from '@msm/core';
import type { OutputFile, Target } from '@msm/plugin-api';
import {
  LocalWorldSource,
  type PlayerAction,
  SimClock,
  type SimFiles,
  type SimLogLine,
  type WorldEvent,
} from '@msm/sim';
import { AmbientParticles } from './ambient';
import { MobField } from './render/mobs';
import { ParticleField } from './render/particles';

/** How long after an edit the project is lowered again. */
export const LOWER_DEBOUNCE_MS = 300;

/** The lowered output files as the simulation reads them: JSON as text, bytes as bytes. */
export function toSimFiles(files: readonly OutputFile[]): Map<string, string | Uint8Array> {
  const out = new Map<string, string | Uint8Array>();
  for (const file of files) {
    out.set(
      file.path,
      file.contents instanceof Uint8Array ? file.contents : stableStringify(file.contents),
    );
  }
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Whether two sets of files hold the same paths with the same contents. */
export function sameFiles(a: SimFiles, b: SimFiles): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [path, value] of a) {
    const other = b.get(path);
    if (other === undefined) return false;
    if (typeof value === 'string' || typeof other === 'string') {
      if (value !== other) return false;
    } else if (!sameBytes(value, other)) {
      return false;
    }
  }
  return true;
}

/** The part of the project session Try it lowers through. */
export interface LoweringSession {
  readonly snapshot: { readonly project: Project | null };
  subscribe(listener: (snapshot: { readonly project: Project | null }) => void): () => void;
  lowerExpandedProject(): Promise<{ files: OutputFile[] }>;
  readonly target: Target;
}

/** What {@link SessionFiles} hands on. */
export interface LoweredFiles {
  readonly files: SimFiles;
  readonly target: Target;
}

/** Options of {@link SessionFiles}. */
export interface SessionFilesOptions {
  /** Called with each new set of files (not when a lowering gives the same files). */
  onFiles(lowered: LoweredFiles): void;
  /** Called when a lowering fails. */
  onError?(error: unknown): void;
  /** Default {@link LOWER_DEBOUNCE_MS}. */
  debounceMs?: number;
}

/** Lowers the open project for Try it; see the module comment. */
export class SessionFiles {
  private readonly session: LoweringSession;
  private readonly options: SessionFilesOptions;
  private current: LoweredFiles | null = null;
  private project: Project | null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(session: LoweringSession, options: SessionFilesOptions) {
    this.session = session;
    this.options = options;
    this.project = session.snapshot.project;
    this.unsubscribe = session.subscribe((snapshot) => {
      if (snapshot.project === this.project) return;
      this.project = snapshot.project;
      this.schedule();
    });
  }

  /** The last files handed on, or `null` before the first lowering finished. */
  get files(): LoweredFiles | null {
    return this.current;
  }

  /** Lowers now (the first time, and after a picture changed with {@link bump}). */
  async lowerNow(): Promise<LoweredFiles | null> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const generation = ++this.generation;
    if (this.session.snapshot.project === null) return this.current;
    try {
      const lowered = await this.session.lowerExpandedProject();
      if (this.disposed || generation !== this.generation) return this.current;
      const target = this.session.target;
      const files = toSimFiles(lowered.files);
      const before = this.current;
      if (before !== null && before.target === target && sameFiles(before.files, files)) {
        return before;
      }
      this.current = { files, target };
      this.options.onFiles(this.current);
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.options.onError?.(error);
    }
    return this.current;
  }

  /**
   * A project picture changed (the lowered files may be the same): hands on a copy of the files,
   * so the view reads its pictures again.
   */
  bump(): void {
    if (this.current === null) return;
    this.current = { files: new Map(this.current.files), target: this.current.target };
    this.options.onFiles(this.current);
  }

  private schedule(): void {
    if (this.disposed) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.lowerNow();
    }, this.options.debounceMs ?? LOWER_DEBOUNCE_MS);
  }

  /** Stops following the session. */
  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.unsubscribe();
  }
}

/** How often, in ticks, the view hears about a tick when nothing else changed. */
export const READOUT_EVERY_TICKS = 5;

/** Options of {@link TryItArea}. */
export interface TryItAreaOptions {
  readonly files: SimFiles;
  readonly target: Target;
  /** Vanilla block state definitions for props (`minecraft:` ids). */
  readonly vanillaBlockstates?: ReadonlyMap<string, string>;
  /** The seed of the mobs and the ambient particles; fixed per area. Default 1. */
  readonly seed?: number;
}

/**
 * One Try it test area: the simulation and the view's moving parts. Each `SimClock` tick runs,
 * in this order: the source's tick (the player, the mobs into the mob field, the timers), the
 * ambient particles near the player, then the particle field.
 */
export class TryItArea {
  readonly source: LocalWorldSource;
  readonly particles: ParticleField;
  readonly ambient: AmbientParticles;
  readonly mobField: MobField;
  readonly clock: SimClock;
  private filesNow: SimFiles;
  private targetNow: Target;
  private readonly listeners = new Set<() => void>();
  private notifyQueued = false;
  private versionCount = 0;
  private readonly stop: () => void;

  constructor(options: TryItAreaOptions) {
    this.filesNow = options.files;
    this.targetNow = options.target;
    const seed = options.seed ?? 1;
    this.source = new LocalWorldSource({
      files: options.files,
      target: options.target,
      seed,
      ...(options.vanillaBlockstates === undefined
        ? {}
        : { vanillaBlockstates: options.vanillaBlockstates }),
    });
    const log = this.source.log;
    this.particles = new ParticleField({ files: options.files, target: options.target, log });
    const portal = options.target.blocks?.portal?.particle;
    this.ambient = new AmbientParticles({
      files: options.files,
      seed,
      ...(portal === undefined ? {} : { defaultPortalParticle: portal }),
    });
    this.mobField = new MobField({ catalogue: this.source.mobs, log });
    this.clock = new SimClock((tick) => this.tick(tick));
    this.stop = this.source.subscribe((event) => this.onEvent(event));
  }

  /** The current files. */
  get files(): SimFiles {
    return this.filesNow;
  }

  /** The current target. */
  get target(): Target {
    return this.targetNow;
  }

  /** Grows on every change the view shows (blocks, mobs, log lines, every few ticks). */
  get version(): number {
    return this.versionCount;
  }

  /** The log lines, oldest first. */
  get lines(): readonly SimLogLine[] {
    return this.source.lines;
  }

  /** Listens for changes the view shows; returns a function that stops it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Sends a player action in. */
  act(action: PlayerAction): void {
    if (action.type === 'clear') {
      this.clear();
      return;
    }
    this.source.act(action);
    // A spawn or a hit shows at once, also while the clock is paused.
    if (action.type !== 'move') this.mobField.update(this.source.entities.snapshots());
  }

  /** New files or target after an edit: the world, the mobs and the particles stay. */
  setFiles(
    files: SimFiles,
    target: Target = this.targetNow,
    vanillaBlockstates?: ReadonlyMap<string, string>,
  ): void {
    this.filesNow = files;
    this.targetNow = target;
    this.source.setFiles(files, target, vanillaBlockstates);
    this.particles.setFiles(files);
    this.ambient.setFiles(files);
    this.mobField.setCatalogue(this.source.mobs);
    this.mobField.update(this.source.entities.snapshots());
    this.changed();
  }

  /** "Clear the area": blocks, mobs, timers and particles go; the clock keeps its speed. */
  clear(): void {
    this.source.act({ type: 'clear' });
    this.particles.clear();
    this.mobField.clear();
    this.changed();
  }

  /** Stops everything; the area is not used afterwards. */
  dispose(): void {
    this.stop();
    this.ambient.dispose();
    this.source.dispose();
    this.listeners.clear();
  }

  private tick(tick: number): void {
    this.source.tick();
    this.ambient.tick({
      world: this.source.world,
      player: this.source.player.position,
      sink: this.particles.sink,
    });
    this.particles.tick();
    if (tick % READOUT_EVERY_TICKS === 0 || this.clock.paused) this.changed();
  }

  private onEvent(event: WorldEvent): void {
    if (event.type === 'entities') {
      this.mobField.update(event.entities);
      return;
    }
    this.changed();
  }

  /** Tells the listeners once per task, however many changes came. */
  private changed(): void {
    this.versionCount += 1;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const listener of [...this.listeners]) listener();
    });
  }
}
