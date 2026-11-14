/**
 * The mobs of one Try it area (B393): spawning from an egg against a picked block, a cap of
 * {@link ENTITY_CAP}, removing by a hit, and stepping every mob once a tick in id order, so a
 * seed and the same actions always give the same walk. Each tick returns the snapshots the view
 * draws; `boxes()` gives `BlockTimers.tick` the mobs' boxes for pressure plates.
 *
 * Mobs only wander (limit L3). Everything else a definition asks for is said once per type, on
 * its first spawn, through `SimLog.onlyInMinecraft` (ADR 0085 D5).
 */
import type { BlockLookup, WorldBox } from '../player/collide.js';
import { boxesOverlap, offsetBox } from '../player/collide.js';
import { REACH } from '../player/constants.js';
import type { BlockPos, BlockShapes, BlockState, EntitySnapshot, SimLog, Vec3 } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import { type CatalogueEntity, type EntityCatalogue, plainList } from './catalogue.js';
import { ENTITY_CAP } from './constants.js';
import { SimEntity } from './sim-entity.js';
import { type EntityHit, pickEntityBox, type SpawnAt, spawnPosition } from './spawn.js';
import { mixSeed } from './wander.js';

/** Options of an {@link EntityWorld}. */
export interface EntityWorldOptions {
  /** The seed every mob's wander comes from; the same seed walks the same way. Defaults to 1. */
  readonly seed?: number;
  /** The most mobs at once; defaults to {@link ENTITY_CAP}. */
  readonly cap?: number;
}

/** What {@link EntityWorld.spawn} did. */
export type SpawnResult =
  | { readonly spawned: true; readonly entity: EntitySnapshot }
  | { readonly spawned: false; readonly reason: string };

/** The mobs of one area. */
export class EntityWorld {
  private readonly world: SimWorld;
  private readonly lookup: BlockLookup;
  private shapes: BlockShapes;
  private catalogue: EntityCatalogue;
  private readonly log: SimLog;
  private readonly seed: number;
  private readonly cap: number;
  private readonly mobs = new Map<number, SimEntity>();
  private readonly said = new Set<string>();
  private nextId = 1;
  private ticks = 0;

  constructor(
    world: SimWorld,
    shapes: BlockShapes,
    catalogue: EntityCatalogue,
    log: SimLog,
    options: EntityWorldOptions = {},
  ) {
    this.world = world;
    this.lookup = (x, y, z) => world.get({ x, y, z });
    this.shapes = shapes;
    this.catalogue = catalogue;
    this.log = log;
    this.seed = (options.seed ?? 1) >>> 0;
    this.cap = options.cap ?? ENTITY_CAP;
  }

  /** How many mobs there are. */
  get count(): number {
    return this.mobs.size;
  }

  /** How many ticks have been stepped. */
  get tick(): number {
    return this.ticks;
  }

  /** The mobs in id order. */
  entities(): SimEntity[] {
    return [...this.mobs.values()];
  }

  /** A mob by id. */
  entity(id: number): SimEntity | undefined {
    return this.mobs.get(id);
  }

  /**
   * Spawns a mob of `type` (an entity type id) against a picked block. Refused, with the reason
   * as a log line too, when the type is unknown, the area is full or there is no room.
   */
  spawn(type: string, at: SpawnAt): SpawnResult {
    const kind = this.catalogue.get(type);
    if (kind === undefined) return this.refuse(`There is no mob ${type} in the project`);
    return this.spawnKind(kind, at);
  }

  /** Spawns the mob a spawn egg item hatches, as {@link spawn}. */
  spawnFromEgg(itemId: string, at: SpawnAt): SpawnResult {
    const kind = this.catalogue.entityForEgg(itemId);
    if (kind === undefined) return this.refuse(`${itemId} is not a spawn egg of the project`);
    return this.spawnKind(kind, at);
  }

  private spawnKind(kind: CatalogueEntity, at: SpawnAt): SpawnResult {
    if (this.mobs.size >= this.cap) {
      return this.refuse(
        `The preview holds at most ${this.cap} mobs; hit one to remove it before spawning ${kind.displayName}`,
      );
    }
    const position = spawnPosition(kind, at);
    if (position === null) {
      return this.refuse(`There is no room in the area for ${kind.displayName} there`);
    }
    const id = this.nextId++;
    const mob = new SimEntity(id, kind, position, mixSeed(this.seed, id));
    if (!mob.unstick(this.lookup, this.shapes) || mob.box[4] > this.world.sizeY) {
      return this.refuse(`There is no room in the area for ${kind.displayName} there`);
    }
    this.mobs.set(id, mob);
    this.log.info(`You spawned ${kind.displayName}.`, kind.origin);
    this.sayFirstSpawn(kind);
    return { spawned: true, entity: mob.snapshot() };
  }

