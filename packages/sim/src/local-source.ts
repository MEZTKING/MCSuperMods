/**
 * The local world source (ADR 0085 D14, B390): the one `WorldSource` of Try it. It owns the area
 * (`SimWorld`), the block and mob catalogues built from the lowered files, the player, the mobs
 * and the button and plate timers, and turns player actions into changes. Block changes, entity
 * snapshots and log lines go out to its listeners; the view reads the world, player and mobs
 * directly to draw them.
 *
 * One tick (call {@link LocalWorldSource.tick} once per `SimClock` tick):
 * 1. the player moves with the last `move` input (`toggleFly` counts once);
 * 2. every mob steps, and the snapshots go out as an `entities` event;
 * 3. the timers run with the player's and the mobs' boxes (buttons let go, plates press).
 *
 * The view's own per-tick work (ambient particles, the particle field) follows the tick.
 * Triggers and actions (B396) plug in where `use`, `place`, `break`, `hit` and the timers make
 * their changes: see the `TODO(B396)` notes below.
 */

import { type BlockCatalogue, buildCatalogue, type CatalogueTarget } from './blocks/catalogue.js';
import { useBlock } from './blocks/interact.js';
import { breakBlock, placeBlock } from './blocks/placement.js';
import { buildEntityCatalogue, type EntityCatalogue } from './entities/catalogue.js';
import { EntityWorld } from './entities/entity-world.js';
import type { EntityHit } from './entities/spawn.js';
import type { BlockLookup } from './player/collide.js';
import { REACH } from './player/constants.js';
import { IDLE_INPUT, PlayerController, type PlayerInput } from './player/controller.js';
import { lookDirection, type PickResult, pick } from './player/pick.js';
import { BlockTimers } from './tick/timers.js';
import { applyTool } from './tick/tools.js';
import type {
  BlockPos,
  BlockShapes,
  BlockState,
  Face,
  PlayerAction,
  SimFiles,
  SimLog,
  SimLogLine,
  SimOrigin,
  Vec3,
  WorldEvent,
  WorldListener,
  WorldSource,
} from './types.js';
import { SimWorld, sameState, type WorldChange } from './world/sim-world.js';

/** What the local source reads from a target: folder names and the block names of the version. */
export type LocalSourceTarget = CatalogueTarget;

/** Options of a {@link LocalWorldSource}. */
export interface LocalSourceOptions {
  /** The lowered files (ADR 0085 D3). */
  readonly files: SimFiles;
  /** The target they were lowered for. */
  readonly target: LocalSourceTarget;
  /** Vanilla block state definitions by id, for props from the picker. */
  readonly vanillaBlockstates?: ReadonlyMap<string, string>;
  /** The seed of the mobs' wander; the same seed walks the same way. Default 1. */
  readonly seed?: number;
  /** Where the player starts (feet); default the middle of the area on the floor. */
  readonly start?: Vec3;
  /** The most log lines kept for {@link LocalWorldSource.lines}; default {@link LOG_LIMIT}. */
  readonly logLimit?: number;
}

/** The most log lines the source keeps. */
export const LOG_LIMIT = 200;

/** What the player points at: a block (or the floor) or a mob, whichever is nearer. */
export type PointedAt =
  | { readonly kind: 'block'; readonly block: PickResult }
  | { readonly kind: 'entity'; readonly entity: EntityHit; readonly block: PickResult | null }
  | null;

/** The id the floor reports in a pick result's state readouts. */
export const FLOOR_NAME = 'msm:try_it_floor';

/** The look the view passes for picking: its own, smoother yaw and pitch, and the alpha. */
export interface PickLook {
  readonly alpha?: number;
  readonly yaw?: number;
  readonly pitch?: number;
}

/**
 * The block the ray from `origin` along `direction` hits on the floor (the top face of the layer
 * below the area), within `reach` and inside the area; `null` otherwise.
 */
