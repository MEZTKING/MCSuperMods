/**
 * The showcase's clip player (ADR 0118 D5, B566): one Try it area (`TryItArea`) built from an
 * example's lowered files, stepped by the clip's script one simulation tick at a time.
 *
 * - The area's clock is paused; each tick is the steps due, the held `move` (with the held
 *   `look`), then `clock.step()` (B565). Time is the clip's own ticks, never the wall clock:
 *   {@link ClipPlayer.advance} turns a frame's elapsed time into whole ticks, never skipping one,
 *   so a slow machine plays a clip more slowly but never differently.
 * - Silent: the area has no sound output, so sounds become captions only (B565 Z13).
 * - Chances use "Run every time".
 * - With scripts, nothing runs before they have loaded (`area.source.scripts.loaded`, B565 Z9).
 * - No reach check is needed (B565 Z6): the player is put at the clip's `player` once, at setup.
 * - At the end the area is cleared (the ground comes back), the setup is put in place again and
 *   the clip starts over; {@link ClipPlayer.loops} grows, so the view can show the still while
 *   the one rebuild of the restart is drawn (76–505 ms, B565 Z3).
 * - A `generated` ground (B588, ADR 0119 D12) is Try it's "My world generation" over the
 *   example's own world files (`TryItArea.useGenerated` with a link over the lowered files, no
 *   vanilla file): the land arrives in its three stages from the showcase's own terrain worker
 *   ({@link showcaseTerrainClient}; one clip plays at a time), then, with the ground's `bottom`,
 *   the window moves to it. Nothing is set up or stepped before the land is in full
 *   ({@link ClipPlayer.ready}); the view keeps the still over the picture meanwhile.
 *
 * Part of the showcase's lazy chunk (it builds a Try it area).
 *
 * @packageDocumentation
 */

import {
  flatGround,
  type GroundBlocks,
  groundState,
  type PlayerAction,
  quickWorld,
  scriptSources,
} from '@msm/sim';
import { hashText, stableKey, TerrainClient, type WorldgenFileMap } from '../terrain/client';
import { additionAndId, factsOf, folderAndId, type TerrainFilesState } from '../terrain/files';
import type { CameraPose } from '../tryit/render/camera';
import {
  type GeneratedSpec,
  type GroundTerrainLink,
  TryItArea,
  type TryItScripts,
  type WhatHappenedEntry,
} from '../tryit/session-source';
import { driverCamera } from '../tryit/vehicles/camera';
import { cameraAt, lookAt } from './camera-path';
import {
  type ClipAction,
  type ClipCaption,
  type ClipExpect,
  type ClipGeneratedGround,
  type ClipPoint,
  clipId,
  clipIdOf,
  type ShowcaseClip,
} from './clip';
import type { ExampleFiles } from './example-files';

/** Milliseconds of one simulation tick. */
export const TICK_MS = 50;
/** The most ticks one frame may run (a long frame catches up over the next ones). */
export const MAX_TICKS_PER_FRAME = 3;
/** How long {@link ClipPlayer.advance} waits for the scripts before playing without them. */
export const SCRIPT_WAIT_MS = 10_000;
/** Where on a face a clip's player points. */
const HIT = Object.freeze({ x: 0.5, y: 1, z: 0.5 });
/** How high above a followed mob's feet the camera looks. */
const FOLLOW_LOOK_HEIGHT = 0.6;

/** Options of {@link ClipPlayer}. */
export interface ClipPlayerOptions {
  readonly clip: ShowcaseClip;
  readonly example: ExampleFiles;
  /** Runs the example's scripts; without it scripts are said to run only in the game. */
  readonly scripts?: TryItScripts;
  /** Vanilla block state definitions for props (from the user's extracted jar). */
  readonly vanillaBlockstates?: ReadonlyMap<string, string>;
  /** The area's seed (mobs, ambient particles). Default 1. */
  readonly seed?: number;
  /**
   * The terrain worker's client for a `generated` ground; default {@link showcaseTerrainClient}
   * (tests pass one over the engine in their own thread).
   */
  readonly terrain?: GroundTerrainLink['client'];
}

