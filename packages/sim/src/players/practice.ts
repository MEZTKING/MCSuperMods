/**
 * Practice players at work (B728, ADR 0132 D10, amending ADR 0117 limit M14): up to seven stand-in
 * players beside Try it's own, driven from the panel "Your game" and by a type's round script
 * (`app/src/renderer/src/gamehub/rounds/`). Commands see them as players (`@a`, `@p`, `@r`, `@e`,
 * a name, `execute as`); this controller moves them and does what they do:
 *
 * - **join** (stand at a place, on a team) and **leave** (no selector finds them until they
 *   join again; their scores and tags stay, as a player's do while away);
 * - **walk** to a place, into an area or beside another player, at a sprint, stepping up one
 *   block, falling where there is no ground down to the area's invisible floor, as you do
 *   (outside the area's columns there is no ground to know, so a practice player stands where
 *   it is; one put below the floor falls into the void);
 * - **hit** another player (5 health a hit, two and a half hearts; armour, weapons and
 *   enchantments count only in Minecraft) or a thing such as a shop's interaction (`execute on
 *   attacker` finds the hitter); **knock out** (a hit that kills at once);
 * - **break the block under** a player (in adventure mode only with an item whose `can_break`
 *   names the block, as in the game) or a block at a place;
 * - **use** an item (its `consume_item` advancements fire, as eating does);
 * - **type** one of the game's commands (`/trigger withdraw`).
 *
 * A death with a killer moves the kill scores (`playerDies`) and fires the killer's
 * `player_killed_entity` and the victim's `entity_killed_player` advancements of the project,
 * as the game gives them, right after the death and before the next tick. A fall below the world
 * (world y -128) kills; a hit in the last five seconds gives that kill to the hitter.
 *
 * Pure and deterministic like the rest of the package: the same actions give the same round.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { FunctionEngine } from '../commands/functions.js';
import { KILL_CREDIT_TICKS, nbtMatches, playerHearts } from '../commands/games-commands.js';
import { PREVIEW_PLAYER_NAME } from '../commands/parse.js';
import { holderOf, parseSnbt, type SimAdvancement } from '../commands/vanilla.js';
import { PLAYER } from '../events/actions.js';
import type { BlockPos, BlockShapes, SimLog, Vec3 } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import type { CommandActor } from './actor.js';
import type { PracticeState } from './roster.js';

/** Blocks a practice player walks in a tick (a sprint, about 5.6 blocks a second; approximate). */
export const PRACTICE_WALK_SPEED = 0.28;

/** Health a practice hit takes (a stone sword's, as observed; armour is not counted). */
export const PRACTICE_HIT_DAMAGE = 5;

/** The world height below which a player dies in the void (the Overworld's bottom less 64). */
export const VOID_Y = -128;

/** How close counts as there already. */
const ARRIVED = 0.001;

/** A place an action names: world positions, an area of the project, or beside a player. */
export type PracticePlace =
  | { readonly pos: readonly [number, number, number] }
  | { readonly area: string }
  | { readonly player: string };

/** What a practice player (or, for some, Try it's own player, named `Player`) does. */
export type PracticeAction =
  | {
      readonly do: 'join';
      readonly who: string;
      readonly team?: string;
      readonly at?: PracticePlace;
    }
  | { readonly do: 'leave'; readonly who: string }
  | { readonly do: 'walk'; readonly who: string; readonly to: PracticePlace }
  | { readonly do: 'hit'; readonly who: string; readonly target: string; readonly damage?: number }
  | { readonly do: 'knock_out'; readonly who: string; readonly by?: string }
  | { readonly do: 'break_under'; readonly who: string; readonly target?: string }
  | { readonly do: 'break'; readonly who: string; readonly at: readonly [number, number, number] }
  | { readonly do: 'hit_thing'; readonly who: string; readonly type: string }
  | { readonly do: 'use'; readonly who: string; readonly item: string }
  | { readonly do: 'type'; readonly who: string; readonly line: string };

