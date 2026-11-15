/**
 * Triggers (B396): fires the events of project blocks, items and mobs from what happens in the
 * Try it area, with the runtime's cooldowns, intervals and chance, and says out loud every
 * trigger it does not fire (ADR 0085 D5). The order follows MSM's own runtime (read only to
 * match the order, never Mojang code):
 *
 * - **Using a block** (`BlockBehaviourDriver.useWithoutItem`): the block's own use by hand first
 *   (a door opens), then `msm:on_interact` (or a container's `on_open`). A sneaking player with
 *   something in hand skips the block, as the game's secondary use does.
 * - **Using an item on a block** (`MsmItem.useOn`): when the block did not take the click,
 *   `msm:on_use_on_block` fires and takes it; else a held block is placed (`msm:on_place` after
 *   it is placed, `setPlacedBy`) or a spawn egg hatches (`msm:on_spawn`); then, when nothing took
 *   the click, `msm:on_use` (`MsmItem.use`). Item cooldowns are per item, shared by both.
 * - **Breaking** (`playerWillDestroy`): `msm:on_break` before the block goes.
 * - **Each tick**, after the player, the mobs and the timers have moved: `msm:on_step` for the
 *   block under each entity on the ground and `msm:on_entity_inside` for each block that is not a
 *   full cube an entity's box is in (the player first, then mobs in id order; per position and
 *   entity cooldowns as the runtime's `CooldownMap`); then each mob's `msm:on_tick` when
 *   `(tick + id) % interval == 0` (the runtime's stagger, `MobDriver.due`); then random ticks.
 * - **Mobs:** `msm:on_spawn` after the spawn; `msm:on_interact` on a right click; a hit removes
 *   the mob and fires `msm:on_death` (never `msm:on_hurt`, as on a lethal hit in the runtime).
 * - **Power tool:** `msm:redstone`'s `on_powered` and `on_unpowered` when it changes `powered`.
 * - **Screens** (B398): a container's `on_close` when the player closes its mock-up screen.
 *
 * Random ticks are approximate (limit L9): each block with `msm:on_random_tick` gets one with
 * the odds of the game's default (3 random ticks a tick per 16 by 16 by 16 blocks), then the
 * component's `chance`. Chance uses a seeded generator; {@link ChanceMode} `always` and `never`
 * switch it off for tests and the view's "Run every time" option.
 */
import type { BlockCatalogue } from '../blocks/catalogue.js';
import type { EntityWorld } from '../entities/entity-world.js';
import { SimRandom } from '../entities/wander.js';
import type { WorldBox } from '../player/collide.js';
import type { PlayerController } from '../player/controller.js';
import type { BlockPos, BlockState, SimEffect, SimOrigin, Vec3 } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import {
  type ActionHost,
  type ActionNames,
  type Actor,
  type EventContext,
  PLAYER,
  runEvent,
  SimInventory,
  secondsWords,
} from './actions.js';
import {
  type BoundTrigger,
  type EventDefinitions,
  type EventOwner,
  plainName,
  type RuleBookInfo,
  type RuleRef,
  ruleEventOf,
  rulesForActions,
} from './definitions.js';
import type { SimTrace, TraceEntry } from './trace.js';

/** How a trigger's chance is decided. */
export type ChanceMode = 'random' | 'always' | 'never';

/**
 * The odds that a block gets a random tick in one tick: the game's default random tick speed
 * (3) over the blocks of a 16 by 16 by 16 section. An approximation (limit L9).
 */
export const RANDOM_TICK_ODDS = 3 / 4096;

