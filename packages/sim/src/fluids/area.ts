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
 */

import type { Actor, EventContext } from '../events/actions.js';
import type { TriggerEngine } from '../events/triggers.js';
import type { WorldBox } from '../player/collide.js';
import type { BlockPos, SimFiles, SimLog } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import {
  type FluidCatalogue,
  type FluidSpec,
  type FluidsTarget,
  flowWords,
  readFluids,
} from './catalogue.js';

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

  constructor(files: SimFiles, target: FluidsTarget, host: FluidHost) {
    this.host = host;
    this.catalogueNow = readFluids(files, target);
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
