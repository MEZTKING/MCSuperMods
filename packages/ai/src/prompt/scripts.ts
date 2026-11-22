/**
 * Triggers, saved data, the Script API's first events, Script API 1.1, 1.4 and 1.6, and the
 * table of every Script API version the prompt names (B681; made true by B682, F8 b).
 */
import { list } from './core';
import { notAvailable } from './not-available';

/** What one Script API version adds, as the prompt names it. */
export interface ScriptApiPromptVersion {
  /**
   * The runtime release whose members say "Since runtime <release>." in `script-api-v1.json`;
   * `null` for the first API, whose members say no release.
   */
  readonly runtime: string | null;
  /**
   * The members the paragraph names, as paths of the JSON: `Type.member`, `msm.member`, a type
   * name or an alias name (a member whose own doc or one of whose overloads names the release).
   */
  readonly members: readonly string[];
  /** The events the paragraph names, by their `msm.events.on` name. */
  readonly events: readonly string[];
}

const version = (
  runtime: string | null,
  members: readonly string[],
  events: readonly string[],
): ScriptApiPromptVersion =>
  Object.freeze({
    runtime,
    members: Object.freeze([...members]),
    events: Object.freeze([...events]),
  });

/**
 * Every Script API version and what its paragraph names (ADR 0125 D7). Every event of the API
 * is named by one version here, so a version without a paragraph fails the truth test (B683),
 * as the missing 1.6 paragraph should have (F8 b).
 */
export const SCRIPT_API_PROMPT_VERSIONS = Object.freeze({
  '1.0': version(
    null,
    [
      'msm.events',
      'msm.actions',
      'msm.schedule',
      'msm.storage',
      'Entity.data',
      'Entity.runCommand',
      'Entity.runFunction',
      'World.runCommand',
      'World.runFunction',
    ],
    [
      'block.interact',
      'block.break',
      'item.use',
      'entity.interact',
      'entity.hurt',
      'entity.death',
      'player.join',
      'server.started',
      'server.tick',
    ],
  ),
  '1.1': version(
    '1.5.1',
    [
      'Player.inventory',
      'Inventory',
      'Entity.equipment',
      'Entity.setEquipment',
      'ItemRef.name',
      'Player.food',
      'Player.saturation',
      'Player.showTitle',
      'Player.showActionBar',
      'Player.clearTitle',
      'msm.bossBars',
      'Entity.damage',
      'World.raycast',
      'Entity.raycast',
      'Entity.teleport',
      'msm.getWorld',
      'msm.players',
    ],
    [
      'player.tick',
      'player.respawn',
      'player.leave',
      'player.changeDimension',
      'player.chat',
      'entity.damaged',
    ],
  ),
  '1.2': version('1.5.1', ['World.getContainer', 'Container'], []),
  '1.3': version('1.5.1', ['ParticleOptions'], []),
  '1.4': version(
    '1.5.1',
    [
      'World.dayTime',
      'World.isRaining',
      'World.isThundering',
      'World.setWeather',
      'World.explode',
      'World.dropItem',
      'World.breakBlock',
      'Entity.remove',
    ],
    [],
  ),
  '1.5': version(
    '1.5.2',
    [
      'Player.showHud',
      'Player.hideHud',
      'Player.setHud',
      'Entity.vehicle',
      'Entity.passengers',
      'Entity.isVehicle',
      'Entity.asVehicle',
      'Vehicle',
      'Vehicle.setFuel',
      'Vehicle.damageTaken',
      'Vehicle.setDamageTaken',
      'Vehicle.setAmmo',
      'Vehicle.driver',
    ],
    [
      'key.pressed',
      'key.released',
      'vehicle.mounted',
      'vehicle.dismounted',
      'vehicle.fired',
      'vehicle.destroyed',
    ],
  ),
  '1.6': version(
    '1.5.2',
    [
      'World.itemsNear',
      'DroppedItem',
      'DroppedItem.age',
      'DroppedItem.owner',
      'DroppedItem.setItem',
      'Entity.ride',
      'Entity.dismount',
      'ItemRef.contents',
      'BlockPlaceEvent.cancel',
      'ExplosionEvent.radius',
      'ExplosionEvent.cause',
      'ExplosionEvent.keepBlocks',
      'CommandEvent.args',
    ],
    ['block.place', 'world.explosion', 'command'],
  ),
  '1.7': version(
    '1.5.3',
    [
      'World.gameRule',
      'World.setGameRule',
      'Player.stat',
      'Player.addStat',
      'Player.openDialog',
      'ActionEvent.args',
    ],
    [
      'item.crafted',
      'item.picked_up',
      'player.ate',
      'player.slept',
      'player.woke',
      'player.advancement',
    ],
  ),
} as const);