/** What an action did, in plain words for the panel and What happened. */
export interface PracticeOutcome {
  readonly ok: boolean;
  readonly said: string;
}

/** One player's row for the panel "Your game" and the Game tab's live view. */
export interface PracticeView {
  readonly name: string;
  readonly online: boolean;
  readonly dead: boolean;
  /** Health and most health in half hearts (2 a heart), as the hearts row draws them. */
  readonly health: number;
  readonly most: number;
  /** The team's name and chat colour, or `null`. */
  readonly team: string | null;
  readonly colour: string | null;
  readonly gameMode: string;
  /** Feet, in world positions (rounded to a tenth). */
  readonly pos: readonly [number, number, number];
  readonly walking: boolean;
}

/** What the controller works on. */
export interface PracticeHost {
  readonly world: SimWorld;
  readonly shapes: BlockShapes;
  readonly functions: FunctionEngine;
  readonly log: SimLog;
  now(): number;
  /** An area of the project in the test area (`min`, `max` in area positions), or `undefined`. */
  area(id: string): { readonly min: BlockPos; readonly max: BlockPos } | undefined;
  /** Where Try it's own player stands (area positions). */
  playerPosition(): Vec3;
  /** Moves Try it's own player (area positions). */
  teleportPlayer(pos: Vec3): void;
  /** A block's name in plain words ("Red Bed"). */
  blockName(id: string): string;
  /** A player died with a killer or none, after the advancements (scripts' `entity.death`). */
  died?(victim: CommandActor, killer: CommandActor | undefined): void;
}

/** The practice players' controller; see the module comment. */
export class PracticePlayers {
  private readonly host: PracticeHost;
  private readonly pending: { victim: CommandActor; killer: CommandActor | undefined }[] = [];
  private settling = false;

  constructor(host: PracticeHost) {
    this.host = host;
  }

  private get state() {
    return this.host.functions.state;
  }

  private get roster() {
    return this.state.games.practice;
  }

  /** The practice players, in the order they joined. */
  all(): readonly PracticeState[] {
    return this.roster.all();
  }

  /**
   * Adds a practice player (the next free name when none is given) standing beside you, or at
   * `at`; on `team` when that team exists. `undefined` when seven are already here or the name is
   * taken.
   */
  add(name?: string, options: { readonly team?: string; readonly at?: PracticePlace } = {}) {
    const chosen = name ?? this.roster.nextName([PREVIEW_PLAYER_NAME]);
    if (chosen === undefined) return undefined;
    const index = this.roster.size;
    const angle = (index / 7) * Math.PI * 2;
    const me = this.host.playerPosition();
    const beside = { x: me.x + Math.cos(angle) * 2, y: me.y, z: me.z + Math.sin(angle) * 2 };
    const pos = options.at === undefined ? beside : (this.placeOf(options.at) ?? beside);
    const added = this.roster.add(chosen, pos, [PREVIEW_PLAYER_NAME]);
    if (added === undefined) return undefined;
    this.host.log.info(`${chosen} joined the game as a practice player.`);
    if (options.team !== undefined) this.joinTeam(chosen, options.team);
    return added;
  }

  /** Takes a practice player away altogether (their scores and tags are forgotten). */
  remove(name: string): boolean {
    if (!this.roster.remove(name)) return false;
    const { state } = this;
    for (const objective of state.objectives.values()) objective.scores.delete(name);
    state.tags.delete(name);
    state.teamOf.delete(name);
    state.games.dead.delete(name);
    state.games.health.delete(name);
    state.games.gameModes.delete(name);
    state.games.slots.delete(name);
    state.games.hurtBy.delete(name);
    this.host.log.info(`${name} is no longer a practice player.`);
    return true;
  }

  /** Takes every practice player away and brings Try it's own player back into the game. */
  removeAll(): void {
    for (const one of [...this.roster.all()]) this.remove(one.name);
    this.roster.userAway = false;
  }

