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

/**
 * A boss bar shown at the top of the screen of the players added to it; it belongs to the script's namespace, is not saved, and is removed on `/reload` and when the server stops, for example `msm.bossBars.create("countdown", { title: "Time left" })`.
 *
 * Since runtime 1.5.0.
 */
interface BossBar {
  /**
   * Shows the bar to a player; adding a player twice does nothing.
   *
   * Since runtime 1.5.0.
   *
   * @param player - The player.
   */
  addPlayer(player: Player): void;
  /**
   * Returns the players the bar is shown to.
   *
   * Since runtime 1.5.0.
   */
  players(): Player[];
  /**
   * Hides the bar from everyone and removes it, so `msm.bossBars.get` no longer finds it.
   *
   * Since runtime 1.5.0.
   */
  remove(): void;
  /**
   * Hides the bar from a player.
   *
   * Since runtime 1.5.0.
   *
   * @param player - The player.
   */
  removePlayer(player: Player): void;
  /**
   * Changes the bar's colour, for example `bar.setColor("red")`.
   *
   * Since runtime 1.5.0.
   *
   * @param color - The colour.
   */
  setColor(color: BossBarColor): void;
  /**
   * Changes how full the bar is, for example `bar.setProgress(0.5)`.
   *
   * Since runtime 1.5.0.
   *
   * @param progress - How full the bar is, 0 to 1; values outside are clamped.
   */
  setProgress(progress: number): void;
  /**
   * Changes the bar's style, for example `bar.setStyle("notched_10")`.
   *
   * Since runtime 1.5.0.
   *
   * @param style - The style.
   */
  setStyle(style: BossBarStyle): void;
  /**
   * Changes the bar's title.
   *
   * Since runtime 1.5.0.
   *
   * @param title - The title as plain text.
   */
  setTitle(title: string): void;
}

/**
 * The colour of a boss bar.
 *
 * Since runtime 1.5.0.
 */
type BossBarColor = "pink" | "blue" | "red" | "green" | "yellow" | "purple" | "white";

/**
 * The style of a boss bar: one continuous bar or one divided into 6, 10, 12 or 20 notches.
 *
 * Since runtime 1.5.0.
 */
type BossBarStyle = "progress" | "notched_6" | "notched_10" | "notched_12" | "notched_20";

/**
 * The slots of a block with a container, from `World.getContainer`; read and written straight away, and writes update comparators next to the block, for example `world.getContainer(pos)?.add("minecraft:coal")`. Using it after the block is removed or replaced is a script error.
 *
 * Since runtime 1.6.0.
 */
