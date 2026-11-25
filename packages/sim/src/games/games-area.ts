/**
 * Try it for games (ADR 0117 D4, B558): what `LocalWorldSource.games` holds.
 *
 * The games kinds' own lowered functions run in the function engine like any project function
 * (limit M15 since ADR 0120): the one block refills by phase, timers count, areas tag the player
 * and fire their hooks, teams and objectives are made. This controller adds what the engine
 * cannot do and what the side panel draws:
 * - the games grounds' area corner (`CommandState.corner`), so the functions' world positions
 *   land in the area (`setup.ts`, `grounds/void.ts`, `grounds/structure.ts`);
 * - the mock first join on the void ground, once per ground and after "Clear the area";
 * - `place template` from the project's structure templates (an area's reset, Rebuild now);
 * - the game mode, kept in the engine's state since B727 (`gamemode` sets it too): adventure
 *   stops breaking (the preview's items carry no `can_break`), a spectator or a dead player
 *   touches nothing (`mayTouch`);
 * - the mock cobblestone generator (`generator.ts`);
 * - walks in and out of areas said in "What happened" (`areas.ts`);
 * - the status the side panel draws: one blocks, timers, the sidebar, the engine's teams and
 *   the player's team (`team join` or the panel's pick through the engine), and areas.
 */

import type { BlockCatalogue } from '../blocks/catalogue.js';
import type { FunctionEngine } from '../commands/functions.js';
import {
  DEFAULT_BORDER_SIZE,
  type GamesCommandState,
  playerHearts,
} from '../commands/games-commands.js';
import { PREVIEW_PLAYER_NAME } from '../commands/parse.js';
import { PLAYER, type SimInventory } from '../events/actions.js';
import { type GroundKind, groundState } from '../grounds/ground.js';
import { templateCells } from '../grounds/structure.js';
import type { PlayerController } from '../player/controller.js';
import type { BlockPos, Box, SimLog, SimOrigin } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import { type AreaView, AreaWatch, areaOutline, areaViews } from './areas.js';
import { type GamesProject, hasGames, NO_GAMES } from './data.js';
import { MockGenerator } from './generator.js';
import { type OneBlockStatus, oneBlockStatuses } from './one-block.js';
import type { GamesPlan } from './setup.js';
import { type SidebarView, sidebarOf, type TeamLook, teamLooks } from './teams.js';
import { type TimerStatus, timerStatuses } from './timers.js';

/** What the games controller works on. */
export interface GamesHost {
  readonly world: SimWorld;
  catalogue(): BlockCatalogue;
  readonly player: PlayerController;
  readonly functions: FunctionEngine;
  readonly log: SimLog;
  now(): number;
  inventory(): SimInventory;
}

/** The game modes Try it knows. */
export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator';

/** What the side panel draws (`GamesArea.status`). */
export interface GamesStatus {
  /** The games ground in, or `null` on another ground. */
  readonly ground: 'void' | 'structure' | null;
  /** The game mode the join set, or `null` before a join (Try it's own: anything breaks). */
  readonly gameMode: GameMode | null;
  readonly oneBlocks: readonly OneBlockStatus[];
  readonly timers: readonly TimerStatus[];
  /** The teams that exist now (the engine's `team add`), looking as the engine keeps them. */
  readonly teams: readonly TeamLook[];
  /** The team the player is on in the engine (`team join`, or the side panel), or `null`. */
  readonly team: TeamLook | null;
  readonly sidebar: SidebarView | null;
  readonly areas: readonly (AreaView & { readonly inside: boolean })[];
  /** The player's hearts (B727: `attribute` sets the most): health and most in half hearts. */
  readonly hearts: { readonly health: number; readonly most: number; readonly dead: boolean };
  /** The world border (B727) when a command moved it: centre and width now, world positions. */
  readonly border: { readonly x: number; readonly z: number; readonly size: number } | null;
}

const ZERO: BlockPos = Object.freeze({ x: 0, y: 0, z: 0 });

/** The games controller; see the module comment. */
export class GamesArea {
  private readonly host: GamesHost;
  private games: GamesProject = NO_GAMES;
  private active = false;
  private plan: GamesPlan | null = null;
  private prepared: GamesPlan | null = null;
  private joinPending = false;
  private readonly generator: MockGenerator;
  private readonly watch = new AreaWatch();

  constructor(host: GamesHost) {
    this.host = host;
    this.generator = new MockGenerator(host);
    host.world.onChange((change) => {
      if (this.active) this.generator.changed(change.pos, change.state);
    });
  }

  /** The project's games (the app hands them in after each edit). */
  setProject(games: GamesProject): void {
    this.games = games;
    this.active = hasGames(games);
  }

