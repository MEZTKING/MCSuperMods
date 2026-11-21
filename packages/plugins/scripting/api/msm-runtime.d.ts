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

/**
 * A player is about to place a block from a block item.
 *
 * Since runtime 1.5.2.
 */
interface BlockPlaceEvent extends GameEvent {
  /**
   * The id of the block the item places, for example `minecraft:oak_planks`.
   *
   * Since runtime 1.5.2.
   */
  readonly block: string;
  /**
   * Cancels the event: the block is not placed, the item is not used up and the player's screen is corrected.
   *
   * Since runtime 1.5.2.
   */
  cancel(): void;
  /**
   * The item being placed, as held before the placement.
   *
   * Since runtime 1.5.2.
   */
  readonly item: ItemRef;
  /**
   * The player placing it.
   *
   * Since runtime 1.5.2.
   */
  readonly player: Player;
  /**
   * Where the block would go (the clicked block itself when it can be replaced, such as grass, else the block next to the clicked face).
   *
   * Since runtime 1.5.2.
   */
  readonly pos: Pos;
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
 * Since runtime 1.5.1.
 */
interface BossBar {
  /**
   * Shows the bar to a player; adding a player twice does nothing.
   *
   * Since runtime 1.5.1.
   *
   * @param player - The player.
   */
  addPlayer(player: Player): void;
  /**
   * Returns the players the bar is shown to.
   *
   * Since runtime 1.5.1.
   */
  players(): Player[];
  /**
   * Hides the bar from everyone and removes it, so `msm.bossBars.get` no longer finds it.
   *
   * Since runtime 1.5.1.
   */
  remove(): void;
  /**
   * Hides the bar from a player.
   *
   * Since runtime 1.5.1.
   *
   * @param player - The player.
   */
  removePlayer(player: Player): void;
  /**
   * Changes the bar's colour, for example `bar.setColor("red")`.
   *
   * Since runtime 1.5.1.
   *
   * @param color - The colour.
   */
  setColor(color: BossBarColor): void;
  /**
   * Changes how full the bar is, for example `bar.setProgress(0.5)`.
   *
   * Since runtime 1.5.1.
   *
   * @param progress - How full the bar is, 0 to 1; values outside are clamped.
   */
  setProgress(progress: number): void;
  /**
   * Changes the bar's style, for example `bar.setStyle("notched_10")`.
   *
   * Since runtime 1.5.1.
   *
   * @param style - The style.
   */
  setStyle(style: BossBarStyle): void;
  /**
   * Changes the bar's title.
   *
   * Since runtime 1.5.1.
   *
   * @param title - The title as plain text.
   */
  setTitle(title: string): void;
}

/**
 * The colour of a boss bar.
 *
 * Since runtime 1.5.1.
 */
type BossBarColor = "pink" | "blue" | "red" | "green" | "yellow" | "purple" | "white";

/**
 * The style of a boss bar: one continuous bar or one divided into 6, 10, 12 or 20 notches.
 *
 * Since runtime 1.5.1.
 */
type BossBarStyle = "progress" | "notched_6" | "notched_10" | "notched_12" | "notched_20";

/**
 * A project command ran.
 *
 * Since runtime 1.5.2.
 */
interface CommandEvent extends GameEvent {
  /**
   * The values typed, by argument name: numbers as numbers, words and text as strings, `true` or `false`, a player or entity as its UUID, players as an array of names, a position or block position as `[x, y, z]`, an item or block as its id; an optional argument that was not typed is missing. A new object for each event.
   *
   * Since runtime 1.5.2.
   */
  readonly args: Record<string, unknown>;
  /**
   * The command's id in the project, for example `mypack:greet`.
   *
   * Since runtime 1.5.2.
   */
  readonly id: string;
  /**
   * The command's name, as typed without the slash, for example `greet`; also when one of its other names was typed.
   *
   * Since runtime 1.5.2.
   */
  readonly name: string;
  /**
   * Who ran it: the player (see `asPlayer()`) or the entity of an `execute as`, or `undefined` for the server console or a command block.
   *
   * Since runtime 1.5.2.
   */
  readonly source: Entity | undefined;
}

/**
 * The slots of a block with a container, from `World.getContainer`; read and written straight away, and writes update comparators next to the block, for example `world.getContainer(pos)?.add("minecraft:coal")`. Using it after the block is removed or replaced is a script error.
 *
 * Since runtime 1.5.1.
 */
interface Container {
  /**
   * Puts a stack in as a hopper would, filling matching stacks and then empty slots in slot order and skipping slots that do not take the item, whatever side hoppers may use; returns what did not fit, or `undefined` when everything fit. For example `const left = container.add({ id: "minecraft:coal", count: 64 })`.
   *
   * Since runtime 1.5.1.
   *
   * @param item - The stack to put in; its count may be more than one stack.
   */
  add(item: ItemSpec): ItemRef | undefined;
  /**
   * Returns how many of an item the container holds over all slots, for example `container.count("minecraft:coal")`.
   *
   * Since runtime 1.5.1.
   *
   * @param item - The item id, for example `minecraft:coal`.
   */
  count(item: string): number;
  /**
   * Returns a copy of the stack in a slot, or `undefined` when the slot is empty; for example `container.get(0)`. A slot outside 0 to `size - 1` is a `RangeError`.
   *
   * Since runtime 1.5.1.
   *
   * @param slot - The slot, 0 to `size - 1`.
   */
  get(slot: number): ItemRef | undefined;
  /**
   * Replaces the stack in a slot and returns `true`, or returns `false` and changes nothing when the container does not take that item in that slot (a furnace's result slot, a container item in a crate that keeps its contents); for example `container.set(0, { id: "minecraft:torch", count: 16 })`.
   *
   * Since runtime 1.5.1.
   *
   * @param slot - The slot, 0 to `size - 1`.
   * @param item - The new stack, at most the slot's stack size; `undefined` empties the slot.
   */
  set(slot: number, item?: ItemSpec): boolean;
  /**
   * The number of slots, numbered 0 to `size - 1`; for example 27 for a chest.
   *
   * Since runtime 1.5.1.
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

/**
 * An item lying in the world, as `World.itemsNear` finds it. Once it is gone (picked up, merged into another stack, despawned or removed) `remove()` and `setItem()` do nothing.
 *
 * Since runtime 1.5.2.
 */
interface DroppedItem {
  /**
   * How long it has been lying there in ticks (20 a second); vanilla removes an item at 6000 (five minutes).
   *
   * Since runtime 1.5.2.
   */
  readonly age: number;
  /**
   * A copy of the stack it holds now.
   *
   * Since runtime 1.5.2.
   */
  readonly item: ItemRef;
  /**
   * The UUID of the entity that dropped or threw it, or `undefined` when nothing did or that entity is not in the world (a player who has left).
   *
   * Since runtime 1.5.2.
   */
  readonly owner: string | undefined;
  /**
   * Where it is now, exactly.
   *
   * Since runtime 1.5.2.
   */
  readonly pos: Pos;
  /**
   * Removes the item from the world at once; it drops nothing else.
   *
   * Since runtime 1.5.2.
   */
  remove(): void;
  /**
   * Replaces the stack it holds; for example `d.setItem({ id: "minecraft:diamond", count: 3 })`.
   *
   * Since runtime 1.5.2.
   *
   * @param item - The new stack; a count over the item's stack size holds the stack size.
   */
  setItem(item: ItemSpec): void;
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
   * Returns this entity as a project vehicle with the `Vehicle` members, or `undefined` when it is not one; for example `const car = player.vehicle?.asVehicle()`.
   *
   * Since runtime 1.5.2.
   */
  asVehicle(): Vehicle | undefined;
  /**
   * Deals generic damage to the entity.
   *
   * @param amount - The damage in half hearts.
   */
  damage(amount: number): void;
  /**
   * Deals damage of a type, from an attacker, to the entity, for example `target.damage(4, { type: "minecraft:player_attack", attacker: player })`; an unknown damage type is a script error.
   *
   * Since runtime 1.5.1.
   *
   * @param amount - The damage in half hearts.
   * @param options - The damage type id (for example `minecraft:magic`; `minecraft:generic` by default), the entity responsible and the entity that hit (a projectile, for example).
   */
  damage(amount: number, options: { type?: string; attacker?: Entity; direct?: Entity }): void;
  /** Data saved on this entity for the script's namespace, at most 16 KiB per namespace; a player keeps it on respawn. */
  readonly data: DataStore;
  /**
   * Makes this entity get off what it rides; returns `false` when it rides nothing. For example `if (player.vehicle) player.dismount()`.
   *
   * Since runtime 1.5.2.
   */
  dismount(): boolean;
  /**
   * Returns the level of the mob effect (the amplifier plus 1), or 0 when the entity does not have it.
   *
   * @param id - The effect id, for example `minecraft:speed` or one of your own.
   */
  effectLevel(id: string): number;
  /**
   * Returns a copy of the stack in an equipment slot, or `undefined` when it is empty; for example `entity.equipment("head")`.
   *
   * Since runtime 1.5.1.
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
  /**
   * Whether this entity is a project vehicle (an `msm:vehicle`); `false` for players, mobs, boats and minecarts, even with riders.
   *
   * Since runtime 1.5.2.
   */
  readonly isVehicle: boolean;
  /** Kills the entity. */
  kill(): void;
  /** The direction the entity looks, as a vector of length 1. */
  readonly look: Pos;
  /** The maximum health in half hearts. */
  readonly maxHealth: number;
  /** The entity's display name as plain text. */
  readonly name: string;
  /**
   * The entities riding this one, in seat order (the first drives a vehicle); an empty array when none. A new array on every read.
   *
   * Since runtime 1.5.2.
   */
  readonly passengers: Entity[];
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
   * Since runtime 1.5.1.
   *
   * @param maxDistance - How far the ray goes in blocks, at most 128 (more is a `RangeError`).
   * @param options - What the ray stops at; it always passes through this entity.
   */
  raycast(maxDistance: number, options?: RaycastOptions): RayHit | undefined;
  /**
   * Removes the entity from the world at once, without dropping loot or experience and without death events or a death animation (unlike `kill()`). A player cannot be removed: calling it on a player is a `TypeError`.
   *
   * Since runtime 1.5.1.
   */
  remove(): void;
  /**
   * Removes the mob effect; returns `true` when the entity had it.
   *
   * @param id - The effect id, for example `minecraft:speed` or one of your own.
   */
  removeEffect(id: string): boolean;
  /**
   * Makes this entity get on another, as it would by itself: returns `true` when it now rides `vehicle`, `false` when it cannot (a full vehicle, a mob that takes no riders, sneaking, or for a short while after getting off something, vanilla's boarding cooldown). Riding itself, riding something that rides it, riding into another world and riding a player are refused (`false`), as with vanilla's `/ride`. An entity that rides something else gets off it first; for example `zombie.ride(chicken)`.
   *
   * Since runtime 1.5.2.
   *
   * @param vehicle - What to get on: a mob, a boat, a minecart, a project vehicle or any other entity.
   */
  ride(vehicle: Entity): boolean;
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
   * Since runtime 1.5.1.
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
   * Since runtime 1.5.1.
   *
   * @param pos - The position to move to.
   * @param options - The dimension id to move to (the current one by default) and the facing in degrees (unchanged by default).
   */
  teleport(pos: Pos, options: { dimension?: string; yaw?: number; pitch?: number }): void;
  /** The entity type id, for example `minecraft:zombie`. */
  readonly type: string;
  /** The entity's UUID as text. */
  readonly uuid: string;
  /**
   * What this entity rides, or `undefined` when it rides nothing: a project vehicle (then also a `Vehicle`, see `asVehicle()`), a boat, a minecart or a mount; for example `if (player.vehicle?.isVehicle) ...`.
   *
   * Since runtime 1.5.2.
   */
  readonly vehicle: Entity | undefined;
  /** The entity's motion in blocks per tick (x, y, z). */
  readonly velocity: Pos;
  /** The world the entity is in. */
  readonly world: World;
}

/**
 * A living entity took damage.
 *
 * Since runtime 1.5.1.
 */
interface EntityDamagedEvent extends GameEvent {
  /**
   * The damage it took in half hearts, after armour and effects.
   *
   * Since runtime 1.5.1.
   */
  readonly amount: number;
  /**
   * The entity that caused the damage, when there is one.
   *
   * Since runtime 1.5.1.
   */
  readonly attacker?: Entity;
  /**
   * The entity that hit, when there is one: an arrow rather than its shooter, for example.
   *
   * Since runtime 1.5.1.
   */
  readonly direct?: Entity;
  /**
   * The entity that was damaged.
   *
   * Since runtime 1.5.1.
   */
  readonly entity: Entity;
  /**
   * The damage type id, for example `minecraft:fall`.
   *
   * Since runtime 1.5.1.
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
   * Since runtime 1.5.1.
   */
  readonly direct?: Entity;
  /** The entity being hurt. */
  readonly entity: Entity;
  /**
   * The damage type id, for example `minecraft:fall` or `minecraft:player_attack`.
   *
   * Since runtime 1.5.1.
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
 * Since runtime 1.5.1.
 */
type EquipmentSlot = "mainhand" | "offhand" | "head" | "chest" | "legs" | "feet";

/**
 * Something is about to explode.
 *
 * Since runtime 1.5.2.
 */
interface ExplosionEvent extends GameEvent {
  /**
   * Cancels the event: nothing breaks and nothing is hurt or pushed. The bang and the smoke may still be seen and heard.
   *
   * Since runtime 1.5.2.
   */
  cancel(): void;
  /**
   * The type id of `source`, for example `minecraft:tnt` or `minecraft:creeper`, or `"block"` when there is no source.
   *
   * Since runtime 1.5.2.
   */
  readonly cause: string;
  /**
   * Keeps every block safe: entities are still hurt and pushed, but no block breaks, drops or catches fire. `cancel()` wins when both are called.
   *
   * Since runtime 1.5.2.
   */
  keepBlocks(): void;
  /**
   * The centre of the explosion, exactly.
   *
   * Since runtime 1.5.2.
   */
  readonly pos: Pos;
  /**
   * The explosion's power: 4 for TNT, 3 for a creeper, 6 for a charged creeper, 5 for a bed or respawn anchor.
   *
   * Since runtime 1.5.2.
   */
  readonly radius: number;
  /**
   * The entity that exploded (the primed TNT, the creeper, the fireball, the wind charge), or `undefined` for a block such as a bed or respawn anchor, or `World.explode`.
   *
   * Since runtime 1.5.2.
   */
  readonly source: Entity | undefined;
}

/** What every event object has. */
interface GameEvent {
  /** The world (dimension) the event happened in. */
  readonly world: World;
}

/**
 * A game mode.
 *
 * Since runtime 1.5.1.
 */
type GameMode = "survival" | "creative" | "adventure" | "spectator";

/**
 * A player's inventory; slots are read and written straight away, for example `player.inventory.set(0, "minecraft:torch")`.
 *
 * Since runtime 1.5.1.
 */
interface Inventory {
  /**
   * Returns how many of an item the inventory holds over all slots, for example `player.inventory.count("minecraft:diamond")`.
   *
   * Since runtime 1.5.1.
   *
   * @param item - The item id, for example `minecraft:diamond`.
   */
  count(item: string): number;
  /**
   * Returns the first numbered slot that holds an item, or -1 when none does; for example `player.inventory.find("minecraft:compass")`.
   *
   * Since runtime 1.5.1.
   *
   * @param item - The item id.
   */
  find(item: string): number;
  /**
   * Returns a copy of the stack in a slot, or `undefined` when the slot is empty; for example `player.inventory.get("offhand")`.
   *
   * Since runtime 1.5.1.
   *
   * @param slot - The slot, 0 to 35 or an equipment slot name.
   */
  get(slot: InventorySlot): ItemRef | undefined;
  /**
   * Removes up to a number of an item from the inventory and returns how many were removed, for example `player.inventory.remove("minecraft:emerald", 5)`.
   *
   * Since runtime 1.5.1.
   *
   * @param item - The item id.
   * @param count - How many to remove; all of them when omitted.
   */
  remove(item: string, count?: number): number;
  /**
   * The selected hotbar slot, 0 to 8.
   *
   * Since runtime 1.5.1.
   */
  readonly selectedSlot: number;
  /**
   * Replaces the stack in a slot, for example `player.inventory.set("head", "minecraft:carved_pumpkin")`.
   *
   * Since runtime 1.5.1.
   *
   * @param slot - The slot, 0 to 35 or an equipment slot name.
   * @param item - The new stack; `undefined` empties the slot.
   */
  set(slot: InventorySlot, item?: ItemSpec): void;
  /**
   * Sets or removes a data component of the stack in a slot, for example `player.inventory.setComponent(0, "minecraft:custom_name", "Lucky")`; does nothing on an empty slot, and a value that does not decode or validate is a script error (at most 64 KiB of JSON).
   *
   * Since runtime 1.5.1.
   *
   * @param slot - The slot, 0 to 35 or an equipment slot name.
   * @param id - The data component id, for example `minecraft:custom_name`.
   * @param value - The component's JSON value; `undefined` removes the component.
   */
  setComponent(slot: InventorySlot, id: string, value?: unknown): void;
  /**
   * The number of numbered slots, 36: 0 to 8 are the hotbar and 9 to 35 the main inventory.
   *
   * Since runtime 1.5.1.
   */
  readonly size: number;
}

/**
 * A player inventory slot: 0 to 8 are the hotbar, 9 to 35 the main inventory, or an equipment slot name; any other value is a `RangeError`.
 *
 * Since runtime 1.5.1.
 */
type InventorySlot = number | EquipmentSlot;

/** An item stack, copied at the time it was read: changing the game later does not change it. */
interface ItemRef {
  /**
   * The items this item holds, as copies: a bag's or other container item's contents (shulker boxes too) in slot order, then a bundle's in the bundle's order; empty slots are left out, and an item that holds nothing gives an empty array. Read-only: change a bag by giving the player a new stack.
   *
   * Since runtime 1.5.2.
   */
  readonly contents: ItemRef[];
  /** The number of items in the stack. */
  readonly count: number;
  /**
   * The damage the item has taken, 0 when it is new or cannot be damaged.
   *
   * Since runtime 1.5.1.
   */
  readonly damage: number;
  /**
   * Returns a copy of a data component's value as JSON (the form `/give` and data packs use), or `undefined` when the item does not have it; for example `item.getComponent("minecraft:damage")` is a number. At most 64 KiB of JSON is returned.
   *
   * Since runtime 1.5.1.
   *
   * @param id - The data component id, for example `minecraft:damage`.
   */
  getComponent(id: string): unknown;
  /**
   * Returns whether the item has a data component, for example `item.hasComponent("minecraft:custom_name")`.
   *
   * Since runtime 1.5.1.
   *
   * @param id - The data component id, for example `minecraft:enchantments`.
   */
  hasComponent(id: string): boolean;
  /** The item id, for example `minecraft:stick`. */
  readonly id: string;
  /**
   * The most items one stack of this item can hold, for example 64 or 1.
   *
   * Since runtime 1.5.1.
   */
  readonly maxCount: number;
  /**
   * The damage the item can take before it breaks, 0 when it cannot be damaged.
   *
   * Since runtime 1.5.1.
   */
  readonly maxDamage: number;
  /**
   * The item's display name as plain text, its custom name when it has one, for example `Diamond Sword`.
   *
   * Since runtime 1.5.1.
   */
  readonly name: string;
}

/**
 * An item to give or put in a slot: an item id such as `"minecraft:diamond"`, or `{ id, count?, components? }` where `components` maps component ids to their JSON values, for example `{ id: "minecraft:diamond_sword", components: { "minecraft:custom_name": "Edge" } }`; components that do not decode or validate are a script error, and at most 64 KiB of component JSON is accepted per call.
 *
 * Since runtime 1.5.1.
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

/**
 * A player pressed a project key bind.
 *
 * Since runtime 1.5.2.
 */
interface KeyPressedEvent extends GameEvent {
  /**
   * The key bind's id, for example `mypack:dash`.
   *
   * Since runtime 1.5.2.
   */
  readonly key: string;
  /**
   * The player who pressed the key.
   *
   * Since runtime 1.5.2.
   */
  readonly player: Player;
}

/**
 * A player let go of a project key bind.
 *
 * Since runtime 1.5.2.
 */
interface KeyReleasedEvent extends GameEvent {
  /**
   * The key bind's id, for example `mypack:dash`.
   *
   * Since runtime 1.5.2.
   */
  readonly key: string;
  /**
   * The player who let go of the key.
   *
   * Since runtime 1.5.2.
   */
  readonly player: Player;
}

/** The MSM runtime API, available to every script. */
interface Msm {
  /** Named handlers that definition events call through the `run_script` action. */
  readonly actions: MsmActions;
  /**
   * Boss bars of the script's namespace, at most 32; they are not saved and are removed on `/reload` and when the server stops.
   *
   * Since runtime 1.5.1.
   */
  readonly bossBars: MsmBossBars;
  /** Game events scripts can handle. */
  readonly events: MsmEvents;
  /**
   * Returns a loaded dimension, or `undefined` when the server has none of that id; for example `msm.getWorld("minecraft:the_end")`.
   *
   * Since runtime 1.5.1.
   *
   * @param dimension - The dimension id, for example `minecraft:the_nether`.
   */
  getWorld(dimension: string): World | undefined;
  /** Writes to the server log as `[msm_runtime] <script id>: <message>`. */
  readonly log: MsmLog;
  /**
   * Returns the players online, for example `msm.players().length`.
   *
   * Since runtime 1.5.1.
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
 * Since runtime 1.5.1.
 */
interface MsmBossBars {
  /**
   * Creates a boss bar shown to nobody yet, replacing a bar of the same name; for example `msm.bossBars.create("countdown", { title: "Time left", color: "red" })`. A 33rd bar is a script error.
   *
   * Since runtime 1.5.1.
   *
   * @param id - The bar's name within the script's namespace, for example `countdown`.
   * @param options - The title, the colour (`"white"` by default), the style (`"progress"` by default) and how full it is (1 by default).
   */
  create(id: string, options: { title: string; color?: BossBarColor; style?: BossBarStyle; progress?: number }): BossBar;
  /**
   * Returns the boss bar of a name, or `undefined` when there is none.
   *
   * Since runtime 1.5.1.
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
   * Since runtime 1.5.1.
   *
   * @param options - How often the handler runs for each player in ticks: 20 by default; a value under 5 counts as 5.
   */
  on(name: "player.tick", handler: (e: PlayerTickEvent) => void, options?: { interval?: number }): void;
  /**
   * Runs after a player respawns, for example to give a starting kit back. Several handlers run in registration order.
   *
   * Since runtime 1.5.1.
   */
  on(name: "player.respawn", handler: (e: PlayerRespawnEvent) => void): void;
  /**
   * Runs when a player leaves the server. Several handlers run in registration order.
   *
   * Since runtime 1.5.1.
   */
  on(name: "player.leave", handler: (e: PlayerLeaveEvent) => void): void;
  /**
   * Runs after a player moves to another dimension, for example through a Nether portal. Several handlers run in registration order.
   *
   * Since runtime 1.5.1.
   */
  on(name: "player.changeDimension", handler: (e: PlayerChangeDimensionEvent) => void): void;
  /**
   * Runs before a player's chat message is sent to the other players. Several handlers run in registration order.
   *
   * Since runtime 1.5.1.
   */
  on(name: "player.chat", handler: (e: PlayerChatEvent) => void): void;
  /**
   * Runs after a living entity took damage, with the final amount; also for the killing blow, before entity.death. Several handlers run in registration order.
   *
   * Since runtime 1.5.1.
   */
  on(name: "entity.damaged", handler: (e: EntityDamagedEvent) => void): void;
  /**
   * Runs when a player presses a project key bind (an `msm:key_bind`) and the press counts (its `when` and cooldown allow it), after the key bind's own `msm:on_press`; the runtime's own vehicle keys are not reported. Several handlers run in registration order.
   *
   * Since runtime 1.5.2.
   */
  on(name: "key.pressed", handler: (e: KeyPressedEvent) => void): void;
  /**
   * Runs when a player lets go of a project key bind whose press counted, after the key bind's own `msm:on_release`. Several handlers run in registration order.
   *
   * Since runtime 1.5.2.
   */
  on(name: "key.released", handler: (e: KeyReleasedEvent) => void): void;
  /**
   * Runs when a player gets into a project vehicle, after its `on_mount`. Several handlers run in registration order.
   *
   * Since runtime 1.5.2.
   */
  on(name: "vehicle.mounted", handler: (e: VehicleMountedEvent) => void): void;
  /**
   * Runs when a player gets out of a project vehicle (also when it is destroyed or they leave the game), after its `on_dismount`. Several handlers run in registration order.
   *
   * Since runtime 1.5.2.
   */
  on(name: "vehicle.dismounted", handler: (e: VehicleDismountedEvent) => void): void;
  /**
   * Runs after each shot of a project vehicle's weapon, after the weapon's `on_fire`. Several handlers run in registration order.
   *
   * Since runtime 1.5.2.
   */
  on(name: "vehicle.fired", handler: (e: VehicleFiredEvent) => void): void;
  /**
   * Runs when a project vehicle is destroyed, after its `on_destroy` and before its riders get out (`vehicle.dismounted` follows for each). Several handlers run in registration order.
   *
   * Since runtime 1.5.2.
   */
  on(name: "vehicle.destroyed", handler: (e: VehicleDestroyedEvent) => void): void;
  /**
   * Runs before a player places a block from a block item, wherever the block would go. Placing by dispensers, endermen and commands does not fire it. Several handlers run in registration order.
   *
   * Since runtime 1.5.2.
   */
  on(name: "block.place", handler: (e: BlockPlaceEvent) => void): void;
  /**
   * Runs before anything explodes: TNT, creepers, fireballs, wind charges, beds, respawn anchors and `World.explode`. Several handlers run in registration order.
   *
   * Since runtime 1.5.2.
   */
  on(name: "world.explosion", handler: (e: ExplosionEvent) => void): void;
  /**
   * Runs when a player or the server runs one of the project's commands, after the command's function and event and before its message back. Several handlers run in registration order.
   *
   * Since runtime 1.5.2.
   */
  on(name: "command", handler: (e: CommandEvent) => void): void;
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

/**
 * A vanilla particle options object: `type` names a particle type and the other fields are that type's options, as in vanilla's particle JSON, for example `{ type: "minecraft:dust", color: [1, 0.5, 0], scale: 1.5 }`, `{ type: "minecraft:block", block_state: "minecraft:stone" }` or `{ type: "minecraft:item", item: { id: "minecraft:diamond" } }`; fields that do not decode are a script error.
 *
 * Since runtime 1.5.1.
 */
type ParticleOptions = { type: string; [field: string]: unknown };

/** A player, wrapped for scripts. */
interface Player extends Entity {
  /**
   * Gives the player experience points, for example `player.addXp(10)`; levels go up as the points fill them.
   *
   * Since runtime 1.5.1.
   *
   * @param points - The points to add; a negative number takes points away.
   */
  addXp(points: number): void;
  /**
   * Gives the player experience levels, for example `player.addXpLevels(1)`.
   *
   * Since runtime 1.5.1.
   *
   * @param levels - The levels to add; a negative number takes levels away.
   */
  addXpLevels(levels: number): void;
  /**
   * Removes the title and subtitle from the player's screen.
   *
   * Since runtime 1.5.1.
   */
  clearTitle(): void;
  /**
   * The food level, 0 to 20.
   *
   * Since runtime 1.5.1.
   */
  readonly food: number;
  /**
   * The player's game mode, for example `"survival"`.
   *
   * Since runtime 1.5.1.
   */
  readonly gameMode: GameMode;
  /**
   * Gives the player items; what does not fit in the inventory is dropped at their feet.
   *
   * @param item - The item id, for example `minecraft:diamond`, or since runtime 1.5.1 an item with components, `{ id, count?, components? }`.
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
   * Hides a HUD element from this player until `showHud`. Returns `false` when the id is no HUD element of this game (logged once), else `true`; for example `player.hideHud("mypack:mana")`.
   *
   * Since runtime 1.5.2.
   *
   * @param id - The HUD element's id (an `msm:hud` of the project), for example `mypack:mana`.
   */
  hideHud(id: string): boolean;
  /**
   * The player's inventory, for example `player.inventory.count("minecraft:diamond")`.
   *
   * Since runtime 1.5.1.
   */
  readonly inventory: Inventory;
  /** Whether the player is in creative mode. */
  readonly isCreative: boolean;
  /** Whether the player is sneaking. */
  readonly isSneaking: boolean;
  /**
   * The saturation level, 0 up to the food level.
   *
   * Since runtime 1.5.1.
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
   * Since runtime 1.5.1.
   *
   * @param level - The food level, 0 to 20.
   * @param saturation - The saturation, unchanged by default; it is never more than the food level.
   */
  setFood(level: number, saturation?: number): void;
  /**
   * Changes the player's game mode, for example `player.setGameMode("adventure")`; returns `false` when the player was already in it.
   *
   * Since runtime 1.5.1.
   *
   * @param mode - The game mode.
   */
  setGameMode(mode: GameMode): boolean;
  /**
   * Sets the value a HUD element shows this player, as the `set_hud` action does; the player's screen updates within a quarter of a second. For an element that reads its value from the game (a score, the player or the vehicle) the next value that differs replaces it. Returns `false` when the id is no HUD element of this game (logged once) or the number is not finite, else `true`; for example `player.setHud("mypack:mana", 7)`. Any other value is a `TypeError`.
   *
   * Since runtime 1.5.2.
   *
   * @param id - The HUD element's id (an `msm:hud` of the project), for example `mypack:mana`.
   * @param value - A number (for a bar, icons or a number) or a text (cut to 256 characters).
   */
  setHud(id: string, value: number | string): boolean;
  /**
   * Sets the player's experience level, for example `player.setXpLevels(30)`.
   *
   * Since runtime 1.5.1.
   *
   * @param levels - The new level, 0 or more.
   */
  setXpLevels(levels: number): void;
  /**
   * Shows text above the player's hotbar for a few seconds, for example `player.showActionBar("Mana: 7")`.
   *
   * Since runtime 1.5.1.
   *
   * @param text - The text as plain text.
   */
  showActionBar(text: string): void;
  /**
   * Shows a HUD element to this player, also one that starts hidden, until `hideHud`; an element with a `show` rule (such as only in a vehicle) still follows it. Returns `false` when the id is no HUD element of this game (logged once), else `true`; for example `player.showHud("mypack:mana")`.
   *
   * Since runtime 1.5.2.
   *
   * @param id - The HUD element's id (an `msm:hud` of the project), for example `mypack:mana`.
   */
  showHud(id: string): boolean;
  /**
   * Shows a title in the middle of the player's screen, for example `player.showTitle("Wave 3", { subtitle: "Get ready" })`.
   *
   * Since runtime 1.5.1.
   *
   * @param title - The title as plain text.
   * @param options - A subtitle and the fade in, stay and fade out times in ticks (10, 70 and 20 by default).
   */
  showTitle(title: string, options?: { subtitle?: string; fadeIn?: number; stay?: number; fadeOut?: number }): void;
  /**
   * The player's experience level.
   *
   * Since runtime 1.5.1.
   */
  readonly xpLevel: number;
  /**
   * The total experience points the player has collected.
   *
   * Since runtime 1.5.1.
   */
  readonly xpPoints: number;
}

/**
 * A player moved to another dimension; `world` is the new one.
 *
 * Since runtime 1.5.1.
 */
interface PlayerChangeDimensionEvent extends GameEvent {
  /**
   * The dimension id the player left, for example `minecraft:overworld`.
   *
   * Since runtime 1.5.1.
   */
  readonly from: string;
  /**
   * The player who moved.
   *
   * Since runtime 1.5.1.
   */
  readonly player: Player;
  /**
   * The dimension id the player arrived in, for example `minecraft:the_nether`.
   *
   * Since runtime 1.5.1.
   */
  readonly to: string;
}

/**
 * A player sent a chat message.
 *
 * Since runtime 1.5.1.
 */
interface PlayerChatEvent extends GameEvent {
  /**
   * Cancels the event: nobody sees the message.
   *
   * Since runtime 1.5.1.
   */
  cancel(): void;
  /**
   * The message as plain text.
   *
   * Since runtime 1.5.1.
   */
  readonly message: string;
  /**
   * The player who sent it.
   *
   * Since runtime 1.5.1.
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
 * Since runtime 1.5.1.
 */
interface PlayerLeaveEvent extends GameEvent {
  /**
   * The player leaving.
   *
   * Since runtime 1.5.1.
   */
  readonly player: Player;
}

/**
 * A player respawned after dying or returned from the End; `world` is the world they respawned in.
 *
 * Since runtime 1.5.1.
 */
interface PlayerRespawnEvent extends GameEvent {
  /**
   * The player, already in the new world.
   *
   * Since runtime 1.5.1.
   */
  readonly player: Player;
}

/**
 * A player's turn of the `player.tick` interval came round.
 *
 * Since runtime 1.5.1.
 */
interface PlayerTickEvent extends GameEvent {
  /**
   * The player.
   *
   * Since runtime 1.5.1.
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
 * Since runtime 1.5.1.
 */
interface RayHit {
  /**
   * The block hit, when `kind` is `"block"`.
   *
   * Since runtime 1.5.1.
   */
  readonly block?: BlockRef;
  /**
   * The distance from the ray's start to the hit in blocks.
   *
   * Since runtime 1.5.1.
   */
  readonly distance: number;
  /**
   * The entity hit, when `kind` is `"entity"`.
   *
   * Since runtime 1.5.1.
   */
  readonly entity?: Entity;
  /**
   * The face of the block the ray hit, when `kind` is `"block"`.
   *
   * Since runtime 1.5.1.
   */
  readonly face?: "down" | "up" | "north" | "south" | "west" | "east";
  /**
   * Whether the ray hit a block or an entity.
   *
   * Since runtime 1.5.1.
   */
  readonly kind: "block" | "entity";
  /**
   * The exact point the ray hit.
   *
   * Since runtime 1.5.1.
   */
  readonly pos: Pos;
}

/**
 * What a ray stops at: `fluids` (false by default) makes fluid surfaces count as blocks, `entities` (true by default) lets the ray hit living entities, and `ignore` is an entity the ray passes through.
 *
 * Since runtime 1.5.1.
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

/**
 * A project vehicle (an `msm:vehicle`): an `Entity` with fuel, damage, ammunition and a driver, read and written straight away on the server. Every vehicle object a script gets (`asVehicle()`, `vehicle.*` events, `entitiesNear`) has these members; for example `msm.events.on("vehicle.mounted", (e) => e.vehicle.setFuel(1200))`.
 *
 * Since runtime 1.5.2.
 */
interface Vehicle extends Entity {
  /**
   * Returns the rounds loaded in a weapon; 0 for a weapon without ammunition. An unknown id or index is a `RangeError`; for example `vehicle.ammo("cannon")`.
   *
   * Since runtime 1.5.2.
   *
   * @param weapon - The weapon's `id` in the vehicle's definition, or its index from 0.
   */
  ammo(weapon: string | number): number;
  /**
   * The damage the vehicle has taken, from 0 (as new) up to its `health.max`; it never heals by itself. (`damage(amount)`, inherited from `Entity`, deals more.)
   *
   * Since runtime 1.5.2.
   */
  readonly damageTaken: number;
  /**
   * The player in the first seat, who drives, or `undefined`.
   *
   * Since runtime 1.5.2.
   */
  readonly driver: Player | undefined;
  /**
   * Ticks of driving left in the tank; always 0 for a vehicle that needs no fuel.
   *
   * Since runtime 1.5.2.
   */
  readonly fuel: number;
  /**
   * Sets the rounds loaded in a weapon, kept between 0 and its capacity (0 for a weapon without ammunition). An unknown id or index is a `RangeError`; for example `vehicle.setAmmo(0, 10)`.
   *
   * Since runtime 1.5.2.
   *
   * @param weapon - The weapon's `id` in the vehicle's definition, or its index from 0.
   * @param rounds - The rounds, rounded down.
   */
  setAmmo(weapon: string | number, rounds: number): void;
  /**
   * Sets the damage taken; 0 repairs it fully. At or above the vehicle's `health.max` it is destroyed as by damage: its `on_destroy` and `vehicle.destroyed` (without a player) run, the riders get out, it explodes when it is set to and drops its item and storage.
   *
   * Since runtime 1.5.2.
   *
   * @param amount - The damage; below 0 counts as 0.
   */
  setDamageTaken(amount: number): void;
  /**
   * Sets the fuel, rounded down and kept between 0 and the tank's capacity (0 for a vehicle that needs no fuel); for example `vehicle.setFuel(vehicle.fuel + 200)`.
   *
   * Since runtime 1.5.2.
   *
   * @param ticks - Ticks of driving.
   */
  setFuel(ticks: number): void;
}

/**
 * A project vehicle is being destroyed.
 *
 * Since runtime 1.5.2.
 */
interface VehicleDestroyedEvent extends GameEvent {
  /**
   * The player who destroyed it, or `undefined` (a mob, an explosion, `setDamage`).
   *
   * Since runtime 1.5.2.
   */
  readonly player: Player | undefined;
  /**
   * The vehicle, still in the world with its riders.
   *
   * Since runtime 1.5.2.
   */
  readonly vehicle: Vehicle;
}

/**
 * A player got out of a project vehicle.
 *
 * Since runtime 1.5.2.
 */
interface VehicleDismountedEvent extends GameEvent {
  /**
   * The player who got out.
   *
   * Since runtime 1.5.2.
   */
  readonly player: Player;
  /**
   * The vehicle.
   *
   * Since runtime 1.5.2.
   */
  readonly vehicle: Vehicle;
}

/**
 * A project vehicle's weapon fired one shot.
 *
 * Since runtime 1.5.2.
 */
interface VehicleFiredEvent extends GameEvent {
  /**
   * The player who fired.
   *
   * Since runtime 1.5.2.
   */
  readonly player: Player;
  /**
   * The vehicle.
   *
   * Since runtime 1.5.2.
   */
  readonly vehicle: Vehicle;
  /**
   * The weapon's `id` in the vehicle's definition.
   *
   * Since runtime 1.5.2.
   */
  readonly weapon: string;
}

/**
 * A player got into a project vehicle.
 *
 * Since runtime 1.5.2.
 */
interface VehicleMountedEvent extends GameEvent {
  /**
   * The player who got in; `e.vehicle.driver` tells whether they drive.
   *
   * Since runtime 1.5.2.
   */
  readonly player: Player;
  /**
   * The vehicle.
   *
   * Since runtime 1.5.2.
   */
  readonly vehicle: Vehicle;
}

/** One loaded dimension of the server. */
interface World {
  /**
   * Breaks a block as if it were mined, with the breaking sound and particles, leaving air (or the fluid it held); for example `world.breakBlock(e.pos, { drops: false })`. Returns `false` when there was nothing to break (air).
   *
   * Since runtime 1.5.1.
   *
   * @param pos - The block to break (the block that contains the position).
   * @param options - `drops` (`true` by default): whether the block drops what it would drop when broken without a tool, as an explosion or `/setblock ... destroy` does.
   */
  breakBlock(pos: Pos, options?: { drops?: boolean }): boolean;
  /**
   * The time of day in ticks, 0 to 23999: 0 is sunrise, 6000 noon, 13000 nightfall and 18000 midnight. It follows this dimension's own clock, or the Overworld's in a dimension without one (such as the Nether).
   *
   * Since runtime 1.5.1.
   */
  readonly dayTime: number;
  /** The dimension id, for example `minecraft:overworld`. */
  readonly dimension: string;
  /**
   * Drops an item on the ground as a block drops its loot, with a small random push; for example `world.dropItem(e.pos.offset(0.5, 1, 0.5), { id: "minecraft:diamond", count: 3 })`.
   *
   * Since runtime 1.5.1.
   *
   * @param pos - Where the item appears, exactly (use `pos.offset(0.5, 0.5, 0.5)` for the middle of a block).
   * @param item - The item; a count over the item's stack size is dropped as several stacks, at most 64 stacks (more is a `RangeError`).
   */
  dropItem(pos: Pos, item: ItemSpec): void;
  /**
   * Returns the living entities within a radius of a position.
   *
   * @param radius - The radius in blocks.
   */
  entitiesNear(pos: Pos, radius: number): Entity[];
  /**
   * Makes an explosion that no entity caused; for example `world.explode(e.pos, 2, { breaksBlocks: false })`.
   *
   * Since runtime 1.5.1.
   *
   * @param pos - The centre of the explosion, exactly.
   * @param power - The strength from 0 to 10 (anything else is a `RangeError`): 1 is about a fireball, 4 TNT, 6 a charged creeper.
   * @param options - `fire` (`false` by default) sets fires around it; `breaksBlocks` (`true` by default) breaks blocks, which then drop as from a bed exploding (the `block_explosion_drop_decay` game rule applies). Entities are always hurt and pushed.
   */
  explode(pos: Pos, power: number, options?: { fire?: boolean; breaksBlocks?: boolean }): void;
  /** Returns the block state at a position as `namespace:id[property=value,...]`. */
  getBlock(pos: Pos): string;
  /**
   * Returns the container of the block at a position, or `undefined` when the block has no slots: chests, barrels, hoppers, furnaces, dispensers and the mod's own containers and machines have one, stone does not; for example `e.world.getContainer(e.pos)`. A double chest gives the half at the position.
   *
   * Since runtime 1.5.1.
   *
   * @param pos - The block position.
   */
  getContainer(pos: Pos): Container | undefined;
  /**
   * Whether it is raining (or thundering) in this dimension. Always `false` in a dimension without an open sky, such as the Nether and the End. It changes as soon as the weather changes, while the rain on screen fades in over a few seconds.
   *
   * Since runtime 1.5.1.
   */
  readonly isRaining: boolean;
  /**
   * Whether there is a thunderstorm in this dimension. Always `false` in a dimension without an open sky.
   *
   * Since runtime 1.5.1.
   */
  readonly isThundering: boolean;
  /**
   * Returns the items lying on the ground (dropped, thrown or spilled) within a radius of a position; `entitiesNear` keeps returning living entities only. For example `for (const d of world.itemsNear(e.pos, 4)) if (d.item.id === "minecraft:rotten_flesh") d.remove();`.
   *
   * Since runtime 1.5.2.
   *
   * @param radius - The radius in blocks.
   */
  itemsNear(pos: Pos, radius: number): DroppedItem[];
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
   * Since runtime 1.5.1.
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
   * Sets the weather of the whole server (every dimension shares it), as `/weather` does; for example `world.setWeather("thunder", 60)`. Another kind is a `TypeError`.
   *
   * Since runtime 1.5.1.
   *
   * @param kind - The new weather.
   * @param seconds - How long it lasts, more than 0 and at most 1000000 (anything else is a `RangeError`); when left out, the game picks a length as `/weather` does.
   */
  setWeather(kind: "clear" | "rain" | "thunder", seconds?: number): void;
  /**
   * Spawns an entity of a type at a position; returns `undefined` when it could not be spawned.
   *
   * @param id - The entity type id, for example `minecraft:zombie`.
   */
  spawnEntity(id: string, pos: Pos): Entity | undefined;
  /**
   * Spawns particles at a position for nearby players. A particle that does not decode (an unknown id, a type that needs options given as an id, an options object with a wrong field) is a `TypeError`.
   *
   * Options objects, `motion` and `force`: since runtime 1.5.1.
   *
   * @param particle - A particle type without options, for example `minecraft:flame` or a project particle such as `mymod:spark`, or a vanilla particle options object such as `{ type: "minecraft:dust", color: [1, 0.5, 0], scale: 1.5 }`.
   * @param options - `count` particles (1 by default; at most 1000 with `motion`), placed at a random offset of about `spread` blocks on each axis (a Gaussian with that standard deviation, 0 by default) and moving at a random speed of about `speed` (0 by default). `motion` (`[x, y, z]` in blocks per tick) gives each particle exactly that velocity instead of the random one, sending one packet per particle; `speed` is then not used. `force` sends to players up to 512 blocks away and draws whatever their Particles setting, as `/particle ... force`.
   */
  spawnParticle(particle: string | ParticleOptions, pos: Pos, options?: { count?: number; spread?: number; speed?: number; motion?: [number, number, number]; force?: boolean }): void;
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
  export type BlockPlaceEvent = globalThis.BlockPlaceEvent;
  export type BlockRef = globalThis.BlockRef;
  export type BossBar = globalThis.BossBar;
  export type BossBarColor = globalThis.BossBarColor;
  export type BossBarStyle = globalThis.BossBarStyle;
  export type CommandEvent = globalThis.CommandEvent;
  export type Container = globalThis.Container;
  export type DataStore = globalThis.DataStore;
  export type DroppedItem = globalThis.DroppedItem;
  export type Entity = globalThis.Entity;
  export type EntityDamagedEvent = globalThis.EntityDamagedEvent;
  export type EntityDeathEvent = globalThis.EntityDeathEvent;
  export type EntityHurtEvent = globalThis.EntityHurtEvent;
  export type EntityInteractEvent = globalThis.EntityInteractEvent;
  export type EquipmentSlot = globalThis.EquipmentSlot;
  export type ExplosionEvent = globalThis.ExplosionEvent;
  export type GameEvent = globalThis.GameEvent;
  export type GameMode = globalThis.GameMode;
  export type Inventory = globalThis.Inventory;
  export type InventorySlot = globalThis.InventorySlot;
  export type ItemRef = globalThis.ItemRef;
  export type ItemSpec = globalThis.ItemSpec;
  export type ItemUseEvent = globalThis.ItemUseEvent;
  export type KeyPressedEvent = globalThis.KeyPressedEvent;
  export type KeyReleasedEvent = globalThis.KeyReleasedEvent;
  export type Msm = globalThis.Msm;
  export type MsmActions = globalThis.MsmActions;
  export type MsmBossBars = globalThis.MsmBossBars;
  export type MsmEvents = globalThis.MsmEvents;
  export type MsmLog = globalThis.MsmLog;
  export type ParticleOptions = globalThis.ParticleOptions;
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
  export type Vehicle = globalThis.Vehicle;
  export type VehicleDestroyedEvent = globalThis.VehicleDestroyedEvent;
  export type VehicleDismountedEvent = globalThis.VehicleDismountedEvent;
  export type VehicleFiredEvent = globalThis.VehicleFiredEvent;
  export type VehicleMountedEvent = globalThis.VehicleMountedEvent;
  export type World = globalThis.World;
}