const V = SCRIPT_API_PROMPT_VERSIONS;
export const TRIGGERS = `- Triggers: items fire events with "msm:on_hit" (the holder, player or mob, hits an entity; "other" is the entity hit), "msm:on_use_on_block" (cooldown_ticks), "msm:while_held" (interval_ticks, hand "main", "off" or "either") and "msm:while_worn" (interval_ticks; only with "msm:armor", in its slot); blocks with "msm:on_break", "msm:on_place", "msm:on_random_tick" (chance 0 to 1) and "msm:on_entity_inside" (cooldown_ticks; only for blocks an entity can stand in, such as a non-full "msm:shape"); mobs with "msm:on_tick" (interval_ticks) and "msm:on_spawn". Every component names an event declared in the element's "events". Intervals and cooldowns are at least 5 ticks; prefer 20 or more, and keep interval triggers that run run_function or run_script slow, as the game skips firings under heavy load. A held or worn effect is an apply_effect action whose duration is longer than the interval, so it never runs out while the item is in place.`;

export const SAVED_DATA = `- Saved data in scripts: Entity.data (so player.data) keeps JSON values on an entity and msm.storage keeps them with the world; both have get, set, has, remove and keys, belong to the script's namespace, and survive /reload, restarts, death and dimension changes. Values are copied in and out, so read, change and set again; get returns unknown, so check the type. Keys are at most 64 characters, an entity holds at most 16 KiB and the world at most 1 MiB per namespace; anything else, and functions or NaN, is an error. msm.schedule is not saved: rebuild timers from stored data in a "server.started" handler. There are no no-code conditions on stored data; use a script.`;

export const SCRIPT_API_10 = `- Scripts: an "msm:script" element is JavaScript the runtime runs on the server: msm.events.on(name, handler) listens to an event, msm.actions.define(id, handler) answers the run_script action and msm.schedule(ticks, fn) runs later. The first events are ${list(V['1.0'].events)}; the first five can be cancelled with e.cancel(). Each Script API version below adds to these.`;

export const SCRIPT_API_11 = `- Script API 1.1 adds, so do not use commands for these: player.inventory (get, set, count, remove, find, setComponent; slots 0 to 35 or "mainhand", "offhand", "head", "chest", "legs", "feet"), Entity.equipment and setEquipment, ItemRef name and component reads, XP and levels, food and saturation, game mode, showTitle, showActionBar and clearTitle, msm.bossBars (at most 32 per namespace, not saved), Entity.damage with a type and an attacker, World.raycast and Entity.raycast (at most 128 blocks), Entity.teleport across dimensions, msm.getWorld and msm.players. New events: player.tick (use it instead of server.tick loops; interval at least 5 ticks), player.respawn, player.leave, player.changeDimension, player.chat and entity.damaged. Read the script API tool for exact signatures. ${notAvailable('script-damage-amount')} For custom commands and creative tabs use the "msm:command" and "msm:creative_tab" kinds (below).`;

export const SCRIPT_API_14 = `- Script API 1.4 adds world.dayTime (0 sunrise, 6000 noon, 13000 nightfall, 18000 midnight), world.isRaining and world.isThundering (false in the Nether, the End and where there is no open sky; weather is server-wide), world.setWeather("clear" | "rain" | "thunder", seconds?), world.explode(pos, power 0 to 10, { fire?, breaksBlocks? }) with no causing entity, world.dropItem(pos, item), world.breakBlock(pos, { drops? }) (false for air) and Entity.remove(), which discards a mob with no loot, experience or death events (a player cannot be removed; kill() drops loot). Positions are exact, so add 0.5 to a block position for its centre. Prefer these to runCommand.`;

export const SCRIPT_API_16 = `- Script API 1.6 adds the events ${list(V['1.6'].events)}: block.place before a player places a block from a block item (e.pos, e.block, e.item, e.player; e.cancel() places nothing and keeps the item; dispensers, endermen and commands do not fire it), world.explosion before anything explodes, world.explode too (e.pos, e.radius the power, e.source, e.cause a type id or "block"; e.cancel(), or e.keepBlocks() to break no block), and command after a project command's function and event (e.id, e.name, e.source, e.args by argument name). Also world.itemsNear(pos, radius), the DroppedItem objects on the ground (item, pos, age in ticks, owner, remove(), setItem(item)), Entity.ride(vehicle) and Entity.dismount() (false when refused, as /ride), and ItemRef.contents, what a bag, shulker box or bundle holds (read-only). Rules on "block_placed", "any_block_placed" and "explosion" (stop_placing, stop_explosion, keep_blocks_safe) need no hand-written script.`;