  /**
   * Try it's own player watches from outside the game (Watch a round, a headless round): no
   * selector finds you, as if you had left; `false` brings you back.
   */
  setUserAway(away: boolean): void {
    if (this.roster.userAway === away) return;
    this.roster.userAway = away;
    this.host.log.info(
      away
        ? 'You watch from outside the game; the practice players play.'
        : 'You are back in the game.',
    );
  }

  /** Whether Try it's own player watches from outside the game. */
  get userAway(): boolean {
    return this.roster.userAway;
  }

  /** Does one action; deaths it causes are settled before it returns. */
  act(action: PracticeAction): PracticeOutcome {
    const outcome = this.run(action);
    this.settle();
    if (outcome.said !== '') this.host.log.info(outcome.said);
    return outcome;
  }

  /** One tick: walks and falls; a fall below the world kills. Call after the functions' tick. */
  tick(): void {
    const { world } = this.host;
    for (const one of this.roster.online()) {
      if (this.state.games.dead.has(one.name)) continue;
      if (one.walkTo !== null) this.stepWalk(one);
      const inColumns =
        one.pos.x >= 0 && one.pos.x < world.sizeX && one.pos.z >= 0 && one.pos.z < world.sizeZ;
      if (inColumns) this.stepFall(one);
      if (one.pos.y + this.state.corner.y < VOID_Y) this.voidDeath(one);
    }
    this.settle();
  }

  /**
   * A player died (the function engine's host hears it from `playerDies`): queued, and settled
   * after the action or tick that caused it.
   */
  died(victim: CommandActor, killer: CommandActor | undefined): void {
    this.pending.push({ victim, killer });
  }

  /**
   * Gives the deaths' advancements and tells the host, in the order the deaths happened (the
   * function engine calls it when a run has ended; the grants' own runs come back here and wait).
   */
  settle(): void {
    if (this.settling) return;
    this.settling = true;
    try {
      this.settleNow();
    } finally {
      this.settling = false;
    }
  }

  private settleNow(): void {
    while (this.pending.length > 0) {
      const { victim, killer } = this.pending.shift() as (typeof this.pending)[number];
      if (killer !== undefined && killer.kind !== 'mob') {
        this.grant(killer, 'minecraft:player_killed_entity', (c) =>
          entityConditionMatches(c.entity, 'minecraft:player', this.host.log),
        );
        this.grant(victim, 'minecraft:entity_killed_player', (c) =>
          entityConditionMatches(c.entity, 'minecraft:player', this.host.log),
        );
      }
      this.host.died?.(victim, killer);
    }
  }

  /** The players' rows for the panel: yours first, then the practice players. */
  views(): PracticeView[] {
    const out: PracticeView[] = [];
    const me = this.host.playerPosition();
    out.push(this.view(PREVIEW_PLAYER_NAME, !this.roster.userAway, me, false));
    for (const one of this.roster.all()) {
      out.push(this.view(one.name, one.online, one.pos, one.walkTo !== null));
    }
    return out;
  }

  // -------------------------------------------------------------------------------------------

  private view(name: string, online: boolean, pos: Vec3, walking: boolean): PracticeView {
    const { state } = this;
    const hearts = playerHearts(state.games, name);
    const teamName = state.teamOf.get(name);
    const team = teamName === undefined ? undefined : state.teams.get(teamName);
    const { corner } = state;
    const tenth = (n: number): number => Math.round(n * 10) / 10;
    return {
      name,
      online,
      dead: hearts.dead,
      health: hearts.health,
      most: hearts.most,
      team: team?.displayName ?? teamName ?? null,
      colour: team === undefined || team.colour === 'reset' ? null : team.colour,
      gameMode: state.games.gameMode(name),
      pos: [tenth(pos.x + corner.x), tenth(pos.y + corner.y), tenth(pos.z + corner.z)],
      walking,
    };
  }

