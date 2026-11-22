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
 * - Scripts (B400): with {@link TryItAreaOptions.scripts} the area runs the project's scripts in
 *   the script worker (`script-worker.ts`): each time the lowered scripts change, they are
 *   transpiled by the session's scripting service in main (ADR 0031 D2) and loaded again.
 * - My world generation (B584, ADR 0119 D8): {@link GeneratedGround} asks the terrain worker
 *   (the world map's client and files, `terrain/WorldMap.tsx` `terrainSessionFor`) for a window
 *   of the project's world in its stages (terrain, surface, features), each shown as it arrives,
 *   and makes it again in place after every worldgen edit: the player keeps their place (lifted
 *   out of land that grew over them), mobs stay, and the user's own blocks are laid over the new
 *   land where they still fit (`@msm/sim` `applyEdits`), the rest counted in one line.
 *
 * - Functions (B613, ADR 0120 D8): the Function editor's **Run in Try it** leaves its request in
 *   `function-editor/run-in-tryit.ts`; the area takes it with its next files and runs it at its
 *   next tick (after the load functions, as `/function` after `/reload`; a paused clock steps
 *   once). The chat box's `/function` runs through the source's commands. Vanilla's block and item
 *   tags and predicates are read from the jar cache once the area is made, so `#minecraft:` tags
 *   in functions work ({@link TryItAreaOptions.vanillaData}).
 *
 * Part of the lazy Try it chunk.
 */

import { type Json, type Project, stableStringify } from '@msm/core';
import type { JsonObject, OutputFile, Target } from '@msm/plugin-api';
import {
  applyEdits,
  type BlockState,
  type CompiledScript,
  cutAtTop,
  editKey,
  editsLine,
  type GeneratedWindow,
  GROUND_AIR,
  type GroundBlocks,
  type GroundEdit,
  type GroundKind,
  type GroundLoadResult,
  generatedGround,
  groundState,
  LocalWorldSource,
  liftedFeet,
  type PlayerAction,
  type RuleBookInfo,
  ruleBooksFrom,
  type ScriptApiDescription,
  type ScriptProblem,
  type ScriptRunner,
  SimClock,
  type SimEffect,
  type SimFiles,
  type SimLogLine,
  type SimOrigin,
  sameWindow,
  scriptSources,
  shiftWindow,
  stateKey,
  type TraceKind,
  type WorldEvent,
  windowAround,
  windowCentre,
  worldOf,
} from '@msm/sim';
import {
  type FunctionRunRequest,
  takeFunctionRuns as takeWaitingRuns,
} from '../components/function-editor/run-in-tryit';
import { createVanillaDataReader, type VanillaDataReader } from '../liveviews/vanilla-data';
import type {
  ColumnStage,
  ColumnsData,
  TerrainAnswer,
  TerrainSource,
  Unsupported,
  WorldSpec,
  WorldSummary,
} from '../terrain/client';
import { SET_UP_WORDS } from '../terrain/controls';
import type { TerrainFilesState, WorldgenSession } from '../terrain/files';
import { AmbientParticles } from './ambient';
import { PortalHums, type ReadProjectAsset, type SoundOut, TryItEffects } from './effects';
import { generatedNotes } from './grounds';
import { MobField } from './render/mobs';
import { ParticleField } from './render/particles';
import { createWorkerRunner } from './script-worker';

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
  /** The kinds, when the session has them: the generated ground reads worldgen through them. */
  readonly registry?: WorldgenSession['registry'];
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
  /** For a step of a logic rule run as a script, what the step was (B401 `TraceEntry.ruleStep`). */
  readonly ruleStep?: string;
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
  /** Runs the project's scripts (B400); without it they are said to run only in the game. */
  readonly scripts?: TryItScripts;
  /**
   * Reads vanilla's data files (B613: block, item and entity type tags and predicates for the
   * functions' `#minecraft:` tags and `execute if predicate`). Default: the jar cache through the
   * preload bridge when there is one; `null` reads none.
   */
  readonly vanillaData?: VanillaDataReader | null;
}

/** The vanilla data folders Try it's functions read (B613). */
export const TRY_IT_VANILLA_FOLDERS: readonly string[] = Object.freeze([
  'predicate',
  'tags/block',
  'tags/entity_type',
  'tags/item',
]);