/** What a {@link TriggerEngine} works on. */
export interface TriggerEngineOptions {
  readonly world: SimWorld;
  /** The current block catalogue (it changes on a live edit). */
  readonly catalogue: () => BlockCatalogue;
  readonly player: PlayerController;
  readonly entities: EntityWorld;
  /** The trace entries go here; it also writes the log. */
  readonly trace: SimTrace;
  /** The current tick. */
  readonly now: () => number;
  /** Effects for the view. */
  readonly effect: (effect: SimEffect) => void;
  /** The seed of chance and particle spread; default 1. */
  readonly seed?: number;
  /** Default `random`. */
  readonly chance?: ChanceMode;
  /** Rule books, to name the rule behind each action of a plain generated event. */
  readonly ruleBooks?: readonly RuleBookInfo[];
}

/** What a use of a block or item did, so the caller knows whether the click was taken. */
export interface FireResult {
  /** True when a trigger fired (the click was taken). */
  readonly fired: boolean;
}

const NOT_FIRED: FireResult = Object.freeze({ fired: false });
const FIRED: FireResult = Object.freeze({ fired: true });

const posKey = (pos: BlockPos): string => `${pos.x},${pos.y},${pos.z}`;
const centre = (pos: BlockPos): Vec3 => ({ x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 });
const below = (v: Vec3): BlockPos => ({
  x: Math.floor(v.x),
  y: Math.floor(v.y) - 1,
  z: Math.floor(v.z),
});

/** The spec ids the engine fires, by name. */
const T = {
  blockInteract: 'block:msm:on_interact',
  blockStep: 'block:msm:on_step',
  powered: 'block:msm:redstone.on_powered',
  unpowered: 'block:msm:redstone.on_unpowered',
  blockBreak: 'block:msm:on_break',
  blockPlace: 'block:msm:on_place',
  randomTick: 'block:msm:on_random_tick',
  inside: 'block:msm:on_entity_inside',
  open: 'block:msm:container.on_open',
  close: 'block:msm:container.on_close',
  itemUse: 'item:msm:on_use',
  itemUseOn: 'item:msm:on_use_on_block',
  death: 'entity:msm:on_death',
  mobInteract: 'entity:msm:on_interact',
  mobTick: 'entity:msm:on_tick',
  spawn: 'entity:msm:on_spawn',
} as const;

/** The events side of one area; see the module comment. */
export class TriggerEngine {
  private definitions: EventDefinitions;
  private readonly options: TriggerEngineOptions;
  private readonly random: SimRandom;
  private readonly host: ActionHost;
  private chanceMode: ChanceMode;
  private ruleBooks: readonly RuleBookInfo[];
  private readonly inventoryNow: SimInventory;
  /** `on_step` and `on_entity_inside` firings by `trigger|pos|actor`, as game ticks. */
  private readonly cooldowns = new Map<string, number>();
  /** Item cooldowns by item id: the tick the item is usable again. */
  private readonly itemCooldowns = new Map<string, number>();
  /** Blocks with `msm:on_random_tick`, by position key. */
  private readonly randomTicking = new Map<string, BlockPos>();
  private readonly said = new Set<string>();
  private readonly ruleCache = new Map<string, ReadonlyMap<number, readonly RuleRef[]>>();

  constructor(definitions: EventDefinitions, options: TriggerEngineOptions) {
    this.definitions = definitions;
    this.options = options;
    this.random = new SimRandom((options.seed ?? 1) ^ 0x2545f491);
    this.chanceMode = options.chance ?? 'random';
    this.ruleBooks = options.ruleBooks ?? [];
    this.inventoryNow = new SimInventory((id) => this.stackSize(id));
    const names: ActionNames = {
      item: (id) => this.itemName(id),
      mob: (id) => {
        const mob = options.entities.entity(id);
        return mob?.kind.displayName ?? 'the mob';
      },
      effect: (id) => this.definitions.get('effect', id)?.displayName ?? plainName(id),
    };
    this.host = {
      world: options.world,
      catalogue: options.catalogue,
      player: options.player,
      entities: options.entities,
      inventory: this.inventoryNow,
      trace: options.trace,
      random: this.random,
      names,
      effect: options.effect,
      rulesFor: (owner, eventId) => this.rulesFor(owner, eventId),
      mentioned: (kind, id) => {
        const owner = this.definitions.get(kind, id);
        if (owner !== undefined) this.sayUnhandled(owner);
      },
    };
    options.world.onChange((change) => this.track(change.pos, change.state));
    this.sayScripts();
  }

