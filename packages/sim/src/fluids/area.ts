/**
 * Fluids in one Try it area (B483, ADR 0099, ADR 0101 D5): what `LocalWorldSource` hands to this
 * part of the simulation.
 *
 * - A fluid's bucket pours a source of it where a block would be placed; the view draws it with
 *   its still and flowing pictures and its tint (the app's `tryit/fluids/`). It does not flow,
 *   fill holes or make new sources (limit Q29), and nothing collides with it, as with water and
 *   lava props; a block placed into it replaces it.
 * - `on_entity_inside` fires for the player and each mob in the fluid, at most every 10 ticks
 *   for each one, whatever number of the fluid's blocks it touches, as the runtime's (B475).
 * - What only the game does is said once: the flow, swimming, drowning and being put out
 *   (water-like), burning (lava-like), the light level, the bucket filling again.
 *
 * Batch 2 (B540, ADR 0108; `cauldrons.ts`): cauldrons are filled and emptied with buckets and
 * bottles; a glass bottle used towards a source of a fluid with a bottle fills it; a project
 * bottle used is drunk at once (the game takes 1.6 seconds) and fires its `bottle.on_drink`
 * (the drinker is the player); mixing runs after every change beside a fluid with `mixing`
 * ({@link FluidArea.settle}) and is a line in the log with the block it made.
 */

import type { Actor, EventContext } from '../events/actions.js';
import type { TriggerEngine } from '../events/triggers.js';
import type { WorldBox } from '../player/collide.js';
import type { BlockPos, BlockState, SimFiles, SimLog } from '../types.js';
import type { SimWorld, WorldChange } from '../world/sim-world.js';
import {
  type FluidCatalogue,
  type FluidSpec,
  type FluidsTarget,
  flowWords,
  readFluids,
} from './catalogue.js';
import { GLASS_BOTTLE, mixingAt, mixingCandidates, useCauldron } from './cauldrons.js';

/** How long drinking a bottle takes in the game, in seconds (the runtime's `BOTTLE_DRINK_SECONDS`). */
export const BOTTLE_DRINK_SECONDS = 1.6;

/** Ticks between two `on_entity_inside` firings for the same one inside (the runtime's). */
export const FLUID_INSIDE_COOLDOWN = 10;

/** Someone who can be in a fluid. */
export interface FluidActor {
  readonly actor: Actor;
  readonly box: WorldBox;
  /** "You", or the mob's name. */
  readonly name: string;
}

/** What the fluid part works with. */
export interface FluidHost {
  readonly world: SimWorld;
  /** The player and the mobs now. */
  readonly actors: () => readonly FluidActor[];
  readonly triggers: () => TriggerEngine;
  readonly log: SimLog;
  readonly now: () => number;
  /** Puts an item into the inventory (B540). */
  readonly give?: (id: string, count: number) => void;
  /** A block's or item's name in plain words (B540). */
  readonly nameOf?: (id: string) => string;
  /** A block id's default state (the block catalogue's, B540). */
  readonly stateOf?: (id: string) => BlockState;
}

/** The plain words of what a fluid does to those in it in the game, by `behaves_like`. */
const INSIDE_WORDS: Readonly<Record<FluidSpec['behavesLike'], string>> = {
  water: 'Swimming, floating, drowning and being put out when burning',
  lava: 'Being set on fire and hurt',
  none: 'Moving slowly without fall damage (on game versions with one-fluid liquids)',
};

const centre = (pos: BlockPos) => ({ x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 });

/** The fluids of an area; see the module comment. */
export class FluidArea {
  private readonly host: FluidHost;
  private catalogueNow: FluidCatalogue;
  /** Last `on_entity_inside` firing by `fluid|actor`, as game ticks. */
  private readonly cooldowns = new Map<string, number>();
  /** Cells to check for mixing (B540), filled by world changes. */
  private readonly pending: BlockPos[] = [];
  private readonly said = new Set<string>();

  constructor(files: SimFiles, target: FluidsTarget, host: FluidHost) {
    this.host = host;
    this.catalogueNow = readFluids(files, target);
    host.world.onChange((change: WorldChange) => {
      if (!this.mixes()) return;
      this.pending.push(...mixingCandidates(change.pos));
    });
  }

  /** Whether any fluid has `mixing` rules. */
  private mixes(): boolean {
    return this.catalogueNow.all().some((fluid) => (fluid.mixing?.length ?? 0) > 0);
  }