  /** The project's games as last handed in. */
  get project(): GamesProject {
    return this.games;
  }

  /** The plan of the games ground about to load (call before `loadGround`). */
  prepare(plan: GamesPlan | null): void {
    this.prepared = plan;
  }

  /** The games ground's plan while one is in. */
  get current(): GamesPlan | null {
    return this.plan;
  }

  /** A ground was loaded: a games ground takes its prepared plan; any other has none. */
  groundLoaded(kind: GroundKind): void {
    this.plan =
      (kind === 'void' || kind === 'structure') && this.prepared?.kind === kind
        ? this.prepared
        : null;
    this.prepared = null;
    this.host.functions.state.corner = this.plan?.corner ?? ZERO;
  }

  /** The area was emptied and filled again: the join waits for the next tick. */
  clear(): void {
    this.generator.clear();
    this.watch.clear();
    this.host.functions.state.games.gameModes.delete(PREVIEW_PLAYER_NAME);
    this.joinPending = this.plan?.join != null;
  }

  /** One tick, after the function engine's (the load tag has run before the join). */
  tick(): void {
    if (this.joinPending) {
      this.joinPending = false;
      this.join();
    }
    if (!this.active) return;
    this.generator.tick();
    this.watch.tick(this.areas(), this.host.functions.state.tags.get(PREVIEW_PLAYER_NAME), (text) =>
      this.host.log.info(text),
    );
  }

  /** The mock first join (see `setup.ts`). */
  private join(): void {
    const join = this.plan?.join;
    if (join == null) return;
    const { host } = this;
    if (join.spawn !== null) {
      host.player.teleport(join.spawn);
      host.player.setFlying(false);
    }
    this.setGameMode(gameModeOf(join.gameMode));
    host.log.info(
      'You joined the game for the first time: you stand at the world spawn and get what new players get.',
    );
    if (host.functions.exists(join.firstJoin)) {
      host.functions.runFunction(join.firstJoin, { as: PLAYER, quiet: true });
    } else {
      for (const item of join.items) host.inventory().give(item.item, item.count);
    }
    if (this.gameMode === 'adventure') {
      host.log.info(
        'You play in adventure mode: blocks do not break (the side panel can change it).',
      );
    } else if (this.gameMode === 'spectator') {
      host.log.onlyInMinecraft(
        'flying through blocks as a spectator (Try it lets you walk and fly as usual, touching nothing)',
      );
    }
  }

  /** Sets the game mode (the side panel's "Play as"); `null` is Try it's own. */
  setGameMode(mode: GameMode | null): void {
    const modes = this.host.functions.state.games.gameModes;
    if (mode === null) modes.delete(PREVIEW_PLAYER_NAME);
    else modes.set(PREVIEW_PLAYER_NAME, mode);
  }

  /** The game mode now (`null`: no join or command set one; Try it's own). */
  get gameMode(): GameMode | null {
    return this.host.functions.state.games.gameModes.get(PREVIEW_PLAYER_NAME) ?? null;
  }

  /**
   * Whether the player may touch the area (break, place, use, hit): not as a spectator, not
   * while dead (B727). Said once each time it refuses.
   */
  mayTouch(): boolean {
    const games = this.host.functions.state.games;
    if (games.dead.has(PREVIEW_PLAYER_NAME)) {
      this.host.log.info('You are dead; you respawn in a moment.');
      return false;
    }
    if (this.gameMode !== 'spectator') return true;
    this.host
      .catalogue()
      .sayOnce('games.spectator', 'touching the world as a spectator (a spectator only watches)');
    return false;
  }

  /**
   * Puts the player on a team (a {@link TeamLook} id of {@link status}) or on none, as `team join
   * <team> Player` and `team leave Player` do in the engine: What happened says it, and a team
   * the engine does not have answers the game's "Unknown team".
   */
  setTeam(id: string | null): void {
    const { functions } = this.host;
    if (id === null) {
      if (functions.state.teamOf.has(PREVIEW_PLAYER_NAME)) {
        functions.runChatLine(`team leave ${PREVIEW_PLAYER_NAME}`);
      }
      return;
    }
    const team = this.teams().find((one) => one.id === id);
    functions.runChatLine(`team join ${team?.gameName ?? id} ${PREVIEW_PLAYER_NAME}`);
  }