  private run(action: PracticeAction): PracticeOutcome {
    switch (action.do) {
      case 'join':
        return this.join(action.who, action.team, action.at);
      case 'leave':
        return this.leave(action.who);
      case 'walk':
        return this.walk(action.who, action.to);
      case 'hit':
        return this.hit(action.who, action.target, action.damage ?? PRACTICE_HIT_DAMAGE);
      case 'knock_out':
        return this.knockOut(action.who, action.by);
      case 'break_under':
        return this.breakUnder(action.who, action.target ?? action.who);
      case 'break':
        return this.breakAt(action.who, action.at);
      case 'hit_thing':
        return this.hitThing(action.who, action.type);
      case 'use':
        return this.use(action.who, action.item);
      case 'type':
        return this.type(action.who, action.line);
    }
  }

  /** Try it's own player or a practice player by name, with whether it is in the game. */
  private actorOf(name: string): CommandActor | undefined {
    if (name === PREVIEW_PLAYER_NAME) return PLAYER;
    return this.roster.get(name)?.actor;
  }

  private online(name: string): boolean {
    if (name === PREVIEW_PLAYER_NAME) return !this.roster.userAway;
    return this.roster.get(name)?.online === true;
  }

  private positionOf(name: string): Vec3 | undefined {
    if (name === PREVIEW_PLAYER_NAME) return this.host.playerPosition();
    return this.roster.get(name)?.pos;
  }

  private placeOf(place: PracticePlace): Vec3 | undefined {
    const { corner } = this.state;
    if ('pos' in place) {
      const [x, y, z] = place.pos;
      return { x: x - corner.x, y: y - corner.y, z: z - corner.z };
    }
    if ('area' in place) {
      const box = this.host.area(place.area);
      if (box === undefined) return undefined;
      return {
        x: (box.min.x + box.max.x + 1) / 2,
        y: box.min.y,
        z: (box.min.z + box.max.z + 1) / 2,
      };
    }
    const at = this.positionOf(place.player);
    return at === undefined ? undefined : { x: at.x + 1, y: at.y, z: at.z };
  }

  private joinTeam(name: string, team: string): void {
    if (!this.state.teams.has(team)) {
      this.host.log.info(`There is no team ${team} yet; ${name} joins no team.`);
      return;
    }
    this.host.functions.runLine(`team join ${team} ${name}`, { as: null, quiet: true });
  }

  private join(name: string, team: string | undefined, at: PracticePlace | undefined) {
    if (name === PREVIEW_PLAYER_NAME) {
      this.setUserAway(false);
      if (at !== undefined) {
        const pos = this.placeOf(at);
        if (pos !== undefined) this.host.teleportPlayer(pos);
      }
      if (team !== undefined) this.joinTeam(name, team);
      return { ok: true, said: '' };
    }
    const one = this.roster.get(name);
    if (one === undefined) {
      const added = this.add(name, {
        ...(team === undefined ? {} : { team }),
        ...(at === undefined ? {} : { at }),
      });
      return added === undefined
        ? {
            ok: false,
            said: `${name} cannot join: seven practice players are here, or the name is taken.`,
          }
        : { ok: true, said: '' };
    }
    if (at !== undefined) {
      const pos = this.placeOf(at);
      if (pos !== undefined) one.pos = pos;
    }
    if (!one.online) {
      one.online = true;
      this.host.functions.runLine(
        `tellraw @a {"text":"${name} joined the game","color":"yellow"}`,
        {
          as: null,
          quiet: true,
        },
      );
    }
    if (team !== undefined) this.joinTeam(name, team);
    return { ok: true, said: '' };
  }