  /**
   * Runs the mixing the last changes started (B540): call after each player action and tick.
   * Returns how many sources became blocks.
   */
  settle(): number {
    let made = 0;
    let guard = 0;
    while (this.pending.length > 0 && guard < 256) {
      guard += 1;
      const pos = this.pending.shift() as BlockPos;
      const mixed = mixingAt(
        this.host.world,
        this.catalogueNow,
        pos,
        this.host.stateOf ?? ((id) => ({ name: id, properties: {} })),
      );
      if (mixed === null) continue;
      const name = this.host.nameOf ?? ((id: string) => id);
      const { fluid, rule } = mixed;
      if (mixed.became === undefined) {
        this.sayOnce(
          `flowing-mix:${fluid.id}`,
          `Flowing ${fluid.displayName} that meets ${name(mixed.other)} becomes ${rule.flowing === undefined ? 'a block' : name(rule.flowing)}; the preview's fluids do not flow, so only sources mix`,
          fluid,
        );
        continue;
      }
      made += 1;
      this.host.log.info(
        `${fluid.displayName} met ${name(mixed.other)} at ${pos.x}, ${pos.y}, ${pos.z} and became ${name(mixed.became)}, with a fizz.`,
        fluid.origin,
      );
      if (rule.flowing !== undefined) {
        this.sayOnce(
          `flowing-mix:${fluid.id}`,
          `Flowing ${fluid.displayName} that meets ${name(mixed.other)} becomes ${name(rule.flowing)}; the preview's fluids do not flow, so only sources mix`,
          fluid,
        );
      }
    }
    this.pending.length = 0;
    return made;
  }

  /**
   * Uses `item` on the cauldron at `pos` (B540); true when it took the click. What it gives goes
   * into the inventory.
   */
  useCauldron(pos: BlockPos, item: string | undefined): boolean {
    const name = this.host.nameOf ?? ((id: string) => id);
    const used = useCauldron(this.host.world, this.catalogueNow, pos, item, name);
    if (!used.handled) return false;
    if (used.message !== undefined) this.host.log.info(used.message);
    if (used.give !== undefined) {
      this.host.give?.(used.give, 1);
      this.sayOnce(
        'cauldron-creative',
        'A bucket or bottle you empty becomes the empty one in your hand; in the preview your hotbar keeps it, and what you fill goes into your inventory',
        undefined,
      );
    }
    return true;
  }

  /**
   * A glass bottle used towards the fluid at `pos` (B540): a source of a fluid with a bottle
   * fills it, and the source stays. True when it took the click.
   */
  fillBottle(item: string, pos: BlockPos): boolean {
    if (item !== GLASS_BOTTLE) return false;
    const state = this.host.world.get(pos);
    const fluid = state === null ? undefined : this.catalogueNow.get(state.name);
    const bottle = fluid?.bottle;
    if (fluid === undefined || bottle === undefined) return false;
    this.host.give?.(bottle.id, 1);
    this.host.log.info(`You filled ${bottle.name} from ${fluid.displayName}.`, fluid.origin);
    return true;
  }

  /**
   * Drinks a project fluid's bottle (B540): the line, `bottle.on_drink` with the player as the
   * drinker, and what only the game does. False for any other item.
   */
  drink(item: string, feet: { x: number; y: number; z: number }): boolean {
    const fluid = this.catalogueNow.forBottle(item);
    const bottle = fluid?.bottle;
    if (fluid === undefined || bottle === undefined) return false;
    this.host.log.info(`You drank ${bottle.name}.`, fluid.origin);
    this.sayOnce(
      `drink:${fluid.id}`,
      `Drinking ${bottle.name} takes ${BOTTLE_DRINK_SECONDS} seconds of holding use${bottle.food ? ', restores hunger' : ''}${bottle.effects > 0 ? `, gives ${bottle.effects === 1 ? 'its effect' : `its ${bottle.effects} effects`}` : ''} and leaves a glass bottle; in the preview it is drunk at once`,
      fluid,
    );
    if (bottle.onDrink === undefined) return true;
    const base = { x: Math.floor(feet.x), y: Math.floor(feet.y), z: Math.floor(feet.z) };
    const ctx: EventContext = {
      source: 'block',
      base,
      origin: feet,
      player: true,
      other: { kind: 'player' },
    };
    this.host
      .triggers()
      .fireTrigger('fluid', fluid.id, 'fluid:bottle.on_drink', ctx, `You drank ${bottle.name}`);
    return true;
  }