  /** The inventory `give_item` fills. */
  get inventory(): SimInventory {
    return this.inventoryNow;
  }

  /** The current chance mode. */
  get chance(): ChanceMode {
    return this.chanceMode;
  }

  /** The current definitions. */
  get events(): EventDefinitions {
    return this.definitions;
  }

  /** `always` fires every chance, `never` none, `random` by the seeded generator. */
  setChanceMode(mode: ChanceMode): void {
    this.chanceMode = mode;
  }

  /** Rule books to name the rules behind plain actions (from the app's session). */
  setRuleBooks(books: readonly RuleBookInfo[]): void {
    this.ruleBooks = books;
    this.ruleCache.clear();
  }

  /** Takes the definitions of new lowered files (a live edit); cooldowns keep counting. */
  setDefinitions(definitions: EventDefinitions): void {
    this.definitions = definitions;
    this.ruleCache.clear();
    this.randomTicking.clear();
    for (const { pos, state } of this.options.world.blocks()) this.track(pos, state);
    this.sayScripts();
  }

  /** Forgets cooldowns and empties the inventory ("Clear the area"). */
  clear(): void {
    this.cooldowns.clear();
    this.itemCooldowns.clear();
    this.inventoryNow.clear();
    this.randomTicking.clear();
  }

  // Blocks.

  /**
   * A player used the block at `pos` (after its own use by hand, which the caller ran):
   * `msm:on_interact`, or a container's `on_open`.
   */
  blockUsed(pos: BlockPos): FireResult {
    const owner = this.blockOwner(pos);
    if (owner === undefined) return NOT_FIRED;
    const ctx = this.blockContext(pos, true, PLAYER);
    const interact = this.fire(owner, T.blockInteract, ctx, `You used ${owner.displayName}`);
    const open = this.fire(owner, T.open, ctx, `You opened ${owner.displayName}`);
    return interact || open ? FIRED : NOT_FIRED;
  }

  /**
   * A container's or machine's screen opened (B398): the preview shows a mock-up, so the real
   * screen is said once per block (ADR 0085 L11).
   */
  screenOpened(block: { id: string; displayName: string; origin: SimOrigin }): void {
    this.sayOnce(
      `screen:${block.id}`,
      `the screen of ${block.displayName} with items you can move (the preview shows a mock-up of its slots)`,
      block.origin,
    );
  }

  /** The player closed the screen of the container at `pos` (B398): its `on_close`. */
  blockClosed(pos: BlockPos): FireResult {
    const owner = this.blockOwner(pos);
    if (owner === undefined) return NOT_FIRED;
    const ctx = this.blockContext(pos, true, PLAYER);
    return this.fire(owner, T.close, ctx, `You closed ${owner.displayName}`) ? FIRED : NOT_FIRED;
  }

  /** A display name for an item or block id (the inventory row, B398). */
  nameOfItem(id: string): string {
    return this.itemName(id);
  }

  /** A player is about to break the block at `pos`: `msm:on_break`. */
  blockBreaking(pos: BlockPos): void {
    const owner = this.blockOwner(pos);
    if (owner === undefined) return;
    this.fire(
      owner,
      T.blockBreak,
      this.blockContext(pos, true, PLAYER),
      `You broke ${owner.displayName}`,
    );
  }

  /** The player placed a block at `pos`: `msm:on_place`, and the unfired triggers said. */
  blockPlaced(pos: BlockPos): void {
    const owner = this.blockOwner(pos);
    if (owner === undefined) return;
    this.sayUnhandled(owner);
    this.fire(
      owner,
      T.blockPlace,
      this.blockContext(pos, true, PLAYER),
      `You placed ${owner.displayName}`,
    );
  }