  private leave(name: string): PracticeOutcome {
    if (name === PREVIEW_PLAYER_NAME) {
      this.setUserAway(true);
      return { ok: true, said: '' };
    }
    const one = this.roster.get(name);
    if (one === undefined || !one.online) return { ok: false, said: `${name} is not in the game.` };
    this.host.functions.runLine(`tellraw @a {"text":"${name} left the game","color":"yellow"}`, {
      as: null,
      quiet: true,
    });
    one.online = false;
    one.walkTo = null;
    return { ok: true, said: '' };
  }

  /** A practice player who can act now, or why not. */
  private able(name: string): PracticeState | string {
    const one = this.roster.get(name);
    if (one === undefined) return `${name} is not a practice player.`;
    if (!one.online) return `${name} is not in the game.`;
    if (this.state.games.dead.has(name)) return `${name} is dead and respawns in a moment.`;
    return one;
  }

  private walk(name: string, to: PracticePlace): PracticeOutcome {
    const one = this.able(name);
    if (typeof one === 'string') return { ok: false, said: one };
    const pos = this.placeOf(to);
    if (pos === undefined) return { ok: false, said: `${name} does not know where that is.` };
    one.walkTo = pos;
    return { ok: true, said: '' };
  }

  private stepWalk(one: PracticeState): void {
    const target = one.walkTo;
    if (target === null) return;
    const dx = target.x - one.pos.x;
    const dz = target.z - one.pos.z;
    const far = Math.hypot(dx, dz);
    if (far <= ARRIVED) {
      one.walkTo = null;
      return;
    }
    const last = far <= PRACTICE_WALK_SPEED;
    // A movement speed of 0 holds a player still (a head start), as it holds you (B727).
    if ((this.state.games.attribute(one.name, 'minecraft:movement_speed') ?? 1) <= 0) return;
    one.yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
    const step = Math.min(PRACTICE_WALK_SPEED, far);
    const next = {
      x: one.pos.x + (dx / far) * step,
      y: one.pos.y,
      z: one.pos.z + (dz / far) * step,
    };
    const feet = this.cell(next, 0);
    if (this.solid(feet)) {
      // Step up one block when the two above are free, as walking up a step does.
      if (one.fall === 0 && !this.solid(this.cell(next, 1)) && !this.solid(this.cell(next, 2))) {
        one.pos = { ...next, y: Math.floor(next.y) + 1 };
        if (last) one.walkTo = null;
        return;
      }
      one.walkTo = null;
      this.host.log.info(`${one.name} cannot get any further that way.`);
      return;
    }
    if (this.solid(this.cell(next, 1))) {
      one.walkTo = null;
      this.host.log.info(`${one.name} cannot get any further that way.`);
      return;
    }
    one.pos = next;
    if (last) one.walkTo = null;
  }

  private stepFall(one: PracticeState): void {
    // The area's invisible floor holds a practice player as it holds you (limit L15); one put
    // below it falls on into the void.
    const floor = one.pos.y >= 0 ? -1 : Number.NEGATIVE_INFINITY;
    const ground = (cy: number): boolean =>
      cy <= floor || this.solid({ x: Math.floor(one.pos.x), y: cy, z: Math.floor(one.pos.z) });
    const standing = one.pos.y - Math.floor(one.pos.y) < 0.001 && ground(Math.floor(one.pos.y) - 1);
    if (standing) {
      one.fall = 0;
      return;
    }
    one.fall = Math.min(3.92, (one.fall + 0.08) * 0.98);
    let y = one.pos.y - one.fall;
    // Land on the first solid block passed on the way down.
    for (let cy = Math.ceil(one.pos.y) - 1; cy >= Math.floor(y); cy -= 1) {
      if (ground(cy) && cy + 1 <= one.pos.y) {
        y = cy + 1;
        one.fall = 0;
        break;
      }
    }
    one.pos = { ...one.pos, y };
  }

  private cell(pos: Vec3, up: number): BlockPos {
    return { x: Math.floor(pos.x), y: Math.floor(pos.y) + up, z: Math.floor(pos.z) };
  }