  private refuse(reason: string): SpawnResult {
    this.log.info(`${reason}.`);
    return { spawned: false, reason };
  }

  private sayOnce(key: string, what: string, kind: CatalogueEntity, pointer?: string): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.log.onlyInMinecraft(
      what,
      pointer === undefined ? kind.origin : { ...kind.origin, pointer },
    );
  }

  private sayFirstSpawn(kind: CatalogueEntity): void {
    if (kind.mode === 'swim') {
      this.sayOnce(
        `swim:${kind.id}`,
        `${kind.displayName} swims; in the preview it stands still`,
        kind,
        '/components/msm:movement/mode',
      );
    } else if (kind.mode === 'amphibious') {
      this.sayOnce(
        `swim:${kind.id}`,
        `${kind.displayName} swims; in the preview it only walks on land`,
        kind,
        '/components/msm:movement/mode',
      );
    }
    if (kind.onlyInMinecraft.length > 0) {
      this.sayOnce(
        `features:${kind.id}`,
        `${kind.displayName}'s ${plainList(kind.onlyInMinecraft)}; in the preview it only wanders`,
        kind,
      );
    }
  }

  /**
   * Hits a mob: it is removed at once, with a log line, and the first hit of each type says that
   * health, damage and drops are only in the game. False when there is no such mob.
   */
  hit(id: number): boolean {
    const mob = this.mobs.get(id);
    if (mob === undefined) return false;
    this.mobs.delete(id);
    const kind = mob.kind;
    this.log.info(`You hit ${kind.displayName}; it is gone from the preview.`, kind.origin);
    this.sayOnce(
      `hit:${kind.id}`,
      `${kind.displayName}'s health, hurting, death and drops; a hit in the preview removes it`,
      kind,
    );
    return true;
  }

  /** Removes a mob without a log line (the view's own clean-up). False when there is none. */
  remove(id: number): boolean {
    return this.mobs.delete(id);
  }

  /** Removes every mob ("Clear the area"). Ids keep counting up. */
  clear(): void {
    this.mobs.clear();
  }

  /**
   * Takes new catalogues after a live edit (ADR 0085 D4): mobs whose type is gone are removed
   * with a log line; the others take their new definition and keep their place.
   */
  setCatalogue(catalogue: EntityCatalogue, shapes: BlockShapes = this.shapes): void {
    this.catalogue = catalogue;
    this.shapes = shapes;
    for (const [id, mob] of [...this.mobs]) {
      const kind = catalogue.get(mob.kind.id);
      if (kind === undefined) {
        this.mobs.delete(id);
        this.log.info(
          `${mob.kind.displayName} is no longer in the project; it was taken out of the preview.`,
          mob.kind.origin,
        );
      } else if (kind !== mob.kind) {
        mob.updateKind(kind, mixSeed(this.seed ^ 0x5bd1e995, id + this.ticks));
      }
    }
  }

  /** Steps every mob one tick, in id order, and returns their snapshots. */
  step(): EntitySnapshot[] {
    for (const mob of this.mobs.values()) mob.step(this.lookup, this.shapes);
    this.ticks++;
    return this.snapshots();
  }

  /** The snapshots of every mob now, in id order. */
  snapshots(): EntitySnapshot[] {
    return [...this.mobs.values()].map((mob) => mob.snapshot());
  }

  /** The mobs' collision boxes in world coordinates, for `BlockTimers.tick`. */
  boxes(): WorldBox[] {
    return [...this.mobs.values()].map((mob) => mob.box);
  }

  /**
   * The mob a pointing ray hits within `reach` (the player's reach by default), or `null`. The
   * view compares its distance with the picked block's to decide what a click hits.
   */
  pick(origin: Vec3, direction: Vec3, reach: number = REACH): EntityHit | null {
    return pickEntityBox(
      [...this.mobs.values()].map((mob) => [mob.id, mob.box] as const),
      origin,
      direction,
      reach,
    );
  }

  /** True when a block of `state` at `pos` would overlap a mob, so the view can refuse it. */
  wouldOverlap(pos: BlockPos, state: BlockState): boolean {
    const boxes = this.shapes.collision(state).map((b) => offsetBox(b, pos.x, pos.y, pos.z));
    return [...this.mobs.values()].some((mob) => boxes.some((b) => boxesOverlap(mob.box, b)));
  }
}
