// biome-ignore-all format: generated file
// msm-runtime.d.ts: typings of the MSM runtime script API, version 1.
// Generated from script-api-v1.json by @msm/plugin-scripting (generateTypings); do not edit.

/** A definition event ran a `run_script` action that names this handler. */
interface ActionEvent extends GameEvent {
  /** The block involved, when there is one. */
  readonly block?: BlockRef;
  /** The entity involved, when there is one: the entity that stepped on a block (a mob, an item or a minecart as well as a player), for example. */
  readonly entity?: Entity;
  /** The definition event id, for example `msm:on_interact`. */
  readonly event: string;
  /** The other entity involved, when there is one: the entity that stepped on a block, the entity a thrown item hit, or the holder of a status effect. */
  readonly other?: Entity;
  /** The id of the block, item or entity definition whose event ran. */
  readonly owner: string;
  /** The player involved, when there is one. */
  readonly player?: Player;
  /** The position the event happened at. */
  readonly pos: Pos;
}

/** A player is about to break a block. */
interface BlockBreakEvent extends GameEvent {
  /** The block being broken. */
  readonly block: BlockRef;
  /** Cancels the event: the block stays in place. */
  cancel(): void;
  /** The player breaking it. */
  readonly player: Player;
}

/** A player used (right-clicked) a block. */
interface BlockInteractEvent extends GameEvent {
  /** The block that was used. */
  readonly block: BlockRef;
  /** Cancels the event: the block and the held item are not used. */
  cancel(): void;
  /** The hand the player used. */
  readonly hand: "main" | "off";
  /** The player who used it. */
  readonly player: Player;
}

/** A block in the world at the time of the event. */
interface BlockRef {
  /** The block id, for example `minecraft:stone`. */
  readonly id: string;
  /** The block's position. */
  readonly pos: Pos;
  /** The block state as `namespace:id[property=value,...]`. */
  readonly state: string;
}

/** Saved data of one script namespace, on an entity or with the world: values are JSON values, copied in and out, and survive `/reload`, restarts, death and dimension changes. */
interface DataStore {
  /**
   * Returns a copy of the value stored under a key, or `undefined` when there is none.
   *
   * @param key - The key, at most 64 characters.
   */
  get(key: string): unknown;
  /**
   * Returns `true` when a value is stored under a key.
   *
   * @param key - The key, at most 64 characters.
   */
  has(key: string): boolean;
  /** Returns the keys stored for this script's namespace. */
  keys(): string[];
  /**
   * Removes the value stored under a key; returns `true` when there was one.
   *
   * @param key - The key, at most 64 characters.
   */
  remove(key: string): boolean;
  /**
   * Stores a copy of a JSON value under a key; any other value is a `TypeError`, and a key longer than 64 characters or a store over its size limit is a script error that leaves the old value.
   *
   * @param key - The key, at most 64 characters.
   * @param value - A JSON value: a string, a finite number, a boolean, `null`, an array or a plain object of these.
   */
  set(key: string, value: unknown): void;
}