interface Container {
  /**
   * Puts a stack in as a hopper would, filling matching stacks and then empty slots in slot order and skipping slots that do not take the item, whatever side hoppers may use; returns what did not fit, or `undefined` when everything fit. For example `const left = container.add({ id: "minecraft:coal", count: 64 })`.
   *
   * Since runtime 1.6.0.
   *
   * @param item - The stack to put in; its count may be more than one stack.
   */
  add(item: ItemSpec): ItemRef | undefined;
  /**
   * Returns how many of an item the container holds over all slots, for example `container.count("minecraft:coal")`.
   *
   * Since runtime 1.6.0.
   *
   * @param item - The item id, for example `minecraft:coal`.
   */
  count(item: string): number;
  /**
   * Returns a copy of the stack in a slot, or `undefined` when the slot is empty; for example `container.get(0)`. A slot outside 0 to `size - 1` is a `RangeError`.
   *
   * Since runtime 1.6.0.
   *
   * @param slot - The slot, 0 to `size - 1`.
   */
  get(slot: number): ItemRef | undefined;
  /**
   * Replaces the stack in a slot and returns `true`, or returns `false` and changes nothing when the container does not take that item in that slot (a furnace's result slot, a container item in a crate that keeps its contents); for example `container.set(0, { id: "minecraft:torch", count: 16 })`.
   *
   * Since runtime 1.6.0.
   *
   * @param slot - The slot, 0 to `size - 1`.
   * @param item - The new stack, at most the slot's stack size; `undefined` empties the slot.
   */
  set(slot: number, item?: ItemSpec): boolean;
  /**
   * The number of slots, numbered 0 to `size - 1`; for example 27 for a chest.
   *
   * Since runtime 1.6.0.
   */
  readonly size: number;
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
  /**
   * Deals damage of a type, from an attacker, to the entity, for example `target.damage(4, { type: "minecraft:player_attack", attacker: player })`; an unknown damage type is a script error.
   *
   * Since runtime 1.5.0.
   *
   * @param amount - The damage in half hearts.
   * @param options - The damage type id (for example `minecraft:magic`; `minecraft:generic` by default), the entity responsible and the entity that hit (a projectile, for example).
   */
  damage(amount: number, options: { type?: string; attacker?: Entity; direct?: Entity }): void;
  /** Data saved on this entity for the script's namespace, at most 16 KiB per namespace; a player keeps it on respawn. */
  readonly data: DataStore;
  /**
   * Returns the level of the mob effect (the amplifier plus 1), or 0 when the entity does not have it.
   *
   * @param id - The effect id, for example `minecraft:speed` or one of your own.
   */
  effectLevel(id: string): number;
  /**
   * Returns a copy of the stack in an equipment slot, or `undefined` when it is empty; for example `entity.equipment("head")`.
   *
   * Since runtime 1.5.0.
   *
   * @param slot - The equipment slot.
   */
  equipment(slot: EquipmentSlot): ItemRef | undefined;
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
   * Casts a ray from the entity's eyes along its look and returns the first block or entity it hits, or `undefined`; for example `player.raycast(5)?.block?.id`.
   *
   * Since runtime 1.5.0.
   *
   * @param maxDistance - How far the ray goes in blocks, at most 128 (more is a `RangeError`).
   * @param options - What the ray stops at; it always passes through this entity.
   */
  raycast(maxDistance: number, options?: RaycastOptions): RayHit | undefined;
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
   * Replaces the stack in an equipment slot, for example `zombie.setEquipment("mainhand", "minecraft:iron_sword")`.
   *
   * Since runtime 1.5.0.
   *
   * @param slot - The equipment slot.
   * @param item - The new stack; `undefined` empties the slot.
   */
  setEquipment(slot: EquipmentSlot, item?: ItemSpec): void;
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
  /**
   * Moves the entity to a position, in another dimension or facing another way, for example `player.teleport(pos, { dimension: "minecraft:the_nether" })`; the wrapper stays valid after the move.
   *
   * Since runtime 1.5.0.
   *
   * @param pos - The position to move to.
   * @param options - The dimension id to move to (the current one by default) and the facing in degrees (unchanged by default).
   */
  teleport(pos: Pos, options: { dimension?: string; yaw?: number; pitch?: number }): void;
  /** The entity type id, for example `minecraft:zombie`. */
  readonly type: string;
  /** The entity's UUID as text. */
  readonly uuid: string;
  /** The entity's motion in blocks per tick (x, y, z). */
  readonly velocity: Pos;
  /** The world the entity is in. */
  readonly world: World;
}

/**
 * A living entity took damage.
 *
 * Since runtime 1.5.0.
 */