/** What one step did in the current loop. */
export interface ClipStepRecord {
  /** The step's place in `clip.steps`. */
  readonly index: number;
  readonly tick: number;
  /** "What happened" lines written while the step ran. */
  readonly lines: readonly string[];
}

/** A "What happened" line with the clip tick it was seen at. */
interface SeenLine {
  readonly tick: number;
  readonly entry: WhatHappenedEntry;
}

interface PendingLine {
  readonly index: number;
  readonly tick: number;
  readonly expect: Extract<ClipExpect, { line: string }>;
}

/** A clip playing in its own Try it area. */
export class ClipPlayer {
  readonly clip: ShowcaseClip;
  readonly area: TryItArea;
  private tickNow = 0;
  private loopCount = 0;
  private carry = 0;
  private waitedMs = 0;
  private gaveUpWaiting = false;
  private look = { yaw: 0, pitch: 0 };
  private held = { forward: 0, strafe: 0, jump: false, sneak: false };
  private seenNow: SeenLine[] = [];
  private lastSerial = 0;
  private pending: PendingLine[] = [];
  private recordsNow: ClipStepRecord[] = [];
  private problemsNow: string[] = [];
  private followed: { position: ClipPoint; previous: ClipPoint } | null = null;
  private readonly needsScripts: boolean;
  /** A generated ground's setup waits for the land (B588). */
  private setUpWaiting = false;
  /** A generated ground with a `bottom` has moved its window there. */
  private moved = false;
  private readonly readyChecks = new Set<() => void>();
  /** Why a generated ground could not be made, once it is known (ADR 0128 D3). */
  private landProblem: string | null = null;

  constructor(options: ClipPlayerOptions) {
    this.clip = options.clip;
    const { example } = options;
    this.area = new TryItArea({
      files: example.files,
      target: example.target,
      seed: options.seed ?? 1,
      ruleBooks: example.ruleBooks,
      readProjectAsset: example.readAsset,
      // Silent (ADR 0118 D5, B565 Z13): no sound output, captions only.
      audio: null,
      ...(options.vanillaBlockstates === undefined
        ? {}
        : { vanillaBlockstates: options.vanillaBlockstates }),
      ...(options.scripts === undefined ? {} : { scripts: options.scripts }),
    });
    this.needsScripts = options.scripts !== undefined && scriptSources(example.files).length > 0;
    this.area.clock.pause();
    this.area.setRunEveryTime(true);
    if (this.clip.ground.kind === 'generated') {
      this.setUpWaiting = true;
      this.startGenerated(this.clip.ground, example, options.terrain ?? showcaseTerrainClient());
    } else {
      this.area.loadGround(this.clip.ground.kind, groundOf(this.clip), `Clip: ${this.clip.title}`);
      this.setUp();
    }
  }

  /** The clip tick reached (0 before the first step; the length at the end of a loop). */
  get tick(): number {
    return this.tickNow;
  }

  /** How many times the clip has started over. */
  get loops(): number {
    return this.loopCount;
  }

  /**
   * Whether the clip can play: a generated ground's land is in, in full and at its `bottom`
   * (never given up on), and its scripts have loaded, or it has none.
   */
  get ready(): boolean {
    if (!this.groundIn) return false;
    return !this.needsScripts || this.gaveUpWaiting || this.area.source.scripts?.loaded === true;
  }

  /**
   * Whether the clip's ground is in: always, but for a generated ground still arriving, or one
   * the engine could make only in part (a clip never shows a world with parts left out).
   */
  get groundIn(): boolean {
    const ground = this.clip.ground;
    if (ground.kind !== 'generated') return true;
    const state = this.area.generated?.state;
    return (
      state?.status === 'ready' &&
      (state.summary?.unsupported.length ?? 0) === 0 &&
      (ground.bottom === undefined || this.moved)
    );
  }