/** A living entity, wrapped for scripts; check `isAlive` before using one held across ticks. */
interface Entity {
  /**
   * Gives the entity a mob effect.
   *
   * @param id - The effect id, for example `minecraft:speed`.
   * @param ticks - The duration in ticks.
   * @param amplifier - The amplifier, 0 (level I) by default.
   */
  addEffect(id: string, ticks: number, amplifier?: number): void;
  /**
   * Adds to the motion, for example `entity.addVelocity(0, 1, 0)` for a jump; each part is limited to 10.
   *
   * @param x - Blocks per tick along x.
   * @param y - Blocks per tick along y (up).
   * @param z - Blocks per tick along z.
   */
  addVelocity(x: number, y: number, z: number): void;
  /** Returns this entity as a player, or `undefined` when it is not one. */
  asPlayer(): Player | undefined;
  /**
   * Deals generic damage to the entity.
   *
   * @param amount - The damage in half hearts.
   */
  damage(amount: number): void;
  /** Data saved on this entity for the script's namespace, at most 16 KiB per namespace; a player keeps it on respawn. */
  readonly data: DataStore;
  /**
   * Returns the level of the mob effect (the amplifier plus 1), or 0 when the entity does not have it.
   *
   * @param id - The effect id, for example `minecraft:speed` or one of your own.
   */
  effectLevel(id: string): number;
  /**
   * Returns whether the entity currently has the mob effect.
   *
   * @param id - The effect id, for example `minecraft:speed` or one of your own.
   */
  hasEffect(id: string): boolean;
  /**
   * Heals the entity, up to its maximum health.
   *
   * @param amount - The health to add in half hearts.
   */
  heal(amount: number): void;
  /** The current health in half hearts. */
  readonly health: number;
  /** Whether the entity is still alive and loaded. */
  readonly isAlive: boolean;
  /** Whether the entity is a player. */
  readonly isPlayer: boolean;
  /** Kills the entity. */
  kill(): void;
  /** The direction the entity looks, as a vector of length 1. */
  readonly look: Pos;
  /** The maximum health in half hearts. */
  readonly maxHealth: number;
  /** The entity's display name as plain text. */
  readonly name: string;
  /**
   * Triggers a GeckoLib animation on an MSM entity; does nothing on other entities.
   *
   * @param name - The animation name, for example `animation.my_mob.attack`.
   * @param controller - The animation controller, the entity's main one by default.
   */
  playAnimation(name: string, controller?: string): void;
  /** The entity's exact position. */
  readonly pos: Pos;
  /**
   * Removes the mob effect; returns `true` when the entity had it.
   *
   * @param id - The effect id, for example `minecraft:speed` or one of your own.
   */
  removeEffect(id: string): boolean;
  /**
   * Runs a command as and at this entity (`@s` is the entity, `~ ~ ~` is its position, in its facing) with permission level 2 and no output; returns the command's result count, or 0 when the entity is not in a server level.
   *
   * @param command - The command without a leading slash.
   */
  runCommand(command: string): number;
  /**
   * Runs a data pack function as and at this entity (`@s` is the entity); returns `false` when the function does not exist or the entity is not in a server level.
   *
   * @param id - The function id, for example `mymod:reward`.
   */
  runFunction(id: string): boolean;
  /**
   * Replaces the motion, so the game moves the entity smoothly, as a slime block or a wind charge does; each part is limited to 10. Players are pushed too.
   *
   * @param x - Blocks per tick along x.
   * @param y - Blocks per tick along y (up).
   * @param z - Blocks per tick along z.
   */
  setVelocity(x: number, y: number, z: number): void;
  /** Moves the entity to a position in its current world. */
  teleport(pos: Pos): void;
  /** The entity type id, for example `minecraft:zombie`. */
  readonly type: string;
  /** The entity's UUID as text. */
  readonly uuid: string;
  /** The entity's motion in blocks per tick (x, y, z). */
  readonly velocity: Pos;
  /** The world the entity is in. */
  readonly world: World;
}

/** A living entity died. */
interface EntityDeathEvent extends GameEvent {
  /** The entity that killed it, when there is one. */
  readonly attacker?: Entity;
  /** The entity that died. */
  readonly entity: Entity;
}

/** A living entity is about to take damage. */
interface EntityHurtEvent extends GameEvent {
  /** The damage in half hearts. */
  readonly amount: number;
  /** The entity that caused the damage, when there is one. */
  readonly attacker?: Entity;
  /** Cancels the event: the entity takes no damage. */
  cancel(): void;
  /** The entity being hurt. */
  readonly entity: Entity;
}

/** A player used (right-clicked) an entity. */
interface EntityInteractEvent extends GameEvent {
  /** Cancels the event: the interaction does not happen. */
  cancel(): void;
  /** The entity that was used. */
  readonly entity: Entity;
  /** The hand the player used. */
  readonly hand: "main" | "off";
  /** The player who used it. */
  readonly player: Player;
}

/** What every event object has. */
interface GameEvent {
  /** The world (dimension) the event happened in. */
  readonly world: World;
}

/** An item stack at the time of the event. */
interface ItemRef {
  /** The number of items in the stack. */
  readonly count: number;
  /** The item id, for example `minecraft:stick`. */
  readonly id: string;
}

/** A player used (right-clicked) the held item in the air. */
interface ItemUseEvent extends GameEvent {
  /** Cancels the event: the item is not used. */
  cancel(): void;
  /** The hand holding the item. */
  readonly hand: "main" | "off";
  /** The item being used. */
  readonly item: ItemRef;
  /** The player using it. */
  readonly player: Player;
}