  /** A block's `powered` changed (the Power tool): `on_powered` or `on_unpowered`. */
  powerChanged(pos: BlockPos, before: BlockState | null, after: BlockState | null): void {
    if (before === null || after === null || before.name !== after.name) return;
    const was = before.properties.powered;
    const now = after.properties.powered;
    if (was === undefined || now === undefined || was === now) return;
    const owner = this.blockOwner(pos);
    if (owner === undefined) return;
    const on = now === 'true';
    this.fire(
      owner,
      on ? T.powered : T.unpowered,
      this.blockContext(pos, false, undefined),
      `${owner.displayName} ${on ? 'became powered' : 'stopped being powered'}`,
    );
  }

  // Items.

  /**
   * The player used `item` on the block at `pos` (the block did not take the click):
   * `msm:on_use_on_block`, which takes the click. On cooldown the click is taken and nothing fires.
   */
  itemUsedOn(item: string, pos: BlockPos, point: Vec3): FireResult {
    const owner = this.definitions.get('item', item);
    const bound = owner?.triggers.get(T.itemUseOn);
    if (owner === undefined || bound === undefined) return NOT_FIRED;
    this.sayUnhandled(owner);
    if (this.onItemCooldown(owner)) return FIRED;
    const block = this.options.world.get(pos);
    const blockName =
      block === null
        ? 'the floor'
        : (this.options.catalogue().blockFor(block.name)?.displayName ?? block.name);
    const ctx: EventContext = {
      source: 'item',
      base: pos,
      origin: point,
      player: true,
      block: pos,
      other: PLAYER,
    };
    this.fire(owner, T.itemUseOn, ctx, `You used ${owner.displayName} on ${blockName}`);
    this.startItemCooldown(item, bound);
    return FIRED;
  }

  /** The player used `item` and nothing else took the click: `msm:on_use`. */
  itemUsed(item: string): FireResult {
    const owner = this.definitions.get('item', item);
    if (owner === undefined) return NOT_FIRED;
    this.sayUnhandled(owner);
    const bound = owner.triggers.get(T.itemUse);
    if (bound === undefined) return NOT_FIRED;
    if (this.onItemCooldown(owner)) return FIRED;
    const feet = this.options.player.position;
    const ctx: EventContext = {
      source: 'item',
      base: below(feet),
      origin: feet,
      player: true,
      other: PLAYER,
    };
    this.fire(owner, T.itemUse, ctx, `You used ${owner.displayName}`);
    this.startItemCooldown(item, bound);
    return FIRED;
  }

  // Mobs.

  /** A mob spawned: `msm:on_spawn`, and the unfired triggers said. */
  mobSpawned(id: number): void {
    const owner = this.mobOwner(id);
    if (owner === undefined) return;
    this.sayUnhandled(owner);
    this.fire(owner, T.spawn, this.mobContext(id, false), `${owner.displayName} spawned`);
  }

  /** The player right-clicked a mob: `msm:on_interact`. */
  mobInteracted(id: number): FireResult {
    const owner = this.mobOwner(id);
    if (owner === undefined) return NOT_FIRED;
    return this.fire(
      owner,
      T.mobInteract,
      this.mobContext(id, true),
      `You used ${owner.displayName}`,
    )
      ? FIRED
      : NOT_FIRED;
  }