  private solid(pos: BlockPos): boolean {
    const { world } = this.host;
    if (!world.inBounds(pos)) return false;
    const state = world.get(pos);
    return state !== null && this.host.shapes.collision(state).length > 0;
  }

  private voidDeath(one: PracticeState): void {
    const hurt = this.state.games.hurtBy.get(one.name);
    const killer =
      hurt !== undefined && this.host.now() - hurt.tick <= KILL_CREDIT_TICKS ? hurt.by : undefined;
    const by = killer === undefined ? undefined : holderOf(killer);
    this.host.functions.playerDies(
      one.actor,
      by === undefined
        ? `${one.name} fell out of the world`
        : `${one.name} was knocked into the void by ${by}`,
      killer,
    );
  }

  /** Hurts a player (yours or a practice player); a hit to nothing left kills, with the kill. */
  private hurt(victimName: string, by: CommandActor, damage: number): PracticeOutcome {
    const victim = this.actorOf(victimName);
    if (victim === undefined || !this.online(victimName)) {
      return { ok: false, said: `${victimName} is not in the game.` };
    }
    const { games } = this.state;
    const byName = holderOf(by);
    if (games.dead.has(victimName)) return { ok: false, said: `${victimName} is already dead.` };
    const mode = games.gameMode(victimName);
    if (mode === 'creative' || mode === 'spectator') {
      return { ok: false, said: `${victimName} plays in ${mode} mode and cannot be hurt.` };
    }
    if (games.rule('pvp') === false) {
      return { ok: false, said: 'Players cannot hurt each other: the game rule pvp is off.' };
    }
    const teamA = this.state.teamOf.get(byName);
    const teamB = this.state.teamOf.get(victimName);
    if (
      teamA !== undefined &&
      teamA === teamB &&
      this.state.teams.get(teamA)?.friendlyFire === false
    ) {
      return {
        ok: false,
        said: `${byName} and ${victimName} are on one team, which does not hurt its own.`,
      };
    }
    games.hurtBy.set(victimName, { by, tick: this.host.now() });
    const health = games.healthOf(victimName) - damage;
    if (health > 0) {
      games.health.set(victimName, health);
      return { ok: true, said: `${byName} hit ${victimName}.` };
    }
    this.host.functions.playerDies(victim, `${victimName} was slain by ${byName}`, by);
    return { ok: true, said: '' };
  }

  private hit(name: string, target: string, damage: number): PracticeOutcome {
    const who = this.attacker(name);
    if (typeof who === 'string') return { ok: false, said: who };
    return this.hurt(target, who, damage);
  }

  private knockOut(victim: string, by: string | undefined): PracticeOutcome {
    if (by === undefined) {
      const actor = this.actorOf(victim);
      if (actor === undefined || !this.online(victim)) {
        return { ok: false, said: `${victim} is not in the game.` };
      }
      this.host.functions.playerDies(actor, `${victim} died`);
      return { ok: true, said: '' };
    }
    const who = this.attacker(by);
    if (typeof who === 'string') return { ok: false, said: who };
    return this.hurt(victim, who, Number.POSITIVE_INFINITY);
  }

  /** The hitter: a practice player who can act, or Try it's own player in the game. */
  private attacker(name: string): CommandActor | string {
    if (name === PREVIEW_PLAYER_NAME) {
      if (this.roster.userAway) return 'You watch from outside the game.';
      if (this.state.games.dead.has(name)) return 'You are dead; you respawn in a moment.';
      if (this.state.games.gameMode(name) === 'spectator') return 'A spectator only watches.';
      return PLAYER;
    }
    const one = this.able(name);
    if (typeof one === 'string') return one;
    if (this.state.games.gameMode(name) === 'spectator') {
      return `${name} is a spectator and only watches.`;
    }
    return one.actor;
  }

