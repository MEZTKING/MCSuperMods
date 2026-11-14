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
 * - The source's `effect` events (B398) go to the particle field (`particle`), the chips and
 *   captions of `effects.ts` (`chip`, `sound`) and the mob field (`animation`). Portal blocks
 *   hum near the player. Every log line becomes a "What happened" entry with the kind of the
 *   trace entry that wrote it ({@link WhatHappenedEntry}).
 *
 * Part of the lazy Try it chunk.
 */

import { type Json, type Project, stableStringify } from '@msm/core';
import type { JsonObject, OutputFile, Target } from '@msm/plugin-api';
import {
  LocalWorldSource,
  type PlayerAction,
  type RuleBookInfo,
  ruleBooksFrom,
  SimClock,
  type SimEffect,
  type SimFiles,
  type SimLogLine,
  type SimOrigin,
  type TraceKind,
  type WorldEvent,
} from '@msm/sim';
import { AmbientParticles } from './ambient';
import { PortalHums, type ReadProjectAsset, type SoundOut, TryItEffects } from './effects';
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

/** The kind of rule book element (`msm:rules`, ADR 0082). */
export const RULE_BOOK_KIND = 'msm:rules';

/** The project's rule books as the simulation names rules by them (B396 `ruleBooksFrom`). */
export function ruleBooksOf(project: Project | null): RuleBookInfo[] {
  const books: { id: string; data: Json }[] = [];
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements) {
      if (element.kind === RULE_BOOK_KIND) books.push({ id: element.id, data: element.data });
    }
  }
  return ruleBooksFrom(books);
}

/** What one "What happened" line is (ADR 0085 D8): a trace entry's kind, or a plain line. */
export type WhatHappenedKind = TraceKind | 'info';

/** One line of the "What happened" panel. */
export interface WhatHappenedEntry {
  /** Grows by one per line; a stable key. */
  readonly serial: number;
  readonly tick: number;
  readonly text: string;
  readonly kind: WhatHappenedKind;
  readonly origin?: SimOrigin;
}

/** The most lines the panel keeps. */
export const WHAT_HAPPENED_LIMIT = 200;

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
  /** Reads project assets the lowered files do not hold (sound files). */
  readonly readProjectAsset?: ReadProjectAsset;
  /** Plays project sounds; absent or `null` shows captions only (tests). */
  readonly audio?: SoundOut | null;
  /** The project's rule books (B396), so plain rules are named by key. */
  readonly ruleBooks?: readonly RuleBookInfo[];
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
  /** Chips and sound captions (B398). */
  readonly effects: TryItEffects;
  /** Portal blocks' ambient sounds (B398). */
  readonly hums: PortalHums;
  private entries: WhatHappenedEntry[] = [];
  private entrySerial = 0;
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
      ...(options.ruleBooks === undefined ? {} : { ruleBooks: options.ruleBooks }),
    });
    for (const line of this.source.lines) this.addEntry(line, undefined);
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
    this.effects = new TryItEffects({
      files: options.files,
      now: () => this.source.ticksRun,
      listener: () => this.source.player.eyePosition(1),
      ...(options.readProjectAsset === undefined
        ? {}
        : { readProjectAsset: options.readProjectAsset }),
      audio: options.audio ?? null,
    });
    const hum = options.target.blocks?.portal?.ambientSound;
    this.hums = new PortalHums({
      files: options.files,
      seed,
      ...(hum === undefined ? {} : { defaultSound: hum }),
    });
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

  /** The "What happened" lines, oldest first (B398). */
  get whatHappened(): readonly WhatHappenedEntry[] {
    return this.entries;
  }

  /** Whether every chance comes up ("Run every time", B396 `always`). */
  get runEveryTime(): boolean {
    return this.source.chance === 'always';
  }

  /** "Run every time": `always`, else chances are drawn (`random`). */
  setRunEveryTime(on: boolean): void {
    this.source.setChanceMode(on ? 'always' : 'random');
    this.changed();
  }

  /** The project's rule books changed (names, keys). */
  setRuleBooks(books: readonly RuleBookInfo[]): void {
    this.source.setRuleBooks(books);
  }

  /** Closes the open container or machine screen (fires its `on_close`). */
  closeScreen(): void {
    this.source.closeScreen();
    this.changed();
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
    if (action.type !== 'move') {
      this.mobField.update(this.source.entities.snapshots());
      // A screen may have opened without a log line.
      this.changed();
    }
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
    this.effects.setFiles(files);
    this.hums.setFiles(files);
    this.mobField.setCatalogue(this.source.mobs);
    this.mobField.update(this.source.entities.snapshots());
    this.changed();
  }

  /** "Clear the area": blocks, mobs, timers and particles go; the clock keeps its speed. */
  clear(): void {
    this.source.act({ type: 'clear' });
    this.particles.clear();
    this.mobField.clear();
    this.effects.clear();
    this.changed();
  }

  /** Stops everything; the area is not used afterwards. */
  dispose(): void {
    this.stop();
    this.ambient.dispose();
    this.hums.dispose();
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
    this.hums.tick(this.source.world, this.source.player.eyePosition(1), (effect) =>
      this.effects.sound(effect),
    );
    const before = this.effects.revision;
    this.effects.tick();
    if (tick % READOUT_EVERY_TICKS === 0 || this.clock.paused || this.effects.revision !== before) {
      this.changed();
    }
  }

  private onEvent(event: WorldEvent): void {
    switch (event.type) {
      case 'entities':
        this.mobField.update(event.entities);
        return;
      case 'effect':
        this.onEffect(event.effect);
        break;
      case 'log': {
        // A trace entry is kept before its line is written, so the last one is its own.
        const last = this.source.trace.at(-1);
        const own =
          last !== undefined && last.text === event.line.text && last.origin === event.line.origin;
        this.addEntry(event.line, own ? last.kind : undefined);
        break;
      }
      case 'blockChanged':
        break;
    }
    this.changed();
  }

  /** Shows an effect of the simulation (B396's `effect` events). */
  private onEffect(effect: SimEffect): void {
    switch (effect.kind) {
      case 'particle': {
        const at = effect.position ?? this.source.player.eyePosition(1);
        const velocity = effect.velocity ?? { x: 0, y: 0, z: 0 };
        this.particles.emit(
          (effect.options as JsonObject | undefined) ?? effect.id,
          { x: at.x, y: at.y, z: at.z, xd: velocity.x, yd: velocity.y, zd: velocity.z },
          effect.origin,
        );
        return;
      }
      case 'sound':
        this.effects.sound(effect);
        return;
      case 'chip':
        this.effects.chip(effect);
        return;
      case 'animation':
        if (typeof effect.target === 'number') {
          this.mobField.playOnce(effect.target, effect.id, effect.controller);
        }
        return;
    }
  }

  private addEntry(line: SimLogLine, kind: TraceKind | undefined): void {
    this.entrySerial += 1;
    this.entries.push({
      serial: this.entrySerial,
      tick: line.tick,
      text: line.text,
      kind: kind ?? (line.onlyInMinecraft ? 'onlyInMinecraft' : 'info'),
      ...(line.origin === undefined ? {} : { origin: line.origin }),
    });
    if (this.entries.length > WHAT_HAPPENED_LIMIT) {
      this.entries.splice(0, this.entries.length - WHAT_HAPPENED_LIMIT);
    }
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