/** The MSM runtime API, available to every script. */
interface Msm {
  /** Named handlers that definition events call through the `run_script` action. */
  readonly actions: MsmActions;
  /** Game events scripts can handle. */
  readonly events: MsmEvents;
  /** Writes to the server log as `[msm_runtime] <script id>: <message>`. */
  readonly log: MsmLog;
  /**
   * Runs a function after a number of server ticks; pending calls are cleared when scripts reload.
   *
   * @param ticks - The delay in ticks, 1 or more.
   */
  schedule(ticks: number, fn: () => void): void;
  /** Data saved with the world for the script's namespace, at most 1 MiB per namespace; unlike `msm.schedule`, it survives `/reload` and restarts. */
  readonly storage: DataStore;
  /** The version of the running `msm_runtime` mod. */
  readonly version: string;
}

/** Named handlers that definition events call through the `run_script` action. */
interface MsmActions {
  /**
   * Defines a named handler for `run_script` actions; a later definition with the same id replaces it.
   *
   * @param id - The handler id, a resource location such as `mymod:ore_glow`.
   */
  define(id: string, handler: (e: ActionEvent) => void): void;
}

/** Game events scripts can handle. */
interface MsmEvents {
  /** Runs when a player uses (right-clicks) a block. Several handlers run in registration order. */
  on(name: "block.interact", handler: (e: BlockInteractEvent) => void): void;
  /** Runs before a player breaks a block. Several handlers run in registration order. */
  on(name: "block.break", handler: (e: BlockBreakEvent) => void): void;
  /** Runs when a player uses (right-clicks) a held item. Several handlers run in registration order. */
  on(name: "item.use", handler: (e: ItemUseEvent) => void): void;
  /** Runs when a player uses (right-clicks) an entity. Several handlers run in registration order. */
  on(name: "entity.interact", handler: (e: EntityInteractEvent) => void): void;
  /** Runs before a living entity takes damage. Several handlers run in registration order. */
  on(name: "entity.hurt", handler: (e: EntityHurtEvent) => void): void;
  /** Runs after a living entity dies. Several handlers run in registration order. */
  on(name: "entity.death", handler: (e: EntityDeathEvent) => void): void;
  /** Runs when a player joins the server. Several handlers run in registration order. */
  on(name: "player.join", handler: (e: PlayerJoinEvent) => void): void;
  /** Runs once the server has started. Several handlers run in registration order. */
  on(name: "server.started", handler: (e: ServerStartedEvent) => void): void;
  /** Runs at the end of every server tick (20 times a second); keep the handler cheap. Several handlers run in registration order. */
  on(name: "server.tick", handler: (e: ServerTickEvent) => void): void;
}

/** Writes to the server log as `[msm_runtime] <script id>: <message>`. */
interface MsmLog {
  /** Logs a message at error level. */
  error(message: string): void;
  /** Logs a message at information level. */
  info(message: string): void;
  /** Logs a message at warning level. */
  warn(message: string): void;
}

/** A player, wrapped for scripts. */
interface Player extends Entity {
  /**
   * Gives the player items; what does not fit in the inventory is dropped at their feet.
   *
   * @param item - The item id, for example `minecraft:diamond`.
   * @param count - How many, 1 by default.
   */
  give(item: string, count?: number): void;
  /**
   * Returns whether the player's inventory holds at least one of an item.
   *
   * @param item - The item id.
   */
  hasItem(item: string): boolean;
  /** The item id in the player's main hand, or `undefined` when it is empty. */
  readonly heldItem: string | undefined;
  /** Whether the player is in creative mode. */
  readonly isCreative: boolean;
  /** Whether the player is sneaking. */
  readonly isSneaking: boolean;
  /**
   * Sends a chat message to the player only.
   *
   * @param text - The message as plain text.
   */
  sendMessage(text: string): void;
}

/** A player joined the server. */
interface PlayerJoinEvent extends GameEvent {
  /** The player who joined. */
  readonly player: Player;
}

/** An immutable position; block positions have integer coordinates. */
interface Pos {
  /**
   * Returns a new position moved by the given amounts.
   *
   * @param dx - Blocks to move along x.
   * @param dy - Blocks to move along y.
   * @param dz - Blocks to move along z.
   */
  offset(dx: number, dy: number, dz: number): Pos;
  /** Returns the position as text, for example `1, 64, -3`. */
  toString(): string;
  /** The x (east) coordinate. */
  readonly x: number;
  /** The y (height) coordinate. */
  readonly y: number;
  /** The z (south) coordinate. */
  readonly z: number;
}

/** The server finished starting; `world` is the overworld. */
interface ServerStartedEvent extends GameEvent {
}

/** The server finished a tick; `world` is the overworld. */
interface ServerTickEvent extends GameEvent {
  /** The number of ticks since the server started. */
  readonly tick: number;
}