  private breakUnder(name: string, target: string): PracticeOutcome {
    const at = this.positionOf(target);
    if (at === undefined || !this.online(target)) {
      return { ok: false, said: `${target} is not in the game.` };
    }
    const pos = this.cell({ ...at, y: at.y - 0.001 }, 0);
    return this.breakCell(name, pos);
  }

  private breakAt(name: string, at: readonly [number, number, number]): PracticeOutcome {
    const { corner } = this.state;
    return this.breakCell(name, {
      x: Math.floor(at[0] - corner.x),
      y: Math.floor(at[1] - corner.y),
      z: Math.floor(at[2] - corner.z),
    });
  }

  private breakCell(name: string, pos: BlockPos): PracticeOutcome {
    const who = this.attacker(name);
    if (typeof who === 'string') return { ok: false, said: who };
    const { world } = this.host;
    const state = world.inBounds(pos) ? world.get(pos) : null;
    if (state === null) return { ok: false, said: `There is no block there for ${name} to break.` };
    if (
      this.state.games.gameMode(name) === 'adventure' &&
      !this.mayBreakInAdventure(who, state.name)
    ) {
      return {
        ok: false,
        said: `${name} plays in adventure mode and holds nothing that may break ${this.host.blockName(state.name)}.`,
      };
    }
    const { corner } = this.state;
    this.host.functions.runLine(
      `setblock ${pos.x + corner.x} ${pos.y + corner.y} ${pos.z + corner.z} minecraft:air`,
      { as: null, quiet: true },
    );
    return { ok: true, said: `${name} broke ${this.host.blockName(state.name)}.` };
  }

  /** Whether an item in the player's hands names the block in its `can_break` (B720 K14). */
  private mayBreakInAdventure(who: CommandActor, block: string): boolean {
    const hotbar =
      who.kind === 'practice' ? (this.roster.get(who.name)?.inventory.slots ?? []) : [];
    if (who.kind === 'player') {
      this.host.log.onlyInMinecraft(
        'breaking blocks in adventure mode with your own items (Try it’s hotbar items carry no can_break)',
      );
      return false;
    }
    return hotbar.some((stack) => canBreak(stack?.components?.['minecraft:can_break'], block));
  }

  private hitThing(name: string, type: string): PracticeOutcome {
    const who = this.attacker(name);
    if (typeof who === 'string') return { ok: false, said: who };
    const at = this.positionOf(name);
    if (at === undefined) return { ok: false, said: `${name} is not in the game.` };
    const wanted = type.includes(':') ? type : `minecraft:${type}`;
    let best: { thing: { attacker?: CommandActor; pos: Vec3 }; far: number } | undefined;
    for (const thing of this.state.games.things.values()) {
      if (thing.type !== wanted) continue;
      const far = Math.hypot(thing.pos.x - at.x, thing.pos.y - at.y, thing.pos.z - at.z);
      if (best === undefined || far < best.far) best = { thing, far };
    }
    if (best === undefined) return { ok: false, said: `There is no ${wanted} for ${name} to hit.` };
    best.thing.attacker = who;
    return {
      ok: true,
      said: `${name} hit the ${wanted.replace(/^minecraft:/, '').replaceAll('_', ' ')}.`,
    };
  }

  private use(name: string, item: string): PracticeOutcome {
    const who = this.attacker(name);
    if (typeof who === 'string' || who.kind !== 'practice') {
      return {
        ok: false,
        said: typeof who === 'string' ? who : 'Use your own items from the hotbar.',
      };
    }
    const one = this.roster.get(who.name) as PracticeState;
    const id = item.includes(':') ? item : `minecraft:${item}`;
    const slot = one.inventory.slots.findIndex((stack) => stack?.id === id);
    const stack = slot < 0 ? null : one.inventory.slots[slot];
    if (stack == null) return { ok: false, said: `${name} has no ${id}.` };
    one.inventory.set(slot, stack.count > 1 ? { ...stack, count: stack.count - 1 } : null);
    this.grant(who, 'minecraft:consume_item', (c) => itemConditionMatches(c.item, stack));
    return { ok: true, said: `${name} used ${id}.` };
  }