  /**
   * The teams the engine has, in the project's order and then the rest by name: an element's
   * team keeps its id and name words; colour, prefix and suffix are the engine's.
   */
  private teams(): TeamLook[] {
    const { teams } = this.host.functions.state;
    const looks = teamLooks(this.games);
    const out: TeamLook[] = [];
    for (const look of looks) {
      const team = teams.get(look.gameName);
      if (team === undefined) continue;
      out.push({ ...look, colour: team.colour, prefix: team.prefix, suffix: team.suffix });
    }
    const named = new Set(looks.map((look) => look.gameName));
    for (const team of [...teams.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      if (named.has(team.name)) continue;
      out.push({
        id: team.name,
        gameName: team.name,
        name: team.displayName,
        colour: team.colour,
        prefix: team.prefix,
        suffix: team.suffix,
      });
    }
    return out;
  }

  /**
   * Whether the player may break the block: not in adventure mode, where only an item whose
   * `can_break` names the block breaks it, and the preview's items carry no components.
   */
  mayBreak(): boolean {
    if (this.gameMode !== 'adventure') return true;
    this.host
      .catalogue()
      .sayOnce(
        'games.adventure',
        'breaking blocks in adventure mode with an item whose can_break allows it (Try it’s items carry no components, so nothing breaks here)',
      );
    return false;
  }

  /**
   * `place template` (the engine's host): the project's template placed with its corner at
   * `corner`. The blocks placed, or `undefined` when the project has no such template.
   */
  placeTemplate(id: string, corner: BlockPos, origin: SimOrigin | undefined): number | undefined {
    const template = this.games.templates.get(id);
    if (template === undefined) {
      if (id.startsWith('minecraft:')) {
        this.host.log.onlyInMinecraft(`placing Minecraft’s own structure ${id}`, origin);
      }
      return undefined;
    }
    const { world } = this.host;
    const catalogue = this.host.catalogue();
    let placed = 0;
    let cut = false;
    for (const { pos, state } of templateCells(template, corner)) {
      if (!world.inBounds(pos)) {
        cut = true;
        continue;
      }
      const parsed = groundState(state);
      if (parsed.name === 'minecraft:air' || parsed.name === 'minecraft:structure_void') {
        if (parsed.name === 'minecraft:air' && world.get(pos) !== null) world.set(pos, null);
        continue;
      }
      const normal = catalogue.normalise(parsed);
      if (normal === null) continue;
      world.set(pos, normal);
      placed += 1;
    }
    if (cut) {
      this.host.log.info(`Part of ${id} lies outside the test area and was not placed.`, origin);
    }
    return placed;
  }

  /** "Rebuild now": runs the area's own reset function. False when it has none. */
  rebuild(areaId: string): boolean {
    const view = this.areas().find((one) => one.id === areaId);
    if (view?.reset == null || !this.host.functions.exists(view.reset)) return false;
    this.host.functions.runFunction(view.reset, { as: null, quiet: true });
    this.host.log.info(`You rebuilt the area ${view.name}.`);
    return true;
  }

  /** Every area, moved into the test area. */
  areas(): AreaView[] {
    const { world } = this.host;
    return areaViews(this.games, this.host.functions.state.corner, {
      x: world.sizeX,
      y: world.sizeY,
      z: world.sizeZ,
    });
  }

  /** The areas' outline for the view, or `null` when none lies in the test area. */
  outline(): { readonly pos: BlockPos; readonly boxes: readonly Box[] } | null {
    return this.active ? areaOutline(this.areas()) : null;
  }

  /** What the side panel draws. */
  status(): GamesStatus {
    const { functions, world } = this.host;
    const state = functions.state;
    const teams = this.teams();
    const on = state.teamOf.get(PREVIEW_PLAYER_NAME);
    const team = teams.find((one) => one.gameName === on) ?? null;
    const inside = this.watch.now;
    return {
      ground: this.plan?.kind ?? null,
      gameMode: this.gameMode,
      oneBlocks: oneBlockStatuses(this.games, state, state.corner, (pos) => world.inBounds(pos)),
      timers: timerStatuses(this.games, state),
      teams,
      team,
      sidebar: sidebarOf(this.games, state, team?.colour ?? null),
      areas: this.areas().map((view) => ({ ...view, inside: inside.has(view.id) })),
      hearts: playerHearts(state.games, PREVIEW_PLAYER_NAME),
      border: borderOf(state.games, this.host.now()),
    };
  }
}

function gameModeOf(text: string): GameMode {
  return text === 'creative' || text === 'adventure' || text === 'spectator' ? text : 'survival';
}

/** The world border for the panel and the view, or `null` while it is the game's default. */
function borderOf(games: GamesCommandState, now: number): GamesStatus['border'] {
  const size = games.borderSize(now);
  if (size >= DEFAULT_BORDER_SIZE && games.border.centre.x === 0 && games.border.centre.z === 0) {
    return null;
  }
  return { x: games.border.centre.x, z: games.border.centre.z, size };
}