  /**
   * Why the clip's generated ground could not be made (it then never plays), or `null`: always
   * `null` for the other grounds and while the land is still arriving (ADR 0128 D3).
   */
  get groundFailed(): string | null {
    return this.landProblem;
  }

  /**
   * Resolves once the ground is in ({@link groundIn}); rejects with {@link groundFailed}'s words
   * when a generated ground cannot be made.
   */
  whenGround(): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = (): boolean => {
        if (this.groundIn) resolve();
        else if (this.landProblem !== null) reject(new Error(this.landProblem));
        else return false;
        return true;
      };
      if (check()) return;
      const once = (): void => {
        if (!check()) return;
        stop();
        this.readyChecks.delete(once);
      };
      const stop = this.area.subscribe(once);
      this.readyChecks.add(once);
    });
  }

  /** Resolves once {@link ready}. */
  whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => {
      const check = (): void => {
        if (!this.ready) return;
        stop();
        this.readyChecks.delete(check);
        resolve();
      };
      const stop = this.area.subscribe(check);
      this.readyChecks.add(check);
    });
  }

  /** How far between two ticks the clip is, 0..1, for drawing (`partialTick`). */
  get alpha(): number {
    return Math.min(1, this.carry / TICK_MS);
  }

  /** The steps run in the current loop, in order. */
  get records(): readonly ClipStepRecord[] {
    return this.recordsNow;
  }

  /** What went wrong in the current loop: unknown states, missing mobs, unmet expectations. */
  get problems(): readonly string[] {
    return this.problemsNow;
  }

  /** Every "What happened" line of the current loop since its setup, oldest first. */
  get lines(): readonly WhatHappenedEntry[] {
    return this.seenNow.map((seen) => seen.entry);
  }

  /**
   * Runs one tick: the steps due, the held move, then the area's tick. At the end of the clip
   * it starts over instead. Returns `false` (and runs nothing) while the scripts load.
   */
  stepTick(): boolean {
    if (!this.ready) return false;
    if (this.setUpWaiting) {
      this.setUpWaiting = false;
      this.setUp();
    }
    if (this.tickNow >= this.clip.length) {
      this.restart();
      return true;
    }
    this.tickNow += 1;
    this.clip.steps.forEach((step, index) => {
      if (step.tick === this.tickNow) this.runStep(index);
    });
    this.sendMove();
    this.area.clock.step();
    this.collect();
    this.trackFollowed();
    this.checkPending(false);
    if (this.tickNow === this.clip.length) this.checkPending(true);
    return true;
  }

  /**
   * For a drawn frame: lets `elapsedMs` go by, running whole ticks (at most
   * {@link MAX_TICKS_PER_FRAME}; the rest is dropped, so a slow frame slows the clip).
   */
  advance(elapsedMs: number): void {
    // The land is waited for without a limit: a clip never plays on a ground that is not there.
    if (!this.groundIn) return;
    if (!this.ready) {
      this.waitedMs += elapsedMs;
      if (this.waitedMs < SCRIPT_WAIT_MS) return;
      this.gaveUpWaiting = true;
      this.problemsNow.push('The scripts did not load in time; the clip plays without them.');
    }
    this.carry += elapsedMs;
    let ran = 0;
    while (this.carry >= TICK_MS && ran < MAX_TICKS_PER_FRAME) {
      this.carry -= TICK_MS;
      ran += 1;
      this.stepTick();
    }
    if (ran === MAX_TICKS_PER_FRAME) this.carry = Math.min(this.carry, TICK_MS);
  }

  /** Plays the clip to its end from where it is (tests; waits for nothing). */
  playToEnd(): void {
    while (this.tickNow < this.clip.length) {
      if (!this.stepTick()) throw new Error('The clip is waiting for its scripts.');
    }
  }

  /** Starts the clip over: clears the area (the ground comes back) and sets it up again. */
  restart(): void {
    this.loopCount += 1;
    this.area.clear();
    this.setUp();
  }

  /** The camera for the frame being drawn. */
  camera(): CameraPose {
    const camera = this.clip.camera;
    const time = this.tickNow + this.alpha;
    switch (camera.type) {
      case 'keys':
        return cameraAt(camera.keys, time);
      case 'driver': {
        const pose = driverCamera(this.area.source.vehicles, this.alpha, this.look);
        if (pose !== null) return pose;
        return {
          eye: this.area.source.player.eyePosition(this.alpha),
          yaw: this.look.yaw,
          pitch: this.look.pitch,
        };
      }
      case 'follow': {
        const followed = this.followed;
        if (followed === null) return cameraAt(camera.keys, time);
        const t = this.alpha;
        const feet = {
          x: followed.previous.x + (followed.position.x - followed.previous.x) * t,
          y: followed.previous.y + (followed.position.y - followed.previous.y) * t,
          z: followed.previous.z + (followed.position.z - followed.previous.z) * t,
        };
        const eye = {
          x: feet.x + camera.offset.x,
          y: feet.y + camera.offset.y,
          z: feet.z + camera.offset.z,
        };
        return lookAt(eye, { x: feet.x, y: feet.y + FOLLOW_LOOK_HEIGHT, z: feet.z });
      }
    }
  }

  /** The captions shown now. */
  captions(): ClipCaption[] {
    const time = this.tickNow + this.alpha;
    return this.clip.captions.filter((caption) => time >= caption.start && time < caption.end);
  }

  /** Stops the area; the player is not used afterwards. */
  dispose(): void {
    this.area.dispose();
  }

  /**
   * Starts a generated ground (B588): the land from the example's files in its stages, then the
   * move to `bottom`. A ground that cannot be made is a problem; the clip then never starts.
   */
  private startGenerated(
    ground: ClipGeneratedGround,
    example: ExampleFiles,
    client: GroundTerrainLink['client'],
  ): void {
    const spec: GeneratedSpec = {
      source:
        ground.preset === undefined
          ? { dimension: clipId(ground.dimension) }
          : { preset: clipId(ground.preset), dimension: clipId(ground.dimension) },
      seed: ground.seed,
      centre: ground.centre,
      label: this.clip.title,
      elementId: clipId(ground.preset ?? ground.dimension),
    };
    const failed = (error: unknown): void => {
      if (this.area.generated === null) return;
      this.landFailed(
        `The land could not be made: ${error instanceof Error ? error.message : String(error)}`,
      );
    };
    this.area.useGenerated(groundLink(example, client), spec).then(() => {
      const controller = this.area.generated;
      const window = this.area.generatedWindow;
      const left = controller?.state.summary?.unsupported ?? [];
      if (left.length > 0) {
        this.landFailed(
          `The land could not be made in full: ${left.map((part) => part.type).join(', ')}.`,
        );
        return;
      }
      if (ground.bottom === undefined || controller === null || window === null) return;
      const done = (): void => {
        this.moved = true;
        for (const check of [...this.readyChecks]) check();
      };
      if (window.y0 === ground.bottom) done();
      else void controller.move(ground.bottom - window.y0).then(done, failed);
    }, failed);
  }

  /** Notes that the generated ground cannot be made, and tells whoever waits for it. */
  private landFailed(problem: string): void {
    this.problemsNow.push(problem);
    this.landProblem ??= problem;
    for (const check of [...this.readyChecks]) check();
  }

  /** Puts the setup in place and the player at its spot, from tick 0. */
  private setUp(): void {
    this.tickNow = 0;
    this.carry = 0;
    this.look = { yaw: 0, pitch: 0 };
    this.held = { forward: 0, strafe: 0, jump: false, sneak: false };
    this.recordsNow = [];
    this.problemsNow = [];
    this.pending = [];
    this.followed = null;
    for (const block of this.clip.setup) this.setBlock(block.pos, block.state);
    for (const spawn of this.clip.spawns ?? []) {
      this.area.act({ type: 'use', pos: spawn.on, face: 'up', hit: HIT, item: clipId(spawn.egg) });
    }
    this.area.source.player.teleport(this.clip.player);
    this.sendMove();
    // The setup's own lines are not the steps'.
    this.lastSerial = this.area.whatHappened.at(-1)?.serial ?? 0;
    this.seenNow = [];
    this.trackFollowed();
  }

  private setBlock(pos: ClipPoint, text: string): boolean {
    const state = this.area.source.catalogue.normalise(groundState(clipId(text)));
    if (state === null) {
      this.problemsNow.push(`No block ${text} to put at ${pos.x}, ${pos.y}, ${pos.z}.`);
      return false;
    }
    this.area.source.world.set(pos, state);
    return true;
  }

  private sendMove(): void {
    this.area.act({
      type: 'move',
      forward: this.held.forward,
      strafe: this.held.strafe,
      jump: this.held.jump,
      sneak: this.held.sneak,
      toggleFly: false,
      yaw: this.look.yaw,
      pitch: this.look.pitch,
    });
  }

  private runStep(index: number): void {
    const step = this.clip.steps[index];
    if (step === undefined) return;
    const before = this.seenNow.length;
    this.perform(step.action);
    this.collect();
    this.recordsNow.push({
      index,
      tick: this.tickNow,
      lines: this.seenNow.slice(before).map((seen) => seen.entry.text),
    });
    for (const expect of step.expect ?? []) {
      if ('at' in expect) this.checkState(index, expect);
      else this.pending.push({ index, tick: this.tickNow, expect });
    }
  }

  private perform(action: ClipAction): void {
    const act = (one: PlayerAction): void => this.area.act(one);
    switch (action.type) {
      case 'place':
        act({
          type: 'place',
          pos: action.pos,
          face: action.face,
          hit: HIT,
          block: clipId(action.block),
        });
        return;
      case 'use':
        act({
          type: 'use',
          pos: action.pos,
          face: action.face,
          hit: HIT,
          ...(action.item === undefined ? {} : { item: clipId(action.item) }),
        });
        return;
      case 'break':
        act({ type: 'break', pos: action.pos });
        return;
      case 'tool':
        act({ type: 'tool', tool: action.tool, pos: action.pos });
        return;
      case 'set':
        this.setBlock(action.pos, action.state);
        return;
      case 'look':
        this.look = { yaw: action.yaw, pitch: action.pitch };
        this.sendMove();
        return;
      case 'move':
        this.held = {
          forward: action.forward,
          strafe: action.strafe,
          jump: action.jump ?? false,
          sneak: action.sneak ?? false,
        };
        return;
      case 'interact': {
        const mob = this.area.source.entities.snapshots()[action.mob];
        if (mob === undefined) {
          this.problemsNow.push(`There is no mob number ${action.mob + 1} to use.`);
          return;
        }
        act({
          type: 'interact',
          entity: mob.id,
          ...(action.item === undefined ? {} : { item: clipId(action.item) }),
        });
        return;
      }
      case 'useVehicle': {
        const vehicle = this.area.source.vehicles.snapshots()[action.vehicle];
        if (vehicle === undefined) {
          this.problemsNow.push(`There is no vehicle number ${action.vehicle + 1} to use.`);
          return;
        }
        act({
          type: 'useVehicle',
          vehicle: vehicle.id,
          ...(action.item === undefined ? {} : { item: clipId(action.item) }),
        });
        return;
      }
    }
  }

  /** Takes the area's new "What happened" lines, tagged with the clip tick. */
  private collect(): void {
    for (const entry of this.area.whatHappened) {
      if (entry.serial <= this.lastSerial) continue;
      this.seenNow.push({ tick: this.tickNow, entry });
      this.lastSerial = entry.serial;
    }
  }

  private checkState(index: number, expect: Extract<ClipExpect, { at: ClipPoint }>): void {
    const wanted = groundState(clipId(expect.state));
    const found = this.area.source.world.get(expect.at);
    const matches =
      found !== null &&
      found.name === clipIdOf(expect.state) &&
      Object.entries(wanted.properties).every(([key, value]) => found.properties[key] === value);
    if (!matches) {
      const shown =
        found === null
          ? 'nothing'
          : `${found.name}${Object.keys(found.properties).length === 0 ? '' : JSON.stringify(found.properties)}`;
      this.problemsNow.push(
        `Step ${index + 1} (tick ${this.tickNow}) should leave ${expect.state} at ${expect.at.x}, ${expect.at.y}, ${expect.at.z}; found ${shown}.`,
      );
    }
  }

  /** Checks the line expectations whose time is up (all of them at the end). */
  private checkPending(all: boolean): void {
    const still: PendingLine[] = [];
    for (const pending of this.pending) {
      const last = pending.tick + (pending.expect.within ?? 0);
      const found = this.seenNow.some(
        (seen) =>
          seen.tick >= pending.tick &&
          seen.tick <= last &&
          seen.entry.text.includes(pending.expect.line),
      );
      if (found) continue;
      if (all || this.tickNow > last) {
        this.problemsNow.push(
          `Step ${pending.index + 1} (tick ${pending.tick}) should say "${pending.expect.line}".`,
        );
      } else {
        still.push(pending);
      }
    }
    this.pending = still;
  }

  private trackFollowed(): void {
    const camera = this.clip.camera;
    if (camera.type !== 'follow') return;
    const mob = this.area.source.entities.snapshots()[camera.mob];
    this.followed =
      mob === undefined ? null : { position: mob.position, previous: mob.previousPosition };
  }
}