/** The default reader of vanilla data: through the preload bridge, when there is one. */
function defaultVanillaData(mcVersion: string): VanillaDataReader | null {
  const msm = (globalThis as { msm?: unknown }).msm;
  return msm === undefined ? null : createVanillaDataReader({ mcVersion });
}

/** What one transpile gives (the scripting service's `ScriptTranspileOutcome`). */
export type TranspileOutcome =
  | { readonly js: string }
  | { readonly problems: readonly { readonly message: string; readonly line?: number }[] };

/** How an area runs scripts (B400). */
export interface TryItScripts {
  /** The session's scripting service: TypeScript to ES5 in main (ADR 0031 D2). */
  transpile(source: string, name: string): Promise<TranspileOutcome>;
  /** The Script API description (`SCRIPT_API` of `@msm/plugin-scripting`). */
  readonly api: ScriptApiDescription;
  /** `msm.version`. */
  readonly version?: string;
  /** Where they run; default the Web Worker of `script-worker.ts`. */
  readonly runner?: () => ScriptRunner;
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
  private groundText = 'Grid';
  private readonly scripts: TryItScripts | undefined;
  /** The lowered scripts last loaded (ids and sources), so an edit elsewhere reloads nothing. */
  private scriptKey = '';
  private scriptGeneration = 0;
  private disposed = false;
  private loadingGround = false;
  private changedSinceGround = false;
  /** The generated ground's controller (B584), while that ground is in. */
  private generatedNow: GeneratedGround | null = null;
  /** The generated land last filled, without the user's changes, and its window. */
  private generatedLand: { ground: GroundBlocks; window: GeneratedWindow } | null = null;
  /** The user's changes to a generated ground, by world position (`editKey`). */
  private edits = new Map<string, GroundEdit>();
  /** While true, the source's log lines are not written to "What happened" (a quiet refill). */
  private quiet = false;
  /** Run in Try it requests taken, run at the next tick (B613). */
  private pendingRuns: FunctionRunRequest[] = [];
  /** How vanilla's data files are read (B613), and for which version they were last asked. */
  private readonly vanillaReader: ((mcVersion: string) => VanillaDataReader | null) | null;
  private vanillaVersion: string | null = null;

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
      ...(options.scripts === undefined
        ? {}
        : {
            scripts: {
              runner: (options.scripts.runner ?? createWorkerRunner)(),
              api: options.scripts.api,
              ...(options.scripts.version === undefined
                ? {}
                : { version: options.scripts.version }),
            },
          }),
    });
    this.scripts = options.scripts;
    for (const line of this.source.lines) this.addEntry(line, undefined, undefined);
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
    void this.loadScripts(options.files);
    const given = options.vanillaData;
    this.vanillaReader =
      given === null ? null : given === undefined ? defaultVanillaData : () => given;
    void this.loadVanillaData(options.target);
    this.takeFunctionRuns();
  }

  /**
   * Reads vanilla's tags and predicates for the target's version, once per version (B613); the
   * source reads only the project's files until they arrive, or when the folder is not set up.
   */
  loadVanillaData(target: Target = this.targetNow): Promise<void> {
    const version = target.mcVersion;
    if (this.vanillaReader === null || this.vanillaVersion === version) return Promise.resolve();
    this.vanillaVersion = version;
    const reader = this.vanillaReader(version);
    if (reader === null) return Promise.resolve();
    return reader.lookup(TRY_IT_VANILLA_FOLDERS).then(
      (answer) => {
        if (this.disposed || this.vanillaVersion !== version) return;
        this.source.setVanillaData(answer.status === 'ready' ? answer.lookup : undefined);
      },
      () => {
        // A failed read leaves the project's files only; the next version asks again.
        if (this.vanillaVersion === version) this.vanillaVersion = null;
      },
    );
  }

  /**
   * Takes the Function editor's Run in Try it requests (B613): they run at the next tick, after
   * the load functions; a paused clock steps once so they run now.
   */
  takeFunctionRuns(): void {
    const runs = takeWaitingRuns();
    if (runs.length === 0) return;
    this.pendingRuns.push(...runs);
    if (this.clock.paused) this.clock.step();
  }

  /** Runs the requests taken (B613): what they did goes to "What happened". */
  private runPendingFunctions(): void {
    const runs = this.pendingRuns;
    this.pendingRuns = [];
    for (const run of runs) {
      if (run.values === undefined) this.source.runFunction(run.id);
      else this.source.functions.runChatLine(`function ${run.id} ${run.values}`);
    }
    this.changed();
  }

  /**
   * Transpiles and loads the lowered scripts when they changed (B400). Resolves once they are
   * loaded (or nothing changed); a later edit wins over an earlier one still transpiling.
   */
  loadScripts(files: SimFiles = this.filesNow): Promise<void> {
    const scripts = this.scripts;
    if (scripts === undefined) return Promise.resolve();
    const sources = scriptSources(files);
    const key = sources.map((one) => `${one.id}\n${one.source}`).join('\u0000');
    if (key === this.scriptKey) return Promise.resolve();
    this.scriptKey = key;
    const generation = ++this.scriptGeneration;
    return Promise.all(
      sources.map(async (one): Promise<CompiledScript | ScriptProblem> => {
        const book = one.book === undefined ? {} : { book: one.book };
        try {
          const outcome = await scripts.transpile(one.source, one.path);
          if ('js' in outcome) return { id: one.id, path: one.path, js: outcome.js, ...book };
          const first = outcome.problems[0];
          const message =
            first === undefined
              ? 'it could not be transpiled'
              : `${first.line === undefined ? '' : `line ${first.line}: `}${first.message}`;
          return { id: one.id, path: one.path, message, ...book };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { id: one.id, path: one.path, message, ...book };
        }
      }),
    ).then((results) => {
      if (this.disposed || generation !== this.scriptGeneration) return;
      const compiled = results.filter((one): one is CompiledScript => 'js' in one);
      const problems = results.filter((one): one is ScriptProblem => 'message' in one);
      this.source.loadScripts(compiled, problems);
      this.changed();
    });
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
    void this.loadVanillaData(target);
    this.particles.setFiles(files);
    this.ambient.setFiles(files);
    this.effects.setFiles(files);
    this.hums.setFiles(files);
    void this.loadScripts(files);
    this.mobField.setCatalogue(this.source.mobs);
    this.mobField.update(this.source.entities.snapshots());
    this.takeFunctionRuns();
    this.changed();
  }

  /** The ground the area was last loaded with (B405). */
  get ground(): GroundKind {
    return this.source.ground;
  }

  /** The side panel's words for the current ground (`grounds.ts` `describeGround`). */
  get groundDescription(): string {
    return this.groundText;
  }

  /** Whether changing the ground would lose something: a block changed or a mob is out. */
  get hasChanges(): boolean {
    return this.changedSinceGround || this.source.entities.count > 0;
  }

  /**
   * Replaces the area with a ground (B405): the simulation's `loadGround`, then the particles,
   * mobs, chips and captions go. `lines` are written to "What happened" after the ground's own.
   */
  loadGround(
    kind: GroundKind,
    ground: GroundBlocks | undefined,
    description: string,
    lines: readonly string[] = [],
  ): GroundLoadResult {
    if (kind !== 'generated') this.stopGenerated();
    this.loadingGround = true;
    let result: GroundLoadResult;
    try {
      result = this.source.loadGround(kind, ground);
    } finally {
      this.loadingGround = false;
    }
    this.changedSinceGround = false;
    this.groundText = description;
    this.particles.clear();
    this.mobField.clear();
    this.effects.clear();
    for (const line of lines) this.source.log.info(line);
    this.changed();
    return result;
  }

  /** "Clear the area": blocks, mobs, timers and particles go; the clock keeps its speed. */
  clear(): void {
    this.loadingGround = true;
    try {
      this.source.act({ type: 'clear' });
    } finally {
      this.loadingGround = false;
    }
    // A generated ground comes back as the land is now, without the user's changes.
    this.edits.clear();
    if (this.generatedLand !== null) this.applyCells(this.generatedLand.ground);
    this.changedSinceGround = false;
    this.particles.clear();
    this.mobField.clear();
    this.effects.clear();
    this.changed();
  }

  // ---- My world generation (B584) --------------------------------------------------------------

  /** The generated ground's controller while that ground is in, else `null`. */
  get generated(): GeneratedGround | null {
    return this.generatedNow;
  }

  /** The window of the generated land now in the area, or `null`. */
  get generatedWindow(): GeneratedWindow | null {
    return this.generatedLand?.window ?? null;
  }

  /** The user's changes held for the generated ground (placed and broken blocks). */
  get generatedEdits(): readonly GroundEdit[] {
    return [...this.edits.values()];
  }

  /**
   * Starts the generated ground (ADR 0119 D8): the land arrives in stages from the terrain
   * worker through `link`, replacing whatever ground was in. Resolves when its first stage is in
   * the area; rejects when the land cannot be made (the set-up banner's words without the jar).
   */
  useGenerated(
    link: GroundTerrainLink,
    spec: GeneratedSpec,
    hooks: GeneratedHooks = {},
  ): Promise<void> {
    this.stopGenerated();
    const controller = new GeneratedGround(link, spec, {
      ...hooks,
      fill: (land, window, description) => this.fillGenerated(land, window, description),
      playerWorld: () => {
        const window = this.generatedLand?.window;
        const at = this.source.player.position;
        return window === undefined
          ? null
          : { x: at.x + window.x0, y: at.y + window.y0, z: at.z + window.z0 };
      },
      say: (line) => this.source.log.info(line),
      changed: () => this.changed(),
    });
    this.generatedNow = controller;
    return controller.start();
  }

  private stopGenerated(): void {
    this.generatedNow?.dispose();
    this.generatedNow = null;
    this.generatedLand = null;
    this.edits.clear();
  }

  /** Keeps a change the user made to a generated ground, by world position. */
  private recordEdit(pos: { x: number; y: number; z: number }, state: BlockState | null): void {
    const land = this.generatedLand;
    if (land === null) return;
    const at = worldOf(land.window, pos);
    this.edits.set(editKey(at.x, at.y, at.z), {
      ...at,
      state: state === null ? null : stateKey(state),
    });
  }

  /**
   * Puts newly made land in: the first time as a new ground (the player on its surface), for a
   * moved window as a refill with the player kept where they stood in the world, and for the
   * same window cell by cell, so mobs and everything else stay. The user's changes are laid over
   * it where they still fit; returns how many did not and how many are outside the window.
   */
  private fillGenerated(
    land: GroundBlocks,
    window: GeneratedWindow,
    description: string,
  ): { lost: number; outside: number } {
    const before = this.generatedLand;
    const applied = applyEdits(land, window, [...this.edits.values()]);
    this.edits = new Map(applied.kept.map((edit) => [editKey(edit.x, edit.y, edit.z), edit]));
    if (before === null) {
      this.loadGround('generated', applied.ground, description);
    } else if (!sameWindow(before.window, window)) {
      const feet = this.source.player.position;
      const world = worldOf(before.window, feet);
      this.quiet = true;
      try {
        this.loadGround('generated', applied.ground, description);
      } finally {
        this.quiet = false;
      }
      const inside = { x: world.x - window.x0, y: world.y - window.y0, z: world.z - window.z0 };
      const area = this.source.world;
      if (
        inside.x >= 0 &&
        inside.z >= 0 &&
        inside.y >= 0 &&
        inside.x < area.sizeX &&
        inside.z < area.sizeZ &&
        inside.y <= area.sizeY
      ) {
        this.source.player.teleport(liftedFeet(inside, this.solidAt, area.sizeY));
      }
    } else {
      this.applyCells(applied.ground);
      const feet = this.source.player.position;
      const lifted = liftedFeet(feet, this.solidAt, this.source.world.sizeY);
      if (lifted !== feet) this.source.player.teleport(lifted);
    }
    this.generatedLand = { ground: land, window };
    this.groundText = description;
    this.changed();
    return { lost: applied.lost, outside: applied.outside };
  }

  /** Whether the area's cell holds something the player collides with. */
  private readonly solidAt = (x: number, y: number, z: number): boolean => {
    const state = this.source.world.get({ x, y, z });
    return state !== null && this.source.catalogue.collision(state).length > 0;
  };

  /** Sets every cell that differs from `ground` (vanilla states through the catalogue). */
  private applyCells(ground: GroundBlocks): number {
    const world = this.source.world;
    const catalogue = this.source.catalogue;
    const states = ground.palette.map((text, slot): BlockState | null => {
      if (slot === 0) return null;
      const parsed = groundState(text);
      return parsed.name === GROUND_AIR ? null : catalogue.normalise(parsed);
    });
    const keys = states.map((state) => (state === null ? '' : stateKey(state)));
    const { size } = ground;
    let changed = 0;
    this.loadingGround = true;
    try {
      for (let y = 0; y < Math.min(size.y, world.sizeY); y += 1) {
        for (let z = 0; z < Math.min(size.z, world.sizeZ); z += 1) {
          for (let x = 0; x < Math.min(size.x, world.sizeX); x += 1) {
            const slot = ground.blocks[(y * size.z + z) * size.x + x] ?? 0;
            const pos = { x, y, z };
            const have = world.get(pos);
            if ((have === null ? '' : stateKey(have)) === keys[slot]) continue;
            world.set(pos, states[slot] ?? null);
            changed += 1;
          }
        }
      }
    } finally {
      this.loadingGround = false;
    }
    return changed;
  }

  /** Stops everything; the area is not used afterwards. */
  dispose(): void {
    this.disposed = true;
    this.stopGenerated();
    this.stop();
    this.ambient.dispose();
    this.hums.dispose();
    this.source.dispose();
    this.listeners.clear();
  }

  private tick(tick: number): void {
    this.source.tick();
    if (this.pendingRuns.length > 0) this.runPendingFunctions();
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
        if (this.quiet) return;
        // A trace entry is kept before its line is written, so the last one is its own.
        const last = this.source.trace.at(-1);
        const own =
          last !== undefined && last.text === event.line.text && last.origin === event.line.origin;
        this.addEntry(event.line, own ? last.kind : undefined, own ? last.ruleStep : undefined);
        break;
      }
      case 'blockChanged':
        if (!this.loadingGround) {
          this.changedSinceGround = true;
          this.recordEdit(event.pos, event.state);
        }
        // Filling a ground sends tens of thousands; the view hears once at the end.
        if (this.loadingGround) return;
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

  private addEntry(
    line: SimLogLine,
    kind: TraceKind | undefined,
    ruleStep: string | undefined,
  ): void {
    this.entrySerial += 1;
    this.entries.push({
      serial: this.entrySerial,
      tick: line.tick,
      text: line.text,
      kind: kind ?? (line.onlyInMinecraft ? 'onlyInMinecraft' : 'info'),
      ...(line.origin === undefined ? {} : { origin: line.origin }),
      ...(ruleStep === undefined ? {} : { ruleStep }),
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

// ---- My world generation (B584, ADR 0119 D8) ---------------------------------------------------

/**
 * The part of the session's live world generation the ground uses (`terrain/WorldMap.tsx`
 * `TerrainSessionHandle`): the worker client the map uses too, and the project's files.
 */
export interface GroundTerrainLink {
  readonly client: {
    setWorld(spec: WorldSpec, filesHash: string, vanillaKey: string | null): Promise<WorldSummary>;
    sample(
      lane: string,
      query: {
        type: 'heights' | 'columns';
        region:
          | GeneratedWindow
          | { x0: number; z0: number; width: number; depth: number; step: number };
        fn?: string;
        stage?: ColumnStage;
      },
    ): Promise<TerrainAnswer | null>;
    cancel(lane: string): void;
  };
  subscribe(listener: () => void): () => void;
  getSnapshot(): { readonly state: TerrainFilesState | null; readonly error: string | null };
  /** `performance.now()` of the last project change, for the edit-to-land time. */
  changedAt?(): number | null;
}

/** What the generated ground is cut from. */
export interface GeneratedSpec {
  readonly source: TerrainSource;
  /** The seed as typed (shared with the world map). */
  readonly seed: string;
  /** The block the window is centred on. */
  readonly centre: { readonly x: number; readonly z: number };
  /** The world's name, for the side panel. */
  readonly label: string;
  /** The element that makes the world (Show on the map opens it). */
  readonly elementId: string;
}

/** What the view adds to a generated ground. */
export interface GeneratedHooks {
  /**
   * Called with the palette before each stage goes in, so Minecraft's block states of its props
   * are read first (`TryItView` `loadVanillaStates`).
   */
  readonly beforeFill?: (palette: readonly string[]) => Promise<void>;
  /** Clock for the stage times (default `performance.now`). */
  readonly now?: () => number;
  /** Waits before asking again when another view's world replaced the ground's (tests: 0). */
  readonly retryMs?: number;
}

/** The ground's stages, in the order they arrive. */
export const GENERATED_STAGES: readonly ColumnStage[] = ['terrain', 'surface', 'features'];

/** The lane the ground asks the worker in. */
export const GROUND_LANE = 'ground';

/** How often a run asks again after another view replaced the world in the shared worker. */
export const GROUND_RETRIES = 4;

/** Where a generated ground is. */
export type GeneratedStatus = 'waiting' | 'drawing' | 'ready' | 'needsSetUp' | 'error';

/** Why the land is being made. */
export type GeneratedReason = 'new' | 'edit' | 'move' | 'seed';

/** What the side panel shows of a generated ground. */
export interface GeneratedGroundState {
  readonly status: GeneratedStatus;
  /** The last stage in the area. */
  readonly stage: ColumnStage | null;
  /** The stage being asked for, while drawing. */
  readonly asking: ColumnStage | null;
  readonly reason: GeneratedReason;
  readonly window: GeneratedWindow | null;
  readonly summary: WorldSummary | null;
  /** What the ground draws about right and leaves out, in plain words. */
  readonly notes: readonly string[];
  readonly error: string | null;
  /** Milliseconds from the start of the last full run to each stage being in the area. */
  readonly times: Readonly<Partial<Record<ColumnStage, number>>>;
  /** From the project change to the new land being in the area, for the last edit. */
  readonly editMs: number | null;
  /** Runs finished (any reason). */
  readonly runs: number;
}

interface WindowPlan {
  readonly kind: 'keep' | 'centre' | 'shift';
  readonly centre?: { readonly x: number; readonly z: number };
  readonly dy?: number;
}

/** What the area gives its generated ground (`TryItArea.useGenerated`). */
interface GeneratedPorts extends GeneratedHooks {
  fill(
    land: GroundBlocks,
    window: GeneratedWindow,
    description: string,
  ): { lost: number; outside: number };
  playerWorld(): { x: number; y: number; z: number } | null;
  say(line: string): void;
  changed(): void;
}

/** Whether a world misses a vanilla file (the set-up banner's case, as the map decides it). */
function needsVanillaFile(summary: WorldSummary): boolean {
  return summary.unsupported.some(
    (part) => part.kind === 'file' && /(^|\/)minecraft:/.test(part.type),
  );
}

type JsonRecord = Record<string, unknown>;
const isObject = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The dimension JSON a source names in the project's files, or `null`. */
function dimensionOf(state: TerrainFilesState, source: TerrainSource): JsonRecord | null {
  if ('preset' in source) {
    const preset = state.project['worldgen/world_preset']?.[source.preset];
    const dimensions = isObject(preset) && isObject(preset.dimensions) ? preset.dimensions : {};
    const json = dimensions[source.dimension];
    return isObject(json) ? json : null;
  }
  const json = state.project.dimension?.[source.dimension];
  return isObject(json) ? json : null;
}

function biomeSourceType(dimension: JsonRecord | null): string {
  const generator = isObject(dimension?.generator) ? dimension.generator : {};
  const biomeSource = isObject(generator.biome_source) ? generator.biome_source : {};
  const type = typeof biomeSource.type === 'string' ? biomeSource.type : '';
  return type.includes(':') ? type : `minecraft:${type}`;
}

/**
 * One generated ground: asks the worker for its window stage by stage, puts each stage in the
 * area as it arrives, and makes the land again after an edit (one pass, the features stage, so
 * nothing flickers), a new seed or a moved window. A newer run replaces an older one; a run whose
 * world another view replaced in the shared worker asks again a few times.
 */
export class GeneratedGround {
  readonly spec: GeneratedSpec;
  readonly #link: GroundTerrainLink;
  readonly #ports: GeneratedPorts;
  readonly #now: () => number;
  readonly #unsubscribe: () => void;
  #seed: string;
  #state: GeneratedGroundState;
  #generation = 0;
  #filesHash: string | null = null;
  #columnNotes: readonly Unsupported[] = [];
  #cutTop = false;
  #disposed = false;
  #first: { resolve: () => void; reject: (error: Error) => void } | null = null;

  constructor(link: GroundTerrainLink, spec: GeneratedSpec, ports: GeneratedPorts) {
    this.#link = link;
    this.spec = spec;
    this.#ports = ports;
    this.#seed = spec.seed;
    this.#now = ports.now ?? (() => performance.now());
    this.#state = {
      status: 'waiting',
      stage: null,
      asking: null,
      reason: 'new',
      window: null,
      summary: null,
      notes: [],
      error: null,
      times: {},
      editMs: null,
      runs: 0,
    };
    this.#unsubscribe = link.subscribe(() => this.#filesChanged());
  }

  /** What the side panel shows. */
  get state(): GeneratedGroundState {
    return this.#state;
  }

  /** The seed now. */
  get seed(): string {
    return this.#seed;
  }

  /** Makes the land the first time; see `TryItArea.useGenerated`. */
  start(): Promise<void> {
    const first = new Promise<void>((resolve, reject) => {
      this.#first = { resolve, reject };
    });
    void this.#run('new', { kind: 'centre', centre: this.spec.centre });
    return first;
  }

  /** Move up (`dy > 0`) or Move down: the window shifts, the land comes again. */
  move(dy: number): Promise<void> {
    return this.#run('move', { kind: 'shift', dy });
  }

  /** Make the land around me: the window is centred on the player again. */
  aroundPlayer(): Promise<void> {
    const at = this.#ports.playerWorld();
    if (at === null) return Promise.resolve();
    return this.#run('move', {
      kind: 'centre',
      centre: { x: Math.floor(at.x), z: Math.floor(at.z) },
    });
  }

  /** A new seed (typed in the map or the picker): the land comes again around the same place. */
  setSeed(seed: string): Promise<void> {
    if (seed === this.#seed) return Promise.resolve();
    this.#seed = seed;
    const window = this.#state.window;
    return this.#run(
      'seed',
      window === null
        ? { kind: 'centre', centre: this.spec.centre }
        : { kind: 'centre', centre: windowCentre(window) },
    );
  }

  /** Stops following the project; work asked is dropped. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#unsubscribe();
    this.#link.client.cancel(GROUND_LANE);
    this.#first?.reject(new Error('The ground was replaced.'));
    this.#first = null;
  }

  #set(patch: Partial<GeneratedGroundState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#ports.changed();
  }

  #filesChanged(): void {
    if (this.#disposed) return;
    const state = this.#link.getSnapshot().state;
    if (state === null || state.filesHash === this.#filesHash) return;
    if (this.#state.window === null) {
      // Still waiting for the first files (or the first run failed on them): start again.
      if (this.#state.status === 'waiting' || this.#state.status === 'needsSetUp') {
        void this.#run('new', { kind: 'centre', centre: this.spec.centre });
      }
      return;
    }
    void this.#run('edit', { kind: 'keep' });
  }

  #notes(state: TerrainFilesState, summary: WorldSummary | null): string[] {
    const dimension = dimensionOf(state, this.spec.source);
    const end =
      this.spec.source.dimension.replace(/^minecraft:/, '') === 'the_end' ||
      biomeSourceType(dimension) === 'minecraft:the_end';
    return generatedNotes({
      facts: state.facts,
      summary,
      end,
      climate: biomeSourceType(dimension) === 'minecraft:multi_noise',
      columnNotes: this.#columnNotes,
      cutAtTop: this.#cutTop,
      problems: state.problems,
    });
  }

  #fail(status: 'needsSetUp' | 'error', error: string): void {
    this.#set({ status, asking: null, error });
    this.#first?.reject(new Error(error));
    this.#first = null;
  }

  async #run(reason: GeneratedReason, plan: WindowPlan, retry = 0): Promise<void> {
    if (this.#disposed) return;
    const generation = ++this.#generation;
    const live = (): boolean => !this.#disposed && generation === this.#generation;
    const started = this.#now();
    const changedAt = reason === 'edit' ? (this.#link.changedAt?.() ?? null) : null;
    const { state, error } = this.#link.getSnapshot();
    if (state === null) {
      if (error !== null)
        this.#fail('error', `The project's world files could not be read: ${error}`);
      else this.#set({ status: 'waiting', reason });
      return;
    }
    this.#filesHash = state.filesHash;
    this.#set({ status: 'drawing', reason, error: null });
    const client = this.#link.client;
    // Asked again later when another view's world replaced this one in the shared worker.
    const again = async (): Promise<void> => {
      if (!live()) return;
      if (retry >= GROUND_RETRIES) {
        this.#fail('error', 'The land could not be made: the worker was busy with another world.');
        return;
      }
      await new Promise((done) => setTimeout(done, this.#ports.retryMs ?? 250));
      if (live()) await this.#run(reason, plan, retry + 1);
    };
    let summary: WorldSummary;
    try {
      summary = await client.setWorld(
        {
          files: { vanilla: state.vanilla, project: state.project },
          source: this.spec.source,
          seed: this.#seed,
          facts: state.facts,
        },
        state.filesHash,
        state.vanillaKey,
      );
    } catch (failure) {
      if (!live()) return;
      if (failure instanceof Error && /newer world replaced/.test(failure.message)) {
        await again();
        return;
      }
      this.#fail(
        'error',
        `The land could not be made: ${failure instanceof Error ? failure.message : String(failure)}`,
      );
      return;
    }
    if (!live()) return;
    if (state.needsSetUp && needsVanillaFile(summary)) {
      this.#set({ summary, notes: this.#notes(state, summary) });
      this.#fail('needsSetUp', SET_UP_WORDS);
      return;
    }
    // The window.
    const heights = { minY: summary.minY, height: summary.height, seaLevel: summary.seaLevel };
    const before = this.#state.window;
    let window: GeneratedWindow;
    if (plan.kind === 'shift' && before !== null) {
      window = shiftWindow(before, plan.dy ?? 0, heights);
    } else if (plan.kind === 'keep' && before !== null) {
      window = shiftWindow(before, 0, heights);
    } else {
      const centre = plan.centre ?? this.spec.centre;
      const asked = await client.sample(GROUND_LANE, {
        type: 'heights',
        region: { x0: centre.x, z0: centre.z, width: 1, depth: 1, step: 1 },
        fn: 'surface',
      });
      if (!live()) return;
      if (asked === null) {
        await again();
        return;
      }
      const found = (asked.data as Int16Array)[0];
      // Over the sea the window is placed by the water's top, so the player stands at its edge.
      const surface = found === undefined ? null : Math.max(found, summary.seaLevel);
      window = windowAround(centre, surface, heights);
    }
    const stages: readonly ColumnStage[] =
      reason === 'edit' && sameWindow(before, window) ? ['features'] : GENERATED_STAGES;
    const times: Partial<Record<ColumnStage, number>> = reason === 'edit' ? this.#state.times : {};
    let lost = 0;
    let outside = 0;
    for (const stage of stages) {
      this.#set({ asking: stage, summary });
      const answer = await client.sample(GROUND_LANE, { type: 'columns', region: window, stage });
      if (!live()) return;
      if (answer === null) {
        await again();
        return;
      }
      const columns = answer.data as ColumnsData;
      const land = generatedGround(columns);
      await this.#ports.beforeFill?.(land.palette);
      if (!live()) return;
      this.#columnNotes = columns.notes;
      this.#cutTop = cutAtTop(land);
      const result = this.#ports.fill(land, window, `${this.spec.label}, seed ${this.#seed}`);
      lost += result.lost;
      outside = result.outside;
      const at = this.#now();
      if (reason !== 'edit') times[stage] = Math.round(at - started);
      this.#set({
        stage,
        window,
        times: { ...times },
        notes: this.#notes(state, summary),
        ...(reason === 'edit' && changedAt !== null ? { editMs: Math.round(at - changedAt) } : {}),
      });
      this.#first?.resolve();
      this.#first = null;
    }
    const line = editsLine(lost, reason === 'move' ? outside : 0);
    if (line !== null) this.#ports.say(line);
    this.#set({ status: 'ready', asking: null, runs: this.#state.runs + 1 });
  }
}