/** One loaded dimension of the server. */
interface World {
  /** The dimension id, for example `minecraft:overworld`. */
  readonly dimension: string;
  /**
   * Returns the living entities within a radius of a position.
   *
   * @param radius - The radius in blocks.
   */
  entitiesNear(pos: Pos, radius: number): Entity[];
  /** Returns the block state at a position as `namespace:id[property=value,...]`. */
  getBlock(pos: Pos): string;
  /**
   * Plays a sound event at a position for nearby players. The id can be a vanilla sound event or a project sound key (for example `mymod:block.chime`) once the project declares it in `sounds.json`.
   *
   * @param id - The sound event id, for example `minecraft:block.note_block.bell`.
   * @param options - The volume and pitch, 1 by default.
   */
  playSound(id: string, pos: Pos, options?: { volume?: number; pitch?: number }): void;
  /**
   * Runs a command as the server with permission level 2 and no output; returns the command's result count. Without `at` it runs at the world spawn point with no `@s`; pass `at` for position-relative commands, or use `Entity.runCommand` to run as an entity.
   *
   * @param command - The command without a leading slash.
   * @param at - Where the command runs: `~ ~ ~` is this position. Without it, the command runs at the world spawn point.
   */
  runCommand(command: string, at?: Pos): number;
  /**
   * Runs a data pack function as the server; returns `false` when the function does not exist. Without `at` it runs at the world spawn point with no `@s`; pass `at` for position-relative functions, or use `Entity.runFunction` to run as an entity.
   *
   * @param id - The function id, for example `mymod:reward`.
   * @param at - Where the function runs: `~ ~ ~` is this position. Without it, the function runs at the world spawn point.
   */
  runFunction(id: string, at?: Pos): boolean;
  /**
   * Places a block state written as `namespace:id[property=value,...]`; returns `false` when the state does not parse or the block was not placed.
   *
   * @param state - The block state, for example `minecraft:glowstone`.
   */
  setBlock(pos: Pos, state: string): boolean;
  /**
   * Spawns an entity of a type at a position; returns `undefined` when it could not be spawned.
   *
   * @param id - The entity type id, for example `minecraft:zombie`.
   */
  spawnEntity(id: string, pos: Pos): Entity | undefined;
  /**
   * Spawns particles of a simple particle type at a position.
   *
   * @param id - The particle type id, for example `minecraft:flame`.
   * @param options - How many particles, how far they spread in blocks and how fast they move.
   */
  spawnParticle(id: string, pos: Pos, options?: { count?: number; spread?: number; speed?: number }): void;
  /** The dimension's game time in ticks. */
  readonly time: number;
}

/** The MSM runtime API, available to every script. */
declare const msm: Msm;

/**
 * Loads another script of the same mod and namespace by a relative id and returns its module.exports (each script runs once; cycles see partial exports); require("msm:runtime") returns the msm module.
 *
 * @param id - A relative id such as "./util" or "../lib/shapes" (a script of the same mod and namespace), or "msm:runtime".
 */
// biome-ignore lint/suspicious/noExplicitAny: untyped by design
declare function require(id: string): any;

/** The runtime module; `require("msm:runtime")` returns the same objects. */
declare module "msm:runtime" {
  /** The MSM runtime API, available to every script. */
  export const msm: Msm;
  export type ActionEvent = globalThis.ActionEvent;
  export type BlockBreakEvent = globalThis.BlockBreakEvent;
  export type BlockInteractEvent = globalThis.BlockInteractEvent;
  export type BlockRef = globalThis.BlockRef;
  export type DataStore = globalThis.DataStore;
  export type Entity = globalThis.Entity;
  export type EntityDeathEvent = globalThis.EntityDeathEvent;
  export type EntityHurtEvent = globalThis.EntityHurtEvent;
  export type EntityInteractEvent = globalThis.EntityInteractEvent;
  export type GameEvent = globalThis.GameEvent;
  export type ItemRef = globalThis.ItemRef;
  export type ItemUseEvent = globalThis.ItemUseEvent;
  export type Msm = globalThis.Msm;
  export type MsmActions = globalThis.MsmActions;
  export type MsmEvents = globalThis.MsmEvents;
  export type MsmLog = globalThis.MsmLog;
  export type Player = globalThis.Player;
  export type PlayerJoinEvent = globalThis.PlayerJoinEvent;
  export type Pos = globalThis.Pos;
  export type ServerStartedEvent = globalThis.ServerStartedEvent;
  export type ServerTickEvent = globalThis.ServerTickEvent;
  export type World = globalThis.World;
}