export function pickFloor(
  world: Pick<SimWorld, 'isFloor'>,
  origin: Vec3,
  direction: Vec3,
  reach: number = REACH,
): PickResult | null {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length === 0 || direction.y >= 0 || origin.y < 0) return null;
  const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  const t = origin.y / -d.y;
  if (t > reach) return null;
  const point = { x: origin.x + d.x * t, y: 0, z: origin.z + d.z * t };
  const pos = { x: Math.floor(point.x), y: -1, z: Math.floor(point.z) };
  if (!world.isFloor(pos)) return null;
  return {
    pos,
    face: 'up',
    hit: { x: point.x - pos.x, y: 1, z: point.z - pos.z },
    point,
    distance: t,
    box: 0,
  };
}

/** The local simulation behind Try it; see the module comment. */
export class LocalWorldSource implements WorldSource {
  /** The blocks of the area. */
  readonly world: SimWorld;
  /** The player. */
  readonly player: PlayerController;
  /** The mobs. */
  readonly entities: EntityWorld;

  private files: SimFiles;
  private target: LocalSourceTarget;
  private vanillaBlockstates: ReadonlyMap<string, string> | undefined;
  private blockCatalogue: BlockCatalogue;
  private entityCatalogue: EntityCatalogue;
  private readonly timers: BlockTimers;
  private readonly listeners = new Set<WorldListener>();
  private readonly logLines: SimLogLine[] = [];
  private readonly logLimit: number;
  private readonly said = new Set<string>();
  private input: PlayerInput = IDLE_INPUT;
  private ticks = 0;
  private readonly unsubscribeWorld: () => void;

  /** The log every part of the simulation writes to; lines go out as `log` events. */
  readonly log: SimLog = {
    info: (text, origin) => this.writeLine(text, false, origin),
    onlyInMinecraft: (what, origin) => {
      // A rebuilt catalogue says its lines again; the panel shows each one once.
      if (this.said.has(what)) return;
      this.said.add(what);
      this.writeLine(what, true, origin);
    },
  };

  /** Shapes that always ask the current catalogue, so the player survives a live edit. */
  private readonly shapes: BlockShapes = {
    collision: (state) => this.blockCatalogue.collision(state),
    outline: (state) => this.blockCatalogue.outline(state),
  };

  constructor(options: LocalSourceOptions) {
    this.files = options.files;
    this.target = options.target;
    this.vanillaBlockstates = options.vanillaBlockstates;
    this.logLimit = options.logLimit ?? LOG_LIMIT;
    this.world = new SimWorld();
    this.blockCatalogue = this.buildBlocks();
    this.entityCatalogue = buildEntityCatalogue(this.files, this.target, this.log);
    const lookup: BlockLookup = (x, y, z) => this.world.get({ x, y, z });
    const start = options.start ?? {
      x: this.world.sizeX / 2 + 0.5,
      y: 0,
      z: this.world.sizeZ / 2 + 0.5,
    };
    this.player = new PlayerController(lookup, this.shapes, start);
    this.entities = new EntityWorld(
      this.world,
      this.shapes,
      this.entityCatalogue,
      this.log,
      options.seed === undefined ? {} : { seed: options.seed },
    );
    this.timers = new BlockTimers(this.world, this.blockCatalogue);
    this.unsubscribeWorld = this.world.onChange((change: WorldChange) =>
      this.emit({ type: 'blockChanged', pos: change.pos, state: change.state }),
    );
  }

  private buildBlocks(): BlockCatalogue {
    return buildCatalogue(
      this.files,
      this.target,
      this.log,
      this.vanillaBlockstates === undefined ? {} : { vanillaBlockstates: this.vanillaBlockstates },
    );
  }

  /** The block catalogue of the current files. */
  get catalogue(): BlockCatalogue {
    return this.blockCatalogue;
  }

  /** The mob catalogue of the current files. */
  get mobs(): EntityCatalogue {
    return this.entityCatalogue;
  }

  /** The current lowered files. */
  get sourceFiles(): SimFiles {
    return this.files;
  }

  /** Ticks run since the source was made. */
  get ticksRun(): number {
    return this.ticks;
  }