  /**
   * The player's hit removed a mob of `type` (already gone) at `position`: `msm:on_death`, with
   * the player as the killer.
   */
  mobDied(type: string, id: number, position: Vec3): void {
    const owner = this.definitions.get('entity', type);
    if (owner === undefined) return;
    const ctx: EventContext = {
      source: 'entity',
      base: { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) },
      origin: position,
      player: true,
      entity: id,
      other: PLAYER,
    };
    this.fire(owner, T.death, ctx, `${owner.displayName} died`);
  }

  /**
   * Runs an event of an owner the definitions do not bind, a vehicle's `on_place` and the rest
   * (B428): one trigger line, `<sentence>, so its event "<id>" ran.`, then the actions in `ctx`.
   */
  fireOwned(owner: EventOwner, eventId: string, ctx: EventContext, sentence: string): void {
    this.options.trace.add({
      kind: 'trigger',
      text: `${sentence}, so its event "${eventId}" ran.`,
      origin: { ...owner.origin, eventId },
      depth: 1,
    });
    runEvent(this.host, { owner, ctx }, eventId);
  }

  // Ticks.

  /**
   * Runs the tick triggers once (call after the player, mobs and timers moved): steps and
   * insides for the player and each mob, each mob's `msm:on_tick`, then random ticks.
   */
  tick(): void {
    const actors: { actor: Actor; box: WorldBox; feet: Vec3; onGround: boolean; name: string }[] = [
      {
        actor: PLAYER,
        box: this.options.player.box,
        feet: this.options.player.position,
        onGround: this.options.player.onGround,
        name: 'You',
      },
      ...this.options.entities.entities().map((mob) => ({
        actor: { kind: 'mob', id: mob.id } as Actor,
        box: mob.box,
        feet: mob.position,
        onGround: mob.onGround,
        name: mob.kind.displayName,
      })),
    ];
    for (const one of actors) this.stepAndInside(one);
    const now = this.options.now();
    for (const mob of this.options.entities.entities()) {
      const owner = this.definitions.get('entity', mob.kind.id);
      const bound = owner?.triggers.get(T.mobTick);
      if (owner === undefined || bound === undefined) continue;
      if ((now + mob.id) % bound.intervalTicks !== 0) continue;
      this.fire(
        owner,
        T.mobTick,
        this.mobContext(mob.id, false),
        `${owner.displayName}'s timer came round (every ${secondsWords(bound.intervalTicks / 20)})`,
      );
    }
    for (const pos of [...this.randomTicking.values()]) {
      if (this.random.next() >= RANDOM_TICK_ODDS) continue;
      const owner = this.blockOwner(pos);
      if (owner === undefined) continue;
      this.fire(
        owner,
        T.randomTick,
        this.blockContext(pos, false, undefined),
        `${owner.displayName} got a random tick`,
      );
    }
  }

  /**
   * Someone stands on the block at `pos` (the player by default): its `msm:on_step`, with the
   * per position and entity cooldown. The tick does this for the block under each entity on the
   * ground; the parity test (B399) calls it directly, as the runtime's GameTest steps without a
   * tick.
   */
  blockSteppedOn(pos: BlockPos, actor: Actor = PLAYER): void {
    this.steppedOn(pos, actor, actor.kind === 'player' ? 'You' : this.host.names.mob(actor.id));
  }

  private steppedOn(pos: BlockPos, actor: Actor, who: string): void {
    const owner = this.blockOwner(pos);
    if (owner === undefined) return;
    this.fireWithCooldown(owner, T.blockStep, pos, actor, `${who} stepped on ${owner.displayName}`);
  }

  private stepAndInside(one: {
    actor: Actor;
    box: WorldBox;
    feet: Vec3;
    onGround: boolean;
    name: string;
  }): void {
    const world = this.options.world;
    const catalogue = this.options.catalogue();
    const who = one.actor.kind === 'player' ? 'You' : one.name;
    if (one.onGround) {
      const under = {
        x: Math.floor(one.feet.x),
        y: Math.floor(one.feet.y - 0.2),
        z: Math.floor(one.feet.z),
      };
      this.steppedOn(under, one.actor, who);
    }
    const e = 1e-7;
    const x0 = Math.floor(one.box[0] + e);
    const y0 = Math.floor(one.box[1] + e);
    const z0 = Math.floor(one.box[2] + e);
    const x1 = Math.floor(one.box[3] - e);
    const y1 = Math.floor(one.box[4] - e);
    const z1 = Math.floor(one.box[5] - e);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const pos = { x, y, z };
          const state = world.get(pos);
          if (state === null) continue;
          const owner = this.definitions.get('block', state.name);
          if (owner === undefined || !owner.triggers.has(T.inside)) continue;
          if (catalogue.isSolidCube(state)) continue;
          this.fireWithCooldown(
            owner,
            T.inside,
            pos,
            one.actor,
            `${who} ${one.actor.kind === 'player' ? 'are' : 'is'} inside ${owner.displayName}`,
          );
        }
      }
    }
  }

  private fireWithCooldown(
    owner: EventOwner,
    trigger: string,
    pos: BlockPos,
    actor: Actor,
    sentence: string,
  ): void {
    const bound = owner.triggers.get(trigger);
    if (bound === undefined) return;
    const key = `${trigger}|${posKey(pos)}|${actor.kind === 'player' ? 'p' : actor.id}`;
    const now = this.options.now();
    const last = this.cooldowns.get(key);
    if (last !== undefined && now - last < bound.cooldownTicks && now >= last) return;
    this.cooldowns.set(key, now);
    this.fire(owner, trigger, this.blockContext(pos, actor.kind === 'player', actor), sentence);
  }

  // Firing.

  /** Fires a bound trigger with its chance; true when it fired (a failed chance counts as fired). */
  private fire(owner: EventOwner, trigger: string, ctx: EventContext, sentence: string): boolean {
    const bound = owner.triggers.get(trigger);
    if (bound === undefined) return false;
    const origin: SimOrigin = { ...owner.origin, eventId: bound.event, pointer: bound.pointer };
    if (!this.passes(bound)) {
      this.options.trace.add({
        kind: 'skipped',
        text: `${sentence}, but the ${Math.round(bound.chance * 100)}% chance did not come up.`,
        origin,
        trigger: bound.spec.id,
      });
      return true;
    }
    const rules = this.rulesFor(owner, bound.event);
    const refs = [...rules.values()].flat();
    const keys = [...new Map(refs.map((ref) => [`${ref.book}|${ref.key}`, ref])).values()];
    const first = keys[0];
    const generated = ruleEventOf(owner.id, bound.event);
    const what =
      keys.length > 0
        ? `${keys.length === 1 ? 'rule' : 'rules'} ${keys
            .map((ref) => `"${ref.name ?? ref.key}"`)
            .join(', ')} ran`
        : generated !== null
          ? `its rules (${generated.trigger.replaceAll('_', ' ')}) ran`
          : `its event "${bound.event}" ran`;
    const actions = owner.events.get(bound.event) ?? [];
    const scriptOnly =
      keys.length > 0 && actions.length > 0 && actions.every((one) => one.type === 'run_script');
    const entry: Omit<TraceEntry, 'tick'> = {
      kind: 'trigger',
      text: scriptOnly
        ? `${sentence}, which starts ${what.slice(0, -' ran'.length)}.`
        : `${sentence}, so ${what}.`,
      origin: {
        ...origin,
        ...(first === undefined ? {} : { ruleKey: first.key, ruleBook: first.book }),
      },
      trigger: bound.spec.id,
      depth: 1,
      ...(ctx.block === undefined ? {} : { pos: ctx.block }),
    };
    this.options.trace.add(entry);
    runEvent(this.host, { owner, ctx }, bound.event);
    return true;
  }

  private passes(bound: BoundTrigger): boolean {
    if (bound.chance >= 1) return this.chanceMode !== 'never' || bound.spec.chance === undefined;
    if (this.chanceMode === 'always') return true;
    if (this.chanceMode === 'never') return false;
    return this.random.next() < bound.chance;
  }

  private rulesFor(owner: EventOwner, eventId: string): ReadonlyMap<number, readonly RuleRef[]> {
    const key = `${owner.kind}|${owner.id}|${eventId}`;
    let found = this.ruleCache.get(key);
    if (found === undefined) {
      found = rulesForActions(
        owner.id,
        eventId,
        owner.events.get(eventId) ?? [],
        this.ruleBooks,
        this.definitions.handlers,
      );
      this.ruleCache.set(key, found);
    }
    return found;
  }

  // Helpers.

  private blockOwner(pos: BlockPos): EventOwner | undefined {
    const state = this.options.world.get(pos);
    return state === null ? undefined : this.definitions.get('block', state.name);
  }

  private mobOwner(id: number): EventOwner | undefined {
    const mob = this.options.entities.entity(id);
    return mob === undefined ? undefined : this.definitions.get('entity', mob.kind.id);
  }

  private blockContext(pos: BlockPos, player: boolean, actor: Actor | undefined): EventContext {
    return {
      source: 'block',
      base: pos,
      origin: centre(pos),
      player,
      block: pos,
      ...(actor?.kind === 'mob' ? { entity: actor.id } : {}),
      ...(actor === undefined ? {} : { other: actor }),
    };
  }

  private mobContext(id: number, player: boolean): EventContext {
    const mob = this.options.entities.entity(id);
    const position = mob?.position ?? { x: 0, y: 0, z: 0 };
    return {
      source: 'entity',
      base: { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) },
      origin: position,
      player,
      entity: id,
      ...(player ? { other: PLAYER } : {}),
    };
  }

  private onItemCooldown(owner: EventOwner): boolean {
    const until = this.itemCooldowns.get(owner.id);
    if (until === undefined || this.options.now() >= until) return false;
    this.options.trace.add({
      kind: 'skipped',
      text: `${owner.displayName} is cooling down; using it did nothing.`,
      origin: owner.origin,
    });
    return true;
  }

  private startItemCooldown(item: string, bound: BoundTrigger): void {
    if (bound.cooldownTicks > 0)
      this.itemCooldowns.set(item, this.options.now() + bound.cooldownTicks);
  }

  private track(pos: BlockPos, state: BlockState | null): void {
    const key = posKey(pos);
    const owner = state === null ? undefined : this.definitions.get('block', state.name);
    if (owner?.triggers.has(T.randomTick) === true) this.randomTicking.set(key, pos);
    else this.randomTicking.delete(key);
  }

  private itemName(id: string): string {
    return (
      this.definitions.get('item', id)?.displayName ??
      this.definitions.get('block', id)?.displayName ??
      plainName(id)
    );
  }

  private stackSize(id: string): number {
    return this.definitions.get('item', id)?.maxStackSize ?? 64;
  }

  private sayOnce(key: string, what: string, origin: SimOrigin): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.options.trace.add({ kind: 'onlyInMinecraft', text: what, origin });
  }

  /** Says once per owner every trigger it sets that Try it does not fire. */
  private sayUnhandled(owner: EventOwner): void {
    for (const bound of owner.triggers.values()) {
      if (bound.spec.handled) continue;
      this.sayOnce(
        `trigger:${owner.kind}:${owner.id}:${bound.spec.id}`,
        `${owner.displayName}'s event when ${bound.spec.words} ("${bound.event}")`,
        { ...owner.origin, eventId: bound.event, pointer: bound.pointer },
      );
    }
    if (owner.triggers.has(T.randomTick)) {
      this.sayOnce(
        `random:${owner.id}`,
        `when exactly ${owner.displayName} gets its random ticks (the preview gives them at about the game's average rate)`,
        owner.origin,
      );
    }
  }

  /** Says once per script that its Script API events come only from the game (slice 4, L5). */
  private sayScripts(): void {
    for (const script of this.definitions.listeners) {
      const what =
        script.book !== undefined && script.ruleKeys.length > 0
          ? `rules ${script.ruleKeys.map((key) => `"${key}"`).join(', ')} of ${script.book} (they start from ${script.events.join(', ')})`
          : `the script ${script.path} (it listens for ${script.events.join(', ')})`;
      this.sayOnce(`script:${script.path}`, what, {
        ...(script.book === undefined ? {} : { elementId: script.book, ruleBook: script.book }),
      });
    }
  }
}