let sharedClient: TerrainClient | null = null;

/**
 * The showcase's own terrain worker client, made on first use and kept for the session (one clip
 * plays at a time, so its worker holds one world: a later clip of the same world is warm). It is
 * not the open mod's map client, so a clip and the map never take turns in one worker.
 */
export function showcaseTerrainClient(): TerrainClient {
  sharedClient ??= new TerrainClient();
  return sharedClient;
}

const terrainFiles = new WeakMap<ExampleFiles, TerrainFilesState>();

/**
 * The example's world files as the terrain worker reads them (`terrain/files.ts`'s folders and
 * ids, from the lowered files), with no vanilla file: an example drawn by a clip draws without
 * the jar (ADR 0119 D10, D11). Made once per lowered example.
 */
export function exampleTerrainFiles(example: ExampleFiles): TerrainFilesState {
  const known = terrainFiles.get(example);
  if (known !== undefined) return known;
  const facts = factsOf(example.target);
  const folders = [...new Set([...facts.dataFolders, 'dimension'])];
  const project: Record<string, Record<string, unknown>> = {};
  for (const [path, contents] of example.files) {
    if (typeof contents !== 'string' || !path.endsWith('.json')) continue;
    const where = folderAndId(path, folders) ?? additionAndId(path);
    if (where === null) continue;
    try {
      project[where.folder] ??= {};
      (project[where.folder] as Record<string, unknown>)[where.id] = JSON.parse(contents);
    } catch {
      // A file that is not JSON is not a world file.
    }
  }
  const map: WorldgenFileMap = project;
  const state: TerrainFilesState = {
    target: example.target,
    facts,
    project: map,
    vanilla: null,
    vanillaKey: null,
    needsSetUp: facts.dataFolders.length > 0,
    filesHash: hashText(`showcase:${example.exampleId}|${stableKey(facts)}|${stableKey(map)}`),
    problems: [],
  };
  terrainFiles.set(example, state);
  return state;
}

/** A generated ground's link over the example's files, which never change. */
function groundLink(example: ExampleFiles, client: GroundTerrainLink['client']): GroundTerrainLink {
  const state = exampleTerrainFiles(example);
  return {
    client,
    subscribe: () => () => undefined,
    getSnapshot: () => ({ state, error: null }),
  };
}

function groundOf(clip: ShowcaseClip): GroundBlocks | undefined {
  switch (clip.ground.kind) {
    case 'grid':
    case 'generated':
      return undefined;
    case 'flat':
      return flatGround();
    case 'quick':
      return quickWorld(clip.ground.options);
  }
}