  /** Buttons and plates waiting to let go. */
  get pendingTimers(): number {
    return this.timers.pending;
  }

  /** The log lines kept, oldest first. */
  get lines(): readonly SimLogLine[] {
    return this.logLines;
  }

  subscribe(listener: WorldListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  act(action: PlayerAction): void {
    switch (action.type) {
      case 'move':
        this.input = {
          forward: action.forward,
          strafe: action.strafe,
          jump: action.jump,
          sneak: action.sneak,
          toggleFly: action.toggleFly || this.input.toggleFly,
          yaw: action.yaw,
          pitch: action.pitch,
        };
        return;
      case 'place':
        this.place(action.pos, action.face, action.hit, action.block);
        return;
      case 'break':
        // TODO(B396): fire `on_break` of the block here, before it goes.
        breakBlock(this.world, this.blockCatalogue, action.pos);
        return;
      case 'use':
        this.use(action);
        return;
      case 'hit':
        // TODO(B396): fire the mob's `on_death` here (a hit removes it).
        this.entities.hit(action.entity);
        return;
      case 'tool':
        applyTool(this.world, this.blockCatalogue, this.log, action.tool, action.pos);
        return;
      case 'clear':
        this.clear();
        return;
    }
  }

  /** Runs one tick; see the module comment. */
  tick(): void {
    this.ticks += 1;
    this.player.step(this.input);
    if (this.input.toggleFly) this.input = { ...this.input, toggleFly: false };
    const snapshots = this.entities.step();
    this.emit({ type: 'entities', entities: snapshots });
    // TODO(B396): plates pressed here fire `on_step`/`on_entity_inside`; read the changes.
    this.timers.tick([this.player.box, ...this.entities.boxes()]);
  }

  /**
   * What the player points at with `look` (the view's smoother look by default the player's):
   * the nearer of the block (or floor) and the mob.
   */
  pointedAt(look: PickLook = {}): PointedAt {
    const alpha = look.alpha ?? 1;
    const yaw = look.yaw ?? this.player.yaw;
    const pitch = look.pitch ?? this.player.pitch;
    const eye = this.player.eyePosition(alpha);
    const direction = lookDirection(yaw, pitch);
    const lookup: BlockLookup = (x, y, z) => this.world.get({ x, y, z });
    const blockHit = pick(lookup, this.shapes, eye, direction, REACH);
    const floorHit = pickFloor(this.world, eye, direction, REACH);
    const block =
      blockHit === null
        ? floorHit
        : floorHit === null || blockHit.distance <= floorHit.distance
          ? blockHit
          : floorHit;
    const entity = this.entities.pick(eye, direction, REACH);
    if (entity !== null && (block === null || entity.distance < block.distance)) {
      return { kind: 'entity', entity, block };
    }
    return block === null ? null : { kind: 'block', block };
  }

  /**
   * New lowered files after an edit (ADR 0085 D4): the catalogues are built again and the world
   * kept. A block the project no longer has is taken out with a log line; a state the block no
   * longer has falls back to its default; mobs follow `EntityWorld.setCatalogue`.
   */
  setFiles(
    files: SimFiles,
    target: LocalSourceTarget = this.target,
    vanillaBlockstates: ReadonlyMap<string, string> | undefined = this.vanillaBlockstates,
  ): void {
    if (
      files === this.files &&
      target === this.target &&
      vanillaBlockstates === this.vanillaBlockstates
    ) {
      return;
    }
    const before = this.blockCatalogue;
    this.files = files;
    this.target = target;
    this.vanillaBlockstates = vanillaBlockstates;
    this.blockCatalogue = this.buildBlocks();
    this.entityCatalogue = buildEntityCatalogue(files, target, this.log);
    const removed = new Map<string, string>();
    for (const { pos, state } of [...this.world.blocks()]) {
      const block = this.blockCatalogue.blockFor(state.name);
      if (block === undefined) {
        this.world.set(pos, null);
        removed.set(state.name, before.get(state.name)?.displayName ?? state.name);
        continue;
      }
      const normal = this.blockCatalogue.normalise(state);
      if (normal !== null && !sameState(normal, state)) this.world.set(pos, normal);
    }
    for (const [id, name] of removed) {
      this.log.info(`${name} is no longer in the project; it was taken out of the preview.`, {
        elementId: id,
      });
    }
    this.entities.setCatalogue(this.entityCatalogue, this.shapes);
    this.timers.setCatalogue(this.blockCatalogue);
  }

  /** Empties the area: blocks, mobs and timers ("Clear the area"). The player stays. */
  clear(): void {
    this.timers.clear();
    this.entities.clear();
    this.world.clear();
    this.emit({ type: 'entities', entities: [] });
    this.log.info('You cleared the area.');
  }

  /** Stops listening to the world; the source should not be used afterwards. */
  dispose(): void {
    this.unsubscribeWorld();
    this.listeners.clear();
  }

  private use(action: Extract<PlayerAction, { type: 'use' }>): void {
    const item = action.item;
    const target = this.world.get(action.pos);
    const block = target === null ? undefined : this.blockCatalogue.blockFor(target.name);
    const usable =
      block !== undefined &&
      ['door', 'trapdoor', 'fence_gate', 'button'].includes(block.type) &&
      !this.player.sneaking;
    if (usable) {
      // TODO(B396): fire `on_interact` of the block here (after the hand's own use).
      const result = useBlock(this.world, this.blockCatalogue, {
        pos: action.pos,
        yaw: this.player.yaw,
      });
      if (result.handled && result.message !== undefined) this.log.info(result.message);
      this.timers.afterUse(action.pos, result);
      return;
    }
    if (item !== undefined && this.entityCatalogue.entityForEgg(item) !== undefined) {
      // TODO(B396): fire the mob's `on_spawn` here.
      this.entities.spawnFromEgg(item, { pos: action.pos, face: action.face });
      return;
    }
    if (item !== undefined && this.blockCatalogue.blockFor(item) !== undefined) {
      this.place(action.pos, action.face, action.hit, item);
      return;
    }
    if (item !== undefined) {
      this.log.info(`${item} is not a block or a spawn egg of the project`);
    }
  }

  private place(pos: BlockPos, face: Face, hit: Vec3, block: string): void {
    // Record what was there, so a place that would trap the player or a mob can be undone.
    const previous: { pos: BlockPos; state: BlockState | null }[] = [];
    const stop = this.world.onChange((change) =>
      previous.push({ pos: change.pos, state: change.previous }),
    );
    let result: ReturnType<typeof placeBlock>;
    try {
      result = placeBlock(this.world, this.blockCatalogue, {
        pos,
        face,
        hit,
        block,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
      });
    } finally {
      stop();
    }
    if (!result.placed) {
      this.log.info(`${this.nameOf(block)} was not placed: ${result.reason}.`);
      return;
    }
    const blocked = result.changes.some(
      (change) =>
        change.state !== null &&
        (this.player.wouldOverlap(change.pos, change.state) ||
          this.entities.wouldOverlap(change.pos, change.state)),
    );
    if (blocked) {
      for (const undo of previous.reverse()) this.world.set(undo.pos, undo.state);
      this.log.info(`${this.nameOf(block)} was not placed: you or a mob stand where it would go.`);
      return;
    }
    // TODO(B396): fire `on_place` of the block here.
  }

  private nameOf(id: string): string {
    return this.blockCatalogue.blockFor(id)?.displayName ?? id;
  }

  private writeLine(text: string, onlyInMinecraft: boolean, origin?: SimOrigin): void {
    const line: SimLogLine = {
      tick: this.ticks,
      text,
      onlyInMinecraft,
      ...(origin === undefined ? {} : { origin }),
    };
    this.logLines.push(line);
    if (this.logLines.length > this.logLimit)
      this.logLines.splice(0, this.logLines.length - this.logLimit);
    this.emit({ type: 'log', line });
  }

  private emit(event: WorldEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
