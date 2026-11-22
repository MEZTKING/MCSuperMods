/**
 * Mobs, batch 2 in Try it (B540, ADR 0109 as amended after B524, the runtime's `MobBuckets` and
 * `MobShoulder`, B532): fish buckets and shoulder pets.
 *
 * - Fish buckets (`msm:bucketable` on a swimming mob): a water bucket (an empty bucket with
 *   `water: false`) used on the mob takes it: it leaves the area and its bucket goes into the
 *   inventory. The bucket from the hotbar lets a mob of that kind out against the block pointed
 *   at, with a water source in the cell when the bucket holds water (and the cell is empty).
 *   As in the game's creative mode, the hotbar's bucket is not used up. What the game's bucket
 *   keeps (the mob's name, health and variant) is said: the preview's mobs have none of them.
 * - Shoulder pets (`msm:shoulder_riding`): in the game a tamed pet hops on by itself. The
 *   preview has no taming, so a use with an empty hand puts the pet on a free shoulder its
 *   `sides` allows (`either` takes the right first); at most two pets ride, one a side. Sneaking
 *   takes them all off, and a pet that got off waits {@link SHOULDER_COOLDOWN} ticks before it
 *   rides again, as the runtime's. A perched pet sits at the runtime's offset: 0.4 blocks to the
 *   side of the player's body axis and 0.45 below the top of the player's box.
 */

import { BUCKET as EMPTY_BUCKET, WATER_BUCKET } from '../fluids/cauldrons.js';
import type { WorldBox } from '../player/collide.js';
import type { BlockPos, Face, SimLog, Vec3 } from '../types.js';
import type { CatalogueEntity, EntityCatalogue } from './catalogue.js';
import type { EntityWorld, SpawnResult } from './entity-world.js';
import type { SimEntity } from './sim-entity.js';

/** The shoulder: this far to the side of the owner's body axis (the runtime's `SIDE`). */
export const SHOULDER_SIDE = 0.4;
/** The shoulder: this far below the top of the owner's box (the runtime's `BELOW_TOP`). */
export const SHOULDER_BELOW_TOP = 0.45;
/** Ticks after getting off before a pet rides again (the runtime's `COOLDOWN`). */
export const SHOULDER_COOLDOWN = 100;

/** A shoulder, named by the player's view. */
export type Shoulder = 'left' | 'right';

/** The player as the shoulders follow it. */
export interface ShoulderOwner {
  readonly position: Vec3;
  readonly yaw: number;
  readonly box: WorldBox;
  readonly sneaking: boolean;
}

/** What the batch 2 mobs work with. */
export interface Mobs2Host {
  readonly entities: EntityWorld;
  readonly catalogue: () => EntityCatalogue;
  readonly player: ShoulderOwner;
  readonly log: SimLog;
  /** Puts an item into the inventory. */
  readonly give: (id: string, count: number) => void;
  /** Pours water into a cell; true when it went in. */
  readonly pourWater: (pos: BlockPos) => boolean;
  readonly now: () => number;
}

/** Where a pet on `side` of `owner` sits: its feet and the way it faces. */
export function shoulderSeat(
  owner: ShoulderOwner,
  side: Shoulder,
): { position: Vec3; yaw: number } {
  const radians = (owner.yaw * Math.PI) / 180;
  // The player's right: yaw 0 faces south (+z), so the right is west (-x).
  const right = { x: -Math.cos(radians), z: -Math.sin(radians) };
  const sign = side === 'right' ? 1 : -1;
  return {
    position: {
      x: owner.position.x + right.x * SHOULDER_SIDE * sign,
      y: owner.box[4] - SHOULDER_BELOW_TOP,
      z: owner.position.z + right.z * SHOULDER_SIDE * sign,
    },
    yaw: owner.yaw,
  };
}

const adjacent = (pos: BlockPos, face: Face): BlockPos => {
  switch (face) {
    case 'up':
      return { x: pos.x, y: pos.y + 1, z: pos.z };
    case 'down':
      return { x: pos.x, y: pos.y - 1, z: pos.z };
    case 'north':
      return { x: pos.x, y: pos.y, z: pos.z - 1 };
    case 'south':
      return { x: pos.x, y: pos.y, z: pos.z + 1 };
    case 'west':
      return { x: pos.x - 1, y: pos.y, z: pos.z };
    case 'east':
      return { x: pos.x + 1, y: pos.y, z: pos.z };
  }
};

/** Fish buckets and shoulder pets of an area; see the module comment. */
export class Mobs2Area {
  private readonly host: Mobs2Host;
  /** The pet on each shoulder, by mob id. */
  private readonly seats = new Map<Shoulder, number>();
  /** The tick each pet last got off. */
  private readonly offAt = new Map<number, number>();
  private readonly said = new Set<string>();

  constructor(host: Mobs2Host) {
    this.host = host;
  }

  /** The pets riding now, by shoulder. */
  get shoulders(): ReadonlyMap<Shoulder, number> {
    return this.seats;
  }

  /** Whether `item` is a project fish bucket. */
  isBucket(item: string): boolean {
    return this.host.catalogue().entityForBucket(item) !== undefined;
  }