  private sayOnce(key: string, what: string, fluid: FluidSpec | undefined): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.host.log.onlyInMinecraft(what, fluid?.origin);
  }

  /** The project's fluids. */
  get catalogue(): FluidCatalogue {
    return this.catalogueNow;
  }

  /** New lowered files after an edit. */
  setFiles(files: SimFiles, target: FluidsTarget): void {
    this.catalogueNow = readFluids(files, target);
  }

  /** Whether `id` is a project fluid's liquid block. */
  isFluid(id: string): boolean {
    return this.catalogueNow.get(id) !== undefined;
  }

  /** The fluid a held bucket pours, when the item is a project fluid's bucket. */
  bucketOf(item: string): FluidSpec | undefined {
    return this.catalogueNow.forBucket(item);
  }

  /** The player poured `fluid` at `pos`: the line, and what only the game does, once. */
  poured(fluid: FluidSpec, pos: BlockPos): void {
    const { log } = this.host;
    log.info(
      `You poured ${fluid.displayName} from ${fluid.bucketName} at ${pos.x}, ${pos.y}, ${pos.z}.`,
      fluid.origin,
    );
    log.onlyInMinecraft(
      `${fluid.displayName} flows (${flowWords(fluid)}); in the preview it stays where you pour it`,
      fluid.origin,
    );
    log.onlyInMinecraft(
      `${fluid.bucketName} empties when you pour it and fills again from a source`,
      fluid.origin,
    );
    if (fluid.light > 0) {
      log.onlyInMinecraft(`${fluid.displayName} gives off light ${fluid.light}`, fluid.origin);
    }
    this.host.triggers().appeared('fluid', fluid.id);
  }

  /** Runs once per tick, after the player and the mobs moved: `on_entity_inside` and its lines. */
  tick(): void {
    if (this.catalogueNow.size === 0) return;
    const now = this.host.now();
    for (const one of this.host.actors()) {
      for (const [fluid, pos] of this.fluidsTouching(one.box)) this.inside(fluid, pos, one, now);
    }
  }

  /** Forgets the cooldowns ("Clear the area"). */
  clear(): void {
    this.cooldowns.clear();
    this.pending.length = 0;
  }

  /** Each fluid the box touches, with the first of its blocks found. */
  private fluidsTouching(box: WorldBox): Map<FluidSpec, BlockPos> {
    const out = new Map<FluidSpec, BlockPos>();
    const e = 1e-7;
    for (let y = Math.floor(box[1] + e); y <= Math.floor(box[4] - e); y++) {
      for (let z = Math.floor(box[2] + e); z <= Math.floor(box[5] - e); z++) {
        for (let x = Math.floor(box[0] + e); x <= Math.floor(box[3] - e); x++) {
          const state = this.host.world.get({ x, y, z });
          if (state === null) continue;
          const fluid = this.catalogueNow.get(state.name);
          if (fluid !== undefined && !out.has(fluid)) out.set(fluid, { x, y, z });
        }
      }
    }
    return out;
  }

  private inside(fluid: FluidSpec, pos: BlockPos, one: FluidActor, now: number): void {
    const { log } = this.host;
    log.onlyInMinecraft(
      `${INSIDE_WORDS[fluid.behavesLike]} in ${fluid.displayName}; in the preview you walk through it as through air`,
      fluid.origin,
    );
    if (fluid.onEntityInside === undefined) return;
    const key = `${fluid.id}|${one.actor.kind === 'player' ? 'p' : one.actor.id}`;
    const last = this.cooldowns.get(key);
    if (last !== undefined && now >= last && now - last < FLUID_INSIDE_COOLDOWN) return;
    this.cooldowns.set(key, now);
    const ctx: EventContext = {
      source: 'block',
      base: pos,
      origin: centre(pos),
      player: one.actor.kind === 'player',
      block: pos,
      ...(one.actor.kind === 'mob' ? { entity: one.actor.id } : {}),
      other: one.actor,
    };
    this.host
      .triggers()
      .fireTrigger(
        'fluid',
        fluid.id,
        'fluid:on_entity_inside',
        ctx,
        `${one.name} ${one.actor.kind === 'player' ? 'are' : 'is'} in ${fluid.displayName}`,
      );
  }
}