  private type(name: string, line: string): PracticeOutcome {
    const who = this.attacker(name);
    if (typeof who === 'string') return { ok: false, said: who };
    const answer = this.host.functions.runLine(line, { as: who });
    return { ok: answer.result === 'ran', said: answer.answer.join(' ') };
  }

  /**
   * Grants every criterion of the project's advancements with this trigger whose conditions
   * pass, as the game gives them (`advancement grant ... only`), so rewards run as the player.
   */
  private grant(
    actor: CommandActor,
    trigger: string,
    passes: (conditions: JsonObject) => boolean,
  ): void {
    const holder = holderOf(actor);
    for (const advancement of this.host.functions.projectAdvancements()) {
      for (const [criterion, one] of Object.entries(advancement.triggers ?? {})) {
        if (one.trigger !== trigger || !passes(one.conditions)) continue;
        if (this.done(holder, advancement, criterion)) continue;
        this.host.functions.runLine(
          `advancement grant ${holder} only ${advancement.id} ${criterion}`,
          { as: null, quiet: true },
        );
      }
    }
  }

  private done(holder: string, advancement: SimAdvancement, criterion: string): boolean {
    return this.state.advancements.get(holder)?.get(advancement.id)?.has(criterion) === true;
  }
}

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether an advancement's entity condition passes for an entity of `type`: the 26.x loot
 * condition form (`entity_properties` with a predicate, or a list of them) or the older bare
 * predicate. Only the entity type is read; any other part is said once and passes.
 */
export function entityConditionMatches(
  condition: Json | undefined,
  type: string,
  log: SimLog,
): boolean {
  if (condition === undefined) return true;
  if (Array.isArray(condition))
    return condition.every((one) => entityConditionMatches(one, type, log));
  if (!isRecord(condition)) return true;
  const kind = condition.condition ?? condition.type;
  const predicate =
    kind === 'minecraft:entity_properties' || kind === 'entity_properties'
      ? condition.predicate
      : condition;
  if (!isRecord(predicate)) return true;
  for (const [key, value] of Object.entries(predicate)) {
    if (key === 'type' || key === 'minecraft:entity_type') {
      if (!typeMatches(value, type)) return false;
    } else {
      log.onlyInMinecraft(`the entity test ${key} of an advancement (Try it passes it)`);
    }
  }
  return true;
}

function typeMatches(value: Json, type: string): boolean {
  if (typeof value === 'string') {
    if (value.startsWith('#')) return true;
    return (value.includes(':') ? value : `minecraft:${value}`) === type;
  }
  if (Array.isArray(value)) return value.some((one) => typeMatches(one, type));
  return true;
}

/** Whether an advancement's item condition passes for a stack: its items and custom data. */
export function itemConditionMatches(
  condition: Json | undefined,
  stack: { readonly id: string; readonly components?: JsonObject },
): boolean {
  if (!isRecord(condition)) return true;
  const items = condition.items;
  if (items !== undefined && !typeMatches(items, stack.id)) return false;
  const predicates = condition.predicates;
  if (isRecord(predicates)) {
    const wanted = predicates['minecraft:custom_data'];
    if (wanted !== undefined) {
      const pattern = typeof wanted === 'string' ? parseSnbt(wanted) : wanted;
      if (!nbtMatches(stack.components?.['minecraft:custom_data'], pattern)) return false;
    }
  }
  return true;
}

/** Whether a `can_break` component names a block (a block id, a list, or a list of predicates). */
function canBreak(component: Json | undefined, block: string): boolean {
  if (component === undefined) return false;
  if (Array.isArray(component)) return component.some((one) => canBreak(one, block));
  if (!isRecord(component)) return false;
  const blocks = component.blocks;
  if (blocks === undefined) return false;
  return typeMatches(blocks, block);
}