  /**
   * The player used mob `mobId` holding `item` (in the runtime's order: the bucket first, then
   * the shoulder); true when this took the click.
   */
  interact(mobId: number, item: string | undefined): boolean {
    const mob = this.host.entities.entity(mobId);
    if (mob === undefined) return false;
    const bucket = mob.kind.bucket;
    if (bucket !== undefined && item === (bucket.water ? WATER_BUCKET : EMPTY_BUCKET)) {
      this.catch(mob);
      return true;
    }
    if (item === undefined && mob.kind.shoulder !== undefined && !this.host.player.sneaking) {
      return this.perch(mob);
    }
    return false;
  }

  /**
   * Lets the mob of fish bucket `item` out against `pos`'s `face`; `null` when `item` is no
   * fish bucket of the project.
   */
  release(item: string, pos: BlockPos, face: Face): SpawnResult | null {
    const kind = this.host.catalogue().entityForBucket(item);
    const bucket = kind?.bucket;
    if (kind === undefined || bucket === undefined) return null;
    const cell = adjacent(pos, face);
    const poured = bucket.water && this.host.pourWater(cell);
    const spawned = this.host.entities.spawn(kind.id, { pos, face });
    if (spawned.spawned) {
      this.host.log.info(
        `You let ${kind.displayName} out of ${bucket.name}${poured ? ' with its water' : ''}.`,
        kind.origin,
      );
      this.sayKeeps(kind);
    }
    return spawned;
  }

  /** Runs once per tick before the mobs step: sneaking takes the pets off. */
  tick(): void {
    if (this.seats.size === 0) return;
    for (const [side, id] of [...this.seats]) {
      const mob = this.host.entities.entity(id);
      if (mob === undefined) {
        this.seats.delete(side);
        continue;
      }
      if (this.host.player.sneaking) this.getOff(mob, side, 'You sneaked');
    }
  }

  /** Every pet gets off ("Clear the area" takes the mobs too). */
  clear(): void {
    this.seats.clear();
    this.offAt.clear();
  }

  private catch(mob: SimEntity): void {
    const kind = mob.kind;
    const bucket = kind.bucket;
    if (bucket === undefined) return;
    this.leaveSeat(mob.id);
    this.host.entities.remove(mob.id);
    this.host.give(bucket.item, 1);
    this.host.log.info(`You caught ${kind.displayName} in ${bucket.name}.`, kind.origin);
    this.sayKeeps(kind);
  }

  private sayKeeps(kind: CatalogueEntity): void {
    this.sayOnce(
      `keeps:${kind.id}`,
      `${kind.bucket?.name ?? 'The bucket'} keeps ${kind.displayName}'s name, health and look and lets that one out again; in the preview a new one comes out, and the bucket in your hotbar is not used up`,
      kind,
    );
  }

  private perch(mob: SimEntity): boolean {
    const kind = mob.kind;
    const sides = kind.shoulder;
    if (sides === undefined) return false;
    if ([...this.seats.values()].includes(mob.id)) return true;
    const now = this.host.now();
    const off = this.offAt.get(mob.id);
    if (off !== undefined && now - off < SHOULDER_COOLDOWN) {
      this.host.log.info(
        `${kind.displayName} got off a moment ago and waits ${Math.ceil((SHOULDER_COOLDOWN - (now - off)) / 20)} more seconds before it rides again.`,
        kind.origin,
      );
      return true;
    }
    const order: Shoulder[] = sides === 'either' ? ['right', 'left'] : [sides];
    const side = order.find((one) => !this.seats.has(one));
    if (side === undefined) {
      this.host.log.info(
        this.seats.size >= 2
          ? `Both your shoulders are taken; ${kind.displayName} waits for one to be free.`
          : `Your ${sides} shoulder is taken; ${kind.displayName} rides only on the ${sides}.`,
        kind.origin,
      );
      return true;
    }
    this.seats.set(side, mob.id);
    mob.perchOn(() =>
      this.seats.get(side) === mob.id ? shoulderSeat(this.host.player, side) : null,
    );
    this.host.log.info(
      `${kind.displayName} sits on your ${side} shoulder. Sneak to let it off.`,
      kind.origin,
    );
    this.sayOnce(
      `perch:${kind.id}`,
      `${kind.displayName} hops on by itself once it is tamed and you stand near it; it gets off when you are hurt, sleep, ride, swim or glide, and parrots keep their own shoulders. In the preview a use with an empty hand puts it on, and sneaking takes it off`,
      kind,
    );
    return true;
  }

  private getOff(mob: SimEntity, side: Shoulder, why: string): void {
    this.seats.delete(side);
    mob.getOff();
    this.offAt.set(mob.id, this.host.now());
    this.host.log.info(
      `${why}: ${mob.kind.displayName} got off your ${side} shoulder.`,
      mob.kind.origin,
    );
  }

  private leaveSeat(id: number): void {
    for (const [side, seated] of [...this.seats]) if (seated === id) this.seats.delete(side);
  }

  private sayOnce(key: string, what: string, kind: CatalogueEntity): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.host.log.onlyInMinecraft(what, kind.origin);
  }
}