interface EntityDamagedEvent extends GameEvent {
  /**
   * The damage it took in half hearts, after armour and effects.
   *
   * Since runtime 1.5.0.
   */
  readonly amount: number;
  /**
   * The entity that caused the damage, when there is one.
   *
   * Since runtime 1.5.0.
   */
  readonly attacker?: Entity;
  /**
   * The entity that hit, when there is one: an arrow rather than its shooter, for example.
   *
   * Since runtime 1.5.0.
   */
  readonly direct?: Entity;
  /**
   * The entity that was damaged.
   *
   * Since runtime 1.5.0.
   */
  readonly entity: Entity;
  /**
   * The damage type id, for example `minecraft:fall`.
   *
   * Since runtime 1.5.0.
   */
  readonly source: string;
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
  /**
   * The entity that hit, when there is one: an arrow rather than its shooter, for example.
   *
   * Since runtime 1.5.0.
   */
  readonly direct?: Entity;
  /** The entity being hurt. */
  readonly entity: Entity;
  /**
   * The damage type id, for example `minecraft:fall` or `minecraft:player_attack`.
   *
   * Since runtime 1.5.0.
   */
  readonly source: string;
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

/**
 * An equipment slot of a living entity.
 *
 * Since runtime 1.5.0.
 */
type EquipmentSlot = "mainhand" | "offhand" | "head" | "chest" | "legs" | "feet";

/** What every event object has. */
interface GameEvent {
  /** The world (dimension) the event happened in. */
  readonly world: World;
}

/**
 * A game mode.
 *
 * Since runtime 1.5.0.
 */
type GameMode = "survival" | "creative" | "adventure" | "spectator";

/**
 * A player's inventory; slots are read and written straight away, for example `player.inventory.set(0, "minecraft:torch")`.
 *
 * Since runtime 1.5.0.
 */
interface Inventory {
  /**
   * Returns how many of an item the inventory holds over all slots, for example `player.inventory.count("minecraft:diamond")`.
   *
   * Since runtime 1.5.0.
   *
   * @param item - The item id, for example `minecraft:diamond`.
   */
  count(item: string): number;
  /**
   * Returns the first numbered slot that holds an item, or -1 when none does; for example `player.inventory.find("minecraft:compass")`.
   *
   * Since runtime 1.5.0.
   *
   * @param item - The item id.
   */
  find(item: string): number;
  /**
   * Returns a copy of the stack in a slot, or `undefined` when the slot is empty; for example `player.inventory.get("offhand")`.
   *
   * Since runtime 1.5.0.
   *
   * @param slot - The slot, 0 to 35 or an equipment slot name.
   */
  get(slot: InventorySlot): ItemRef | undefined;
  /**
   * Removes up to a number of an item from the inventory and returns how many were removed, for example `player.inventory.remove("minecraft:emerald", 5)`.
   *
   * Since runtime 1.5.0.
   *
   * @param item - The item id.
   * @param count - How many to remove; all of them when omitted.
   */
  remove(item: string, count?: number): number;
  /**
   * The selected hotbar slot, 0 to 8.
   *
   * Since runtime 1.5.0.
   */
  readonly selectedSlot: number;
  /**
   * Replaces the stack in a slot, for example `player.inventory.set("head", "minecraft:carved_pumpkin")`.
   *
   * Since runtime 1.5.0.
   *
   * @param slot - The slot, 0 to 35 or an equipment slot name.
   * @param item - The new stack; `undefined` empties the slot.
   */
  set(slot: InventorySlot, item?: ItemSpec): void;
  /**
   * Sets or removes a data component of the stack in a slot, for example `player.inventory.setComponent(0, "minecraft:custom_name", "Lucky")`; does nothing on an empty slot, and a value that does not decode or validate is a script error (at most 64 KiB of JSON).
   *
   * Since runtime 1.5.0.
   *
   * @param slot - The slot, 0 to 35 or an equipment slot name.
   * @param id - The data component id, for example `minecraft:custom_name`.
   * @param value - The component's JSON value; `undefined` removes the component.
   */
  setComponent(slot: InventorySlot, id: string, value?: unknown): void;
  /**
   * The number of numbered slots, 36: 0 to 8 are the hotbar and 9 to 35 the main inventory.
   *
   * Since runtime 1.5.0.
   */
  readonly size: number;
}

/**
 * A player inventory slot: 0 to 8 are the hotbar, 9 to 35 the main inventory, or an equipment slot name; any other value is a `RangeError`.
 *
 * Since runtime 1.5.0.
 */
type InventorySlot = number | EquipmentSlot;

/** An item stack, copied at the time it was read: changing the game later does not change it. */
interface ItemRef {
  /** The number of items in the stack. */
  readonly count: number;
  /**
   * The damage the item has taken, 0 when it is new or cannot be damaged.
   *
   * Since runtime 1.5.0.
   */
  readonly damage: number;
  /**
   * Returns a copy of a data component's value as JSON (the form `/give` and data packs use), or `undefined` when the item does not have it; for example `item.getComponent("minecraft:damage")` is a number. At most 64 KiB of JSON is returned.
   *
   * Since runtime 1.5.0.
   *
   * @param id - The data component id, for example `minecraft:damage`.
   */
  getComponent(id: string): unknown;
  /**
   * Returns whether the item has a data component, for example `item.hasComponent("minecraft:custom_name")`.
   *
   * Since runtime 1.5.0.
   *
   * @param id - The data component id, for example `minecraft:enchantments`.
   */
  hasComponent(id: string): boolean;
  /** The item id, for example `minecraft:stick`. */
  readonly id: string;
  /**
   * The most items one stack of this item can hold, for example 64 or 1.
   *
   * Since runtime 1.5.0.
   */
  readonly maxCount: number;
  /**
   * The damage the item can take before it breaks, 0 when it cannot be damaged.
   *
   * Since runtime 1.5.0.
   */
  readonly maxDamage: number;
  /**
   * The item's display name as plain text, its custom name when it has one, for example `Diamond Sword`.
   *
   * Since runtime 1.5.0.
   */
  readonly name: string;
}

/**
 * An item to give or put in a slot: an item id such as `"minecraft:diamond"`, or `{ id, count?, components? }` where `components` maps component ids to their JSON values, for example `{ id: "minecraft:diamond_sword", components: { "minecraft:custom_name": "Edge" } }`; components that do not decode or validate are a script error, and at most 64 KiB of component JSON is accepted per call.
 *
 * Since runtime 1.5.0.
 */
type ItemSpec = string | { id: string; count?: number; components?: Record<string, unknown> };

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
  /**
   * Boss bars of the script's namespace, at most 32; they are not saved and are removed on `/reload` and when the server stops.
   *
   * Since runtime 1.5.0.
   */
  readonly bossBars: MsmBossBars;
  /** Game events scripts can handle. */
  readonly events: MsmEvents;
  /**
   * Returns a loaded dimension, or `undefined` when the server has none of that id; for example `msm.getWorld("minecraft:the_end")`.
   *
   * Since runtime 1.5.0.
   *
   * @param dimension - The dimension id, for example `minecraft:the_nether`.
   */
  getWorld(dimension: string): World | undefined;
  /** Writes to the server log as `[msm_runtime] <script id>: <message>`. */
  readonly log: MsmLog;
  /**
   * Returns the players online, for example `msm.players().length`.
   *
   * Since runtime 1.5.0.
   */
  players(): Player[];
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

/**
 * Boss bars of the script's namespace, at most 32; they are not saved and are removed on `/reload` and when the server stops.
 *
 * Since runtime 1.5.0.
 */
interface MsmBossBars {
  /**
   * Creates a boss bar shown to nobody yet, replacing a bar of the same name; for example `msm.bossBars.create("countdown", { title: "Time left", color: "red" })`. A 33rd bar is a script error.
   *
   * Since runtime 1.5.0.
   *
   * @param id - The bar's name within the script's namespace, for example `countdown`.
   * @param options - The title, the colour (`"white"` by default), the style (`"progress"` by default) and how full it is (1 by default).
   */
  create(id: string, options: { title: string; color?: BossBarColor; style?: BossBarStyle; progress?: number }): BossBar;
  /**
   * Returns the boss bar of a name, or `undefined` when there is none.
   *
   * Since runtime 1.5.0.
   *
   * @param id - The bar's name.
   */
  get(id: string): BossBar | undefined;
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
  /**
   * Runs for each online player every `interval` ticks (20 by default; a value under 5 runs every 5 ticks), spread over the interval by player; for example `msm.events.on("player.tick", (e) => { ... }, { interval: 40 })`. Several handlers run in registration order.
   *
   * Since runtime 1.5.0.
   *
   * @param options - How often the handler runs for each player in ticks: 20 by default; a value under 5 counts as 5.
   */
  on(name: "player.tick", handler: (e: PlayerTickEvent) => void, options?: { interval?: number }): void;
  /**
   * Runs after a player respawns, for example to give a starting kit back. Several handlers run in registration order.
   *
   * Since runtime 1.5.0.
   */
  on(name: "player.respawn", handler: (e: PlayerRespawnEvent) => void): void;
  /**
   * Runs when a player leaves the server. Several handlers run in registration order.
   *
   * Since runtime 1.5.0.
   */
  on(name: "player.leave", handler: (e: PlayerLeaveEvent) => void): void;
  /**
   * Runs after a player moves to another dimension, for example through a Nether portal. Several handlers run in registration order.
   *
   * Since runtime 1.5.0.
   */
  on(name: "player.changeDimension", handler: (e: PlayerChangeDimensionEvent) => void): void;
  /**
   * Runs before a player's chat message is sent to the other players. Several handlers run in registration order.
   *
   * Since runtime 1.5.0.
   */
  on(name: "player.chat", handler: (e: PlayerChatEvent) => void): void;
  /**
   * Runs after a living entity took damage, with the final amount; also for the killing blow, before entity.death. Several handlers run in registration order.
   *
   * Since runtime 1.5.0.
   */
  on(name: "entity.damaged", handler: (e: EntityDamagedEvent) => void): void;
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
   * Gives the player experience points, for example `player.addXp(10)`; levels go up as the points fill them.
   *
   * Since runtime 1.5.0.
   *
   * @param points - The points to add; a negative number takes points away.
   */
  addXp(points: number): void;
  /**
   * Gives the player experience levels, for example `player.addXpLevels(1)`.
   *
   * Since runtime 1.5.0.
   *
   * @param levels - The levels to add; a negative number takes levels away.
   */
  addXpLevels(levels: number): void;
  /**
   * Removes the title and subtitle from the player's screen.
   *
   * Since runtime 1.5.0.
   */
  clearTitle(): void;
  /**
   * The food level, 0 to 20.
   *
   * Since runtime 1.5.0.
   */
  readonly food: number;
  /**
   * The player's game mode, for example `"survival"`.
   *
   * Since runtime 1.5.0.
   */
  readonly gameMode: GameMode;
  /**
   * Gives the player items; what does not fit in the inventory is dropped at their feet.
   *
   * @param item - The item id, for example `minecraft:diamond`, or since runtime 1.5.0 an item with components, `{ id, count?, components? }`.
   * @param count - How many; the item's own `count`, or 1, by default.
   */
  give(item: ItemSpec, count?: number): void;
  /**
   * Returns whether the player's inventory holds at least one of an item.
   *
   * @param item - The item id.
   */
  hasItem(item: string): boolean;
  /** The item id in the player's main hand, or `undefined` when it is empty. */
  readonly heldItem: string | undefined;
  /**
   * The player's inventory, for example `player.inventory.count("minecraft:diamond")`.
   *
   * Since runtime 1.5.0.
   */
  readonly inventory: Inventory;
  /** Whether the player is in creative mode. */
  readonly isCreative: boolean;
  /** Whether the player is sneaking. */
  readonly isSneaking: boolean;
  /**
   * The saturation level, 0 up to the food level.
   *
   * Since runtime 1.5.0.
   */
  readonly saturation: number;
  /**
   * Sends a chat message to the player only.
   *
   * @param text - The message as plain text.
   */
  sendMessage(text: string): void;
  /**
   * Sets the player's food level and saturation, for example `player.setFood(20, 5)`.
   *
   * Since runtime 1.5.0.
   *
   * @param level - The food level, 0 to 20.
   * @param saturation - The saturation, unchanged by default; it is never more than the food level.
   */
  setFood(level: number, saturation?: number): void;
  /**
   * Changes the player's game mode, for example `player.setGameMode("adventure")`; returns `false` when the player was already in it.
   *
   * Since runtime 1.5.0.
   *
   * @param mode - The game mode.
   */
  setGameMode(mode: GameMode): boolean;
  /**
   * Sets the player's experience level, for example `player.setXpLevels(30)`.
   *
   * Since runtime 1.5.0.
   *
   * @param levels - The new level, 0 or more.
   */
  setXpLevels(levels: number): void;
  /**
   * Shows text above the player's hotbar for a few seconds, for example `player.showActionBar("Mana: 7")`.
   *
   * Since runtime 1.5.0.
   *
   * @param text - The text as plain text.
   */
  showActionBar(text: string): void;
  /**
   * Shows a title in the middle of the player's screen, for example `player.showTitle("Wave 3", { subtitle: "Get ready" })`.
   *
   * Since runtime 1.5.0.
   *
   * @param title - The title as plain text.
   * @param options - A subtitle and the fade in, stay and fade out times in ticks (10, 70 and 20 by default).
   */
  showTitle(title: string, options?: { subtitle?: string; fadeIn?: number; stay?: number; fadeOut?: number }): void;
  /**
   * The player's experience level.
   *
   * Since runtime 1.5.0.
   */
  readonly xpLevel: number;
  /**
   * The total experience points the player has collected.
   *
   * Since runtime 1.5.0.
   */
  readonly xpPoints: number;
}

/**
 * A player moved to another dimension; `world` is the new one.
 *
 * Since runtime 1.5.0.
 */
interface PlayerChangeDimensionEvent extends GameEvent {
  /**
   * The dimension id the player left, for example `minecraft:overworld`.
   *
   * Since runtime 1.5.0.
   */
  readonly from: string;
  /**
   * The player who moved.
   *
   * Since runtime 1.5.0.
   */
  readonly player: Player;
  /**
   * The dimension id the player arrived in, for example `minecraft:the_nether`.
   *
   * Since runtime 1.5.0.
   */
  readonly to: string;
}

/**
 * A player sent a chat message.
 *
 * Since runtime 1.5.0.
 */
interface PlayerChatEvent extends GameEvent {
  /**
   * Cancels the event: nobody sees the message.
   *
   * Since runtime 1.5.0.
   */
  cancel(): void;
  /**
   * The message as plain text.
   *
   * Since runtime 1.5.0.
   */
  readonly message: string;
  /**
   * The player who sent it.
   *
   * Since runtime 1.5.0.
   */
  readonly player: Player;
}

/** A player joined the server. */
interface PlayerJoinEvent extends GameEvent {
  /** The player who joined. */
  readonly player: Player;
}

/**
 * A player is leaving the server.
 *
 * Since runtime 1.5.0.
 */
interface PlayerLeaveEvent extends GameEvent {
  /**
   * The player leaving.
   *
   * Since runtime 1.5.0.
   */
  readonly player: Player;
}

/**
 * A player respawned after dying or returned from the End; `world` is the world they respawned in.
 *
 * Since runtime 1.5.0.
 */
interface PlayerRespawnEvent extends GameEvent {
  /**
   * The player, already in the new world.
   *
   * Since runtime 1.5.0.
   */
  readonly player: Player;
}

/**
 * A player's turn of the `player.tick` interval came round.
 *
 * Since runtime 1.5.0.
 */
interface PlayerTickEvent extends GameEvent {
  /**
   * The player.
   *
   * Since runtime 1.5.0.
   */
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

/**
 * What a ray hit, from `World.raycast` or `Entity.raycast`.
 *
 * Since runtime 1.5.0.
 */
interface RayHit {
  /**
   * The block hit, when `kind` is `"block"`.
   *
   * Since runtime 1.5.0.
   */
  readonly block?: BlockRef;
  /**
   * The distance from the ray's start to the hit in blocks.
   *
   * Since runtime 1.5.0.
   */
  readonly distance: number;
  /**
   * The entity hit, when `kind` is `"entity"`.
   *
   * Since runtime 1.5.0.
   */
  readonly entity?: Entity;
  /**
   * The face of the block the ray hit, when `kind` is `"block"`.
   *
   * Since runtime 1.5.0.
   */
  readonly face?: "down" | "up" | "north" | "south" | "west" | "east";
  /**
   * Whether the ray hit a block or an entity.
   *
   * Since runtime 1.5.0.
   */
  readonly kind: "block" | "entity";
  /**
   * The exact point the ray hit.
   *
   * Since runtime 1.5.0.
   */
  readonly pos: Pos;
}

/**
 * What a ray stops at: `fluids` (false by default) makes fluid surfaces count as blocks, `entities` (true by default) lets the ray hit living entities, and `ignore` is an entity the ray passes through.
 *
 * Since runtime 1.5.0.
 */
type RaycastOptions = { fluids?: boolean; entities?: boolean; ignore?: Entity };

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
   * Returns the container of the block at a position, or `undefined` when the block has no slots: chests, barrels, hoppers, furnaces, dispensers and the mod's own containers and machines have one, stone does not; for example `e.world.getContainer(e.pos)`. A double chest gives the half at the position.
   *
   * Since runtime 1.6.0.
   *
   * @param pos - The block position.
   */
  getContainer(pos: Pos): Container | undefined;
  /**
   * Plays a sound event at a position for nearby players. The id can be a vanilla sound event or a project sound key (for example `mymod:block.chime`) once the project declares it in `sounds.json`.
   *
   * @param id - The sound event id, for example `minecraft:block.note_block.bell`.
   * @param options - The volume and pitch, 1 by default.
   */
  playSound(id: string, pos: Pos, options?: { volume?: number; pitch?: number }): void;
  /**
   * Casts a ray and returns the first block or entity it hits, or `undefined` when it hits nothing in range; for example `world.raycast(player.pos.offset(0, 1.6, 0), player.look, 20)`.
   *
   * Since runtime 1.5.0.
   *
   * @param from - Where the ray starts.
   * @param direction - The direction as a vector, for example an entity's `look`; its length does not matter.
   * @param maxDistance - How far the ray goes in blocks, at most 128 (more is a `RangeError`).
   * @param options - What the ray stops at.
   */
  raycast(from: Pos, direction: Pos, maxDistance: number, options?: RaycastOptions): RayHit | undefined;
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
  export type BossBar = globalThis.BossBar;
  export type BossBarColor = globalThis.BossBarColor;
  export type BossBarStyle = globalThis.BossBarStyle;
  export type Container = globalThis.Container;
  export type DataStore = globalThis.DataStore;
  export type Entity = globalThis.Entity;
  export type EntityDamagedEvent = globalThis.EntityDamagedEvent;
  export type EntityDeathEvent = globalThis.EntityDeathEvent;
  export type EntityHurtEvent = globalThis.EntityHurtEvent;
  export type EntityInteractEvent = globalThis.EntityInteractEvent;
  export type EquipmentSlot = globalThis.EquipmentSlot;
  export type GameEvent = globalThis.GameEvent;
  export type GameMode = globalThis.GameMode;
  export type Inventory = globalThis.Inventory;
  export type InventorySlot = globalThis.InventorySlot;
  export type ItemRef = globalThis.ItemRef;
  export type ItemSpec = globalThis.ItemSpec;
  export type ItemUseEvent = globalThis.ItemUseEvent;
  export type Msm = globalThis.Msm;
  export type MsmActions = globalThis.MsmActions;
  export type MsmBossBars = globalThis.MsmBossBars;
  export type MsmEvents = globalThis.MsmEvents;
  export type MsmLog = globalThis.MsmLog;
  export type Player = globalThis.Player;
  export type PlayerChangeDimensionEvent = globalThis.PlayerChangeDimensionEvent;
  export type PlayerChatEvent = globalThis.PlayerChatEvent;
  export type PlayerJoinEvent = globalThis.PlayerJoinEvent;
  export type PlayerLeaveEvent = globalThis.PlayerLeaveEvent;
  export type PlayerRespawnEvent = globalThis.PlayerRespawnEvent;
  export type PlayerTickEvent = globalThis.PlayerTickEvent;
  export type Pos = globalThis.Pos;
  export type RayHit = globalThis.RayHit;
  export type RaycastOptions = globalThis.RaycastOptions;
  export type ServerStartedEvent = globalThis.ServerStartedEvent;
  export type ServerTickEvent = globalThis.ServerTickEvent;
  export type World = globalThis.World;
}
