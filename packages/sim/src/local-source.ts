/**
 * The local world source (ADR 0085 D14, B390): the one `WorldSource` of Try it. It owns the area
 * (`SimWorld`), the block and mob catalogues built from the lowered files, the player, the mobs
 * and the button and plate timers, and turns player actions into changes. Block changes, entity
 * snapshots and log lines go out to its listeners; the view reads the world, player and mobs
 * directly to draw them.
 *
 * One tick (call {@link LocalWorldSource.tick} once per `SimClock` tick):
 * 1. the player moves with the last `move` input (`toggleFly` counts once);
 * 2. every mob steps, and the snapshots go out as an `entities` event;
 * 3. the timers run with the player's and the mobs' boxes (buttons let go, plates press);
 * 4. the tick triggers (B396): steps, entities inside blocks, mobs' timers, random ticks.
 *
 * Vehicles (B428, `vehicles/`): the vehicles tick before the player; while the player sits in
 * one, the vehicle carries them and their keys drive it (Shift gets out), so the player does not
 * walk that tick. A vehicle's item places it; a right click or hit on a vehicle goes to it.
 *
 * The view's own per-tick work (ambient particles, the particle field) follows the tick.
 * Triggers and actions (B396, `events/`) fire where `use`, `interact`, `place`, `break`, `hit`,
 * the Power tool and the tick make their changes; their effects (particles, sounds, chips,
 * animations) go out as `effect` events, and every step is in {@link LocalWorldSource.trace}.
 *
 * Keys and the HUD (B429, `controls/`): {@link LocalWorldSource.controls} fires the project's
 * key binds (the view sends `controls.keys.press` and `release` with the game's key names) and
 * keeps the HUD the `show_hud`, `hide_hud` and `set_hud` actions change; held keys run
 * `msm:while_held` at the end of each tick.
 *
 * Screens (B398): using a container or machine block opens its screen ({@link
 * LocalWorldSource.screen}, which the view draws as a mock-up, ADR 0085 L11) and sets the block's
 * `open` property as the game does; {@link LocalWorldSource.closeScreen} closes it and fires the
 * container's `on_close`. Breaking the block, clearing the area or an edit that takes the screen
 * away closes it too.
 *
 * Vanilla parity 2 (B463, `blocks/types2/area.ts`): {@link LocalWorldSource.parity2} holds sign
 * text and the sign editor, weathering (each tick and {@link LocalWorldSource.timeLapse}), the
 * place and explosion rules (asked before placing and by the Explode tool), the chat box
 * ({@link LocalWorldSource.chat}) and the bag screens ({@link LocalWorldSource.useItem}).
 *
 * Batch 2 (B483): {@link LocalWorldSource.traders} opens a trader mob's merchant screen (a
 * mock-up) before its `msm:on_interact`, and {@link LocalWorldSource.fluids} pours a project
 * fluid from its bucket (drawn, not flowing) and fires its `on_entity_inside`.
 *
 * Scripts (B400, `script/`): with {@link LocalSourceOptions.scripts} the project's scripts run
 * through a {@link ScriptBridge} ({@link LocalWorldSource.scripts}; the app loads them with
 * {@link LocalWorldSource.loadScripts} once they are transpiled). Their Script API events fire
 * where the simulation does the thing: `block.interact` first on a right click on a block,
 * `block.break` before breaking, `block.place` before a held block is placed, `entity.interact`
 * before a mob's own use, `item.use` before a held item's use in the air, `world.explosion`
 * before the Explode tool breaks blocks (the six wait for the scripts' answer and stop when one
 * cancels), and `entity.death` after a hit, `command` after a project command, `player.chat`
 * after a chat line, `server.tick` and `player.tick` each tick, `server.started` and
 * `player.join` after the first load. `run_script` actions call their handlers. The place,
 * explosion and command rules B463 read from the script text are then the scripts' own answer.
 */

import { type BlockCatalogue, buildCatalogue, type CatalogueTarget } from './blocks/catalogue.js';
import { useBlock } from './blocks/interact.js';
import { breakBlock, placeBlock } from './blocks/placement.js';
import { type ScreenSpec, screensFromFiles } from './blocks/screens.js';
import { Types2Area } from './blocks/types2/area.js';
import { EXPLODE_TOOL, EXPLOSION_RADIUS } from './blocks/types2/tools.js';
import { TIME_LAPSE_TICKS } from './blocks/weathering.js';
import type { CommandsTarget } from './commands/catalogue.js';
import type { ChatLine } from './commands/run.js';
import { type ControlsTarget, SimControls } from './controls/controls.js';
import { buildEntityCatalogue, type EntityCatalogue } from './entities/catalogue.js';
import { EntityWorld } from './entities/entity-world.js';
import type { EntityHit } from './entities/spawn.js';
import { type Firing, PLAYER, type SimInventory } from './events/actions.js';
import { type RuleBookInfo, readEventDefinitions } from './events/definitions.js';
import { SimTrace, type TraceEntry } from './events/trace.js';
import { type ChanceMode, TriggerEngine } from './events/triggers.js';
import { FluidArea } from './fluids/area.js';
import { addFluidBlocks, readFluids } from './fluids/catalogue.js';
import {
  emptyGround,
  GROUND_AIR,
  type GroundBlocks,
  type GroundKind,
  groundState,
} from './grounds/ground.js';
import type { BlockLookup } from './player/collide.js';
import { REACH } from './player/constants.js';
import { IDLE_INPUT, PlayerController, type PlayerInput } from './player/controller.js';
import { adjacentPos, lookDirection, type PickResult, pick } from './player/pick.js';
import type { ScriptApiDescription } from './script/api.js';
import {
  ScriptBridge as Bridge,
  blockValue,
  itemValue,
  mobValue,
  PLAYER_VALUE,
  posValue,
  type ScriptBridge,
  type ScriptDecision,
} from './script/bridge.js';
import type { EncodedValue } from './script/protocol.js';
import type { ScriptRunner } from './script/runner.js';
import type { CompiledScript, ScriptProblem } from './script/sources.js';
import { BlockTimers } from './tick/timers.js';
import { applyTool } from './tick/tools.js';
import { TraderArea } from './traders/area.js';
import type { TradersTarget } from './traders/catalogue.js';
import type {
  BlockPos,
  BlockShapes,
  BlockState,
  Face,
  PlayerAction,
  SimFiles,
  SimLog,
  SimLogLine,
  SimOrigin,
  Vec3,
  WorldEvent,
  WorldListener,
  WorldSource,
} from './types.js';
import { buildVehicleCatalogue } from './vehicles/catalogue.js';
import { type VehicleHit, VehicleWorld } from './vehicles/vehicle-world.js';
import { SimWorld, sameState, stateKey, type WorldChange } from './world/sim-world.js';

/**
 * What the local source reads from a target: folder names, the block names of the version and,
 * when it has them, the runtime's vehicle keys (B429).
 */
export type LocalSourceTarget = CatalogueTarget & ControlsTarget & CommandsTarget & TradersTarget;

/** Options of a {@link LocalWorldSource}. */
export interface LocalSourceOptions {
  /** The lowered files (ADR 0085 D3). */
  readonly files: SimFiles;
  /** The target they were lowered for. */
  readonly target: LocalSourceTarget;
  /** Vanilla block state definitions by id, for props from the picker. */
  readonly vanillaBlockstates?: ReadonlyMap<string, string>;
  /** The seed of the mobs' wander; the same seed walks the same way. Default 1. */
  readonly seed?: number;
  /** Where the player starts (feet); default the middle of the area on the floor. */
  readonly start?: Vec3;
  /** The most log lines kept for {@link LocalWorldSource.lines}; default {@link LOG_LIMIT}. */
  readonly logLimit?: number;
  /** How trigger chances are decided (B396); default `random` (seeded by `seed`). */
  readonly chance?: ChanceMode;
  /** The project's rule books, to name the rule behind each plain action (B396). */
  readonly ruleBooks?: readonly RuleBookInfo[];
  /** Runs the project's scripts (B400); without it scripts are said to run only in the game. */
  readonly scripts?: LocalSourceScripts;
}

/** How the local source runs scripts (B400). */
export interface LocalSourceScripts {
  /** Where they run: the app's worker, or in process. */
  readonly runner: ScriptRunner;
  /** The Script API description (`script-api-v1.json`). */
  readonly api: ScriptApiDescription;
  /** `msm.version`. */
  readonly version?: string;
}

/** The most log lines the source keeps. */
export const LOG_LIMIT = 200;

/** What the player points at: a block (or the floor) or a mob, whichever is nearer. */
export type PointedAt =
  | { readonly kind: 'block'; readonly block: PickResult }
  | { readonly kind: 'entity'; readonly entity: EntityHit; readonly block: PickResult | null }
  | { readonly kind: 'vehicle'; readonly vehicle: VehicleHit; readonly block: PickResult | null }
  | null;

/** A screen the player has open (B398). */
export interface OpenScreen {
  /** The block that opened it. */
  readonly pos: BlockPos;
  /** Its id and name in plain words. */
  readonly block: string;
  readonly displayName: string;
  /** The slots to draw. */
  readonly spec: ScreenSpec;
  /** Where log lines about the block point. */
  readonly origin: SimOrigin;
}

/** What {@link LocalWorldSource.loadGround} did. */
export interface GroundLoadResult {
  /** Cells filled. */
  readonly blocks: number;
  /** Kinds of vanilla blocks in the ground (each a prop). */
  readonly props: number;
  /** Blocks left out because neither the project nor Minecraft has them (another mod's), by id. */
  readonly leftOut: ReadonlyMap<string, number>;
  /** Where the player now stands (feet). */
  readonly start: Vec3;
}

/** The id the floor reports in a pick result's state readouts. */
export const FLOOR_NAME = 'msm:try_it_floor';

/** The look the view passes for picking: its own, smoother yaw and pitch, and the alpha. */
export interface PickLook {
  readonly alpha?: number;
  readonly yaw?: number;
  readonly pitch?: number;
}

/**
 * The block the ray from `origin` along `direction` hits on the floor (the top face of the layer
 * below the area), within `reach` and inside the area; `null` otherwise.
 */
export function pickFloor(
  world: Pick<SimWorld, 'isFloor'>,
  origin: Vec3,
  direction: Vec3,
  reach: number = REACH,
): PickResult | null {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length === 0 || direction.y >= 0 || origin.y < 0) return null;
  const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  const t = origin.y / -d.y;
  if (t > reach) return null;
  const point = { x: origin.x + d.x * t, y: 0, z: origin.z + d.z * t };
  const pos = { x: Math.floor(point.x), y: -1, z: Math.floor(point.z) };
  if (!world.isFloor(pos)) return null;
  return {
    pos,
    face: 'up',
    hit: { x: point.x - pos.x, y: 1, z: point.z - pos.z },
    point,
    distance: t,
    box: 0,
  };
}

const samePos = (a: BlockPos, b: BlockPos): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

/** The local simulation behind Try it; see the module comment. */
export class LocalWorldSource implements WorldSource {
  /** The blocks of the area. */
  readonly world: SimWorld;
  /** The player. */
  readonly player: PlayerController;
  /** The mobs. */
  readonly entities: EntityWorld;
  /** The vehicles (B428). */
  readonly vehicles: VehicleWorld;
  /** Key binds, the HUD and the vehicle dashboard (B429). */
  readonly controls: SimControls;
  /** Signs, weathering, the place and explosion rules, the chat box and bags (B463). */
  readonly parity2: Types2Area;
  /** Project fluids: buckets, drawing, `on_entity_inside` (B483). */
  readonly fluids: FluidArea;
  /** Trader mobs and the merchant screen (B483). */
  readonly traders: TraderArea;
  /** The area's scripts (B400), or `null` when they run only in the game. */
  readonly scripts: ScriptBridge | null;

  private files: SimFiles;
  private target: LocalSourceTarget;
  private vanillaBlockstates: ReadonlyMap<string, string> | undefined;
  private blockCatalogue: BlockCatalogue;
  private entityCatalogue: EntityCatalogue;
  private readonly timers: BlockTimers;
  private readonly triggers: TriggerEngine;
  private readonly traceNow: SimTrace;
  private readonly listeners = new Set<WorldListener>();
  private readonly logLines: SimLogLine[] = [];
  private readonly logLimit: number;
  private readonly said = new Set<string>();
  private input: PlayerInput = IDLE_INPUT;
  /** The item in hand as the last click had it (scripts' `Player.heldItem`). */
  private heldNow: string | undefined;
  private screens: Map<string, ScreenSpec>;
  private screenNow: OpenScreen | null = null;
  private ticks = 0;
  private readonly unsubscribeWorld: () => void;
  private groundKind: GroundKind = 'grid';
  private groundBlocks: GroundBlocks = emptyGround();
  /** Vanilla ids of the loaded ground: summed up in one line, not one line each. */
  private groundIds = new Set<string>();

  /** The log every part of the simulation writes to; lines go out as `log` events. */
  readonly log: SimLog = {
    info: (text, origin) => this.writeLine(text, false, origin),
    onlyInMinecraft: (what, origin) => {
      // A rebuilt catalogue says its lines again; the panel shows each one once.
      if (this.said.has(what)) return;
      this.said.add(what);
      this.writeLine(what, true, origin);
    },
  };

  /** Shapes that always ask the current catalogue, so the player survives a live edit. */
  private readonly shapes: BlockShapes = {
    collision: (state) => this.blockCatalogue.collision(state),
    outline: (state) => this.blockCatalogue.outline(state),
  };

  constructor(options: LocalSourceOptions) {
    this.files = options.files;
    this.target = options.target;
    this.vanillaBlockstates = options.vanillaBlockstates;
    this.logLimit = options.logLimit ?? LOG_LIMIT;
    this.world = new SimWorld();
    this.blockCatalogue = this.buildBlocks();
    this.entityCatalogue = buildEntityCatalogue(this.files, this.target, this.log);
    this.screens = screensFromFiles(this.files);
    const lookup: BlockLookup = (x, y, z) => this.world.get({ x, y, z });
    const start = options.start ?? {
      x: this.world.sizeX / 2 + 0.5,
      y: 0,
      z: this.world.sizeZ / 2 + 0.5,
    };
    this.player = new PlayerController(lookup, this.shapes, start);
    this.entities = new EntityWorld(
      this.world,
      this.shapes,
      this.entityCatalogue,
      this.log,
      options.seed === undefined ? {} : { seed: options.seed },
    );
    this.timers = new BlockTimers(this.world, this.blockCatalogue);
    this.vehicles = new VehicleWorld(
      {
        world: this.world,
        shapes: this.shapes,
        player: this.player,
        log: this.log,
        isWater: (state) =>
          state.name === 'minecraft:water' || state.properties.waterlogged === 'true',
        fire: (owner, eventId, ctx, sentence) =>
          this.triggers.fireOwned(owner, eventId, ctx, sentence),
        effect: (effect) => this.emit({ type: 'effect', effect }),
      },
      buildVehicleCatalogue(this.files, this.target, (text, origin) => this.log.info(text, origin)),
    );
    this.unsubscribeWorld = this.world.onChange((change: WorldChange) =>
      this.emit({ type: 'blockChanged', pos: change.pos, state: change.state }),
    );
    this.traceNow = new SimTrace(this.log, () => this.ticks);
    this.ruleBooksNow = options.ruleBooks ?? [];
    this.scripts =
      options.scripts === undefined
        ? null
        : new Bridge(
            {
              world: this.world,
              catalogue: () => this.blockCatalogue,
              player: this.player,
              entities: this.entities,
              inventory: () => this.triggers.inventory,
              trace: this.traceNow,
              effect: (effect) => this.emit({ type: 'effect', effect }),
              now: () => this.ticks,
              itemName: (id) => this.triggers.nameOfItem(id),
              heldItem: () => this.heldNow,
              ruleName: (book, key) => this.ruleNameOf(book, key),
              chance: () => this.triggers.chance,
            },
            {
              runner: options.scripts.runner,
              api: options.scripts.api,
              seed: options.seed ?? 1,
              ...(options.scripts.version === undefined
                ? {}
                : { version: options.scripts.version }),
            },
          );
    const bridge = this.scripts;
    this.controls = new SimControls(this.files, this.target, {
      now: () => this.ticks,
      player: this.player,
      vehicles: this.vehicles,
      screenOpen: () =>
        this.screenNow !== null ||
        this.parity2.bag !== null ||
        this.parity2.signEditing !== null ||
        this.traders.open !== null,
      fire: (owner, eventId, ctx, sentence) =>
        this.triggers.fireOwned(owner, eventId, ctx, sentence),
      trace: this.traceNow,
      log: this.log,
    });
    this.triggers = new TriggerEngine(readEventDefinitions(this.files, this.target), {
      world: this.world,
      catalogue: () => this.blockCatalogue,
      player: this.player,
      entities: this.entities,
      trace: this.traceNow,
      now: () => this.ticks,
      effect: (effect) => this.emit({ type: 'effect', effect }),
      seed: options.seed ?? 1,
      ...(options.chance === undefined ? {} : { chance: options.chance }),
      ...(options.ruleBooks === undefined ? {} : { ruleBooks: options.ruleBooks }),
      hud: this.controls.hudActions,
      ...(bridge === null
        ? {}
        : {
            scripts: {
              defines: (handler: string) => bridge.defines(handler),
              run: (handler: string, firing: Firing, eventId: string) => {
                bridge.runAction(handler, this.actionData(firing, eventId));
              },
            },
          }),
    });
    this.parity2 = new Types2Area(this.files, this.target, {
      world: this.world,
      catalogue: () => this.blockCatalogue,
      player: this.player,
      triggers: () => this.triggers,
      trace: this.traceNow,
      log: this.log,
      sayOnce: (key, what, origin) => this.blockCatalogue.sayOnce(key, what, origin),
      closeOtherScreens: () => this.closeScreen(),
      seed: options.seed ?? 1,
      ruleName: (book, key) => this.ruleNameOf(book, key),
      ...(bridge === null
        ? {}
        : {
            commandUsed: (id, _sentence, used) => {
              bridge.fire('command', {
                id,
                name: used.name,
                source: PLAYER_VALUE,
                args: commandArgs(used.args),
              });
              return true;
            },
            chatSaid: (text) => bridge.fire('player.chat', { player: PLAYER_VALUE, message: text }),
          }),
    });
    this.fluids = new FluidArea(this.files, this.target, {
      world: this.world,
      actors: () => [
        { actor: PLAYER, box: this.player.box, name: 'You' },
        ...this.entities.entities().map((mob) => ({
          actor: { kind: 'mob' as const, id: mob.id },
          box: mob.box,
          name: mob.kind.displayName,
        })),
      ],
      triggers: () => this.triggers,
      log: this.log,
      now: () => this.ticks,
    });
    this.traders = new TraderArea(this.files, this.target, {
      entities: this.entities,
      triggers: () => this.triggers,
      log: this.log,
      effect: (effect) => this.emit({ type: 'effect', effect }),
      seed: options.seed ?? 1,
    });
  }

  private ruleBooksNow: readonly RuleBookInfo[] = [];

  private ruleNameOf(book: string, key: string): string | undefined {
    return this.ruleBooksNow.find((one) => one.id === book)?.rules.find((rule) => rule.key === key)
      ?.name;
  }

  private buildBlocks(): BlockCatalogue {
    const catalogue = buildCatalogue(this.files, this.target, this.log, {
      ...(this.vanillaBlockstates === undefined
        ? {}
        : { vanillaBlockstates: this.vanillaBlockstates }),
      quietProps: (id) => this.groundIds.has(id),
    });
    // Project fluids' liquid blocks (B483).
    addFluidBlocks(catalogue, readFluids(this.files, this.target));
    return catalogue;
  }

  /** The ground the area was last loaded with (B405). */
  get ground(): GroundKind {
    return this.groundKind;
  }

  /**
   * Replaces the whole area with a ground (B405, ADR 0087 D1): blocks, mobs, timers, the open
   * screen and the trace go, the ground's blocks come in, and the player stands on the surface
   * at the centre. Vanilla states become props through the catalogue (unknown properties
   * dropped, missing ones set to their defaults); blocks neither the project nor Minecraft has
   * (another mod's) are left out with a line. "Clear the area" later brings this ground back.
   */
  loadGround(kind: GroundKind, ground: GroundBlocks = emptyGround()): GroundLoadResult {
    this.groundKind = kind;
    this.groundBlocks = ground;
    const ids = new Set<string>();
    for (const text of ground.palette) {
      const id = groundState(text).name;
      if (id.startsWith('minecraft:') && id !== GROUND_AIR) ids.add(id);
    }
    this.groundIds = ids;
    const result = this.fillGround();
    this.traceNow.clear();
    if (kind !== 'grid') {
      if (result.props > 0) {
        this.log.onlyInMinecraft(
          `The ground's Minecraft blocks (${result.props} kind${result.props === 1 ? '' : 's'}) are props here: drawn and solid, nothing more`,
        );
      }
      if ([...ids].some((id) => this.blockCatalogue.isLiquid({ name: id, properties: {} }))) {
        this.log.onlyInMinecraft(
          'Water and lava are drawn but do not flow, and you walk through them as through air',
        );
      }
      for (const [id, count] of result.leftOut) {
        this.log.info(
          `${count} block${count === 1 ? '' : 's'} of ${id} ${count === 1 ? 'was' : 'were'} left out: neither your project nor Minecraft has that block.`,
        );
      }
    }
    return result;
  }

  /** Empties the area and fills it with the current ground. */
  private fillGround(): GroundLoadResult {
    this.scripts?.resync();
    this.screenNow = null;
    this.vehicles.clear();
    this.timers.clear();
    this.entities.clear();
    this.world.clear();
    this.triggers.clear();
    this.controls.clear();
    this.parity2.clear();
    this.fluids.clear();
    this.traders.clear();
    this.emit({ type: 'entities', entities: [] });
    const ground = this.groundBlocks;
    const { size } = ground;
    // One state per palette entry, through the catalogue.
    const leftOutBySlot = new Map<number, string>();
    const states = ground.palette.map((text, slot): BlockState | null => {
      if (slot === 0) return null;
      const parsed = groundState(text);
      if (parsed.name === GROUND_AIR) return null;
      const normal = this.blockCatalogue.normalise(parsed);
      if (normal === null) leftOutBySlot.set(slot, parsed.name);
      return normal;
    });
    const leftOut = new Map<string, number>();
    let blocks = 0;
    const sizeX = Math.min(size.x, this.world.sizeX);
    const sizeY = Math.min(size.y, this.world.sizeY);
    const sizeZ = Math.min(size.z, this.world.sizeZ);
    for (let y = 0; y < sizeY; y += 1) {
      for (let z = 0; z < sizeZ; z += 1) {
        for (let x = 0; x < sizeX; x += 1) {
          const slot = ground.blocks[(y * size.z + z) * size.x + x] as number;
          if (slot === 0) continue;
          const state = states[slot] ?? null;
          if (state === null) {
            const id = leftOutBySlot.get(slot);
            if (id !== undefined) leftOut.set(id, (leftOut.get(id) ?? 0) + 1);
            continue;
          }
          this.world.set({ x, y, z }, state);
          blocks += 1;
        }
      }
    }
    const start = this.surfaceStart();
    this.player.teleport(start);
    this.player.setFlying(false);
    return { blocks, props: this.groundIds.size, leftOut, start };
  }

  /** Feet on the highest block something can stand on in the centre column (or the floor). */
  private surfaceStart(): Vec3 {
    const x = Math.floor(this.world.sizeX / 2);
    const z = Math.floor(this.world.sizeZ / 2);
    let top = 0;
    for (let y = this.world.sizeY - 1; y >= 0; y -= 1) {
      const state = this.world.get({ x, y, z });
      if (state === null) continue;
      const boxes = this.blockCatalogue.collision(state);
      if (boxes.length === 0) continue;
      top = y + Math.max(...boxes.map((box) => box[4]));
      break;
    }
    return { x: x + 0.5, y: top, z: z + 0.5 };
  }

  /** The block catalogue of the current files. */
  get catalogue(): BlockCatalogue {
    return this.blockCatalogue;
  }

  /** The mob catalogue of the current files. */
  get mobs(): EntityCatalogue {
    return this.entityCatalogue;
  }

  /** The current lowered files. */
  get sourceFiles(): SimFiles {
    return this.files;
  }

  /** Ticks run since the source was made. */
  get ticksRun(): number {
    return this.ticks;
  }

  /** Buttons and plates waiting to let go. */
  get pendingTimers(): number {
    return this.timers.pending;
  }

  /** The log lines kept, oldest first. */
  get lines(): readonly SimLogLine[] {
    return this.logLines;
  }

  /** The "What happened" trace (B396): triggers, actions and "Only in Minecraft" entries. */
  get trace(): readonly TraceEntry[] {
    return this.traceNow.entries;
  }

  /** The simple hotbar inventory `give_item` fills (B396). */
  get inventory(): SimInventory {
    return this.triggers.inventory;
  }

  /** How trigger chances are decided now. */
  get chance(): ChanceMode {
    return this.triggers.chance;
  }

  /** `always` ("Run every time"), `never` or `random` (seeded) for trigger chances. */
  setChanceMode(mode: ChanceMode): void {
    this.triggers.setChanceMode(mode);
  }

  /** The project's rule books, to name the rule behind each plain action (B396). */
  setRuleBooks(books: readonly RuleBookInfo[]): void {
    this.ruleBooksNow = books;
    this.triggers.setRuleBooks(books);
  }

  /** The screen the player has open, or `null` (B398). */
  get screen(): OpenScreen | null {
    return this.screenNow;
  }

  /** A display name for an item or block id, as the trace names it (the inventory row). */
  itemName(id: string): string {
    return this.triggers.nameOfItem(id);
  }

  /**
   * Closes the open screen (B398): the block's `open` property goes back and the container's
   * `on_close` fires. Nothing happens without an open screen.
   */
  closeScreen(): void {
    const screen = this.screenNow;
    if (screen === null) return;
    this.screenNow = null;
    const state = this.world.get(screen.pos);
    if (state === null || state.name !== screen.block) return;
    if (state.properties.open === 'true') {
      this.world.set(screen.pos, {
        name: state.name,
        properties: { ...state.properties, open: 'false' },
      });
    }
    this.triggers.blockClosed(screen.pos);
  }

  subscribe(listener: WorldListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  act(action: PlayerAction): void {
    switch (action.type) {
      case 'move':
        this.input = {
          forward: action.forward,
          strafe: action.strafe,
          jump: action.jump,
          sneak: action.sneak,
          toggleFly: action.toggleFly || this.input.toggleFly,
          yaw: action.yaw,
          pitch: action.pitch,
        };
        return;
      case 'place':
        this.placeHeld(action.pos, action.face, action.hit, action.block);
        return;
      case 'break': {
        const target = this.world.get(action.pos);
        if (target === null || this.scripts === null) {
          this.breakNow(action.pos);
          return;
        }
        // `block.break` (`PlayerBlockBreakEvents.BEFORE`) may keep the block.
        this.scripts.ask(
          'block.break',
          { block: blockValue(action.pos, stateKey(target)), player: PLAYER_VALUE },
          (decision) => {
            if (decision.cancelled) {
              this.log.info(`A script stopped the breaking of ${this.nameOf(target.name)}.`);
              return;
            }
            this.breakNow(action.pos);
          },
        );
        return;
      }
      case 'use':
        this.heldNow = action.item;
        this.use(action);
        return;
      case 'hit':
        this.hit(action.entity);
        return;
      case 'interact':
        this.heldNow = action.item;
        this.interact(action.entity);
        return;
      case 'useVehicle':
        this.vehicles.use(action.vehicle, action.item);
        return;
      case 'hitVehicle':
        this.vehicles.hit(action.vehicle, this.player.sneaking);
        return;
      case 'tool': {
        if (action.tool === EXPLODE_TOOL) {
          if (this.scripts === null) {
            this.parity2.explode(action.pos);
            return;
          }
          // `world.explosion`: the scripts' answer, not the script text (B400).
          const pos = action.pos;
          this.scripts.ask(
            'world.explosion',
            {
              pos: posValue({ x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 }),
              radius: EXPLOSION_RADIUS,
              source: null,
              cause: 'block',
            },
            (decision) => this.parity2.explode(pos, decision),
          );
          return;
        }
        const before = this.world.get(action.pos);
        applyTool(this.world, this.blockCatalogue, this.log, action.tool, action.pos);
        this.triggers.powerChanged(action.pos, before, this.world.get(action.pos));
        return;
      }
      case 'clear':
        this.clear();
        return;
    }
  }

  /** Runs one tick; see the module comment. */
  tick(): void {
    this.ticks += 1;
    const wasRiding = this.vehicles.riding !== null;
    const gotOut = this.vehicles.tick(this.input);
    if (!wasRiding) this.player.step(this.input);
    else if (gotOut) this.input = { ...this.input, sneak: false };
    if (this.input.toggleFly) this.input = { ...this.input, toggleFly: false };
    const snapshots = this.entities.step();
    this.emit({ type: 'entities', entities: snapshots });
    this.timers.tick([this.player.box, ...this.entities.boxes(), ...this.vehicles.boxes()]);
    this.triggers.tick();
    this.controls.tick();
    this.parity2.tick();
    this.fluids.tick();
    this.traders.tick();
    this.scripts?.tick();
  }

  /** A time-lapse step of weathering: one in-game day of random ticks at once (B463). */
  timeLapse(): void {
    this.parity2.timeLapse();
    this.traders.passTime(TIME_LAPSE_TICKS);
  }

  /** Runs a line typed in the chat box (B463). */
  chat(line: string): ChatLine {
    return this.parity2.chat(line);
  }

  /**
   * Uses the held item with nothing pointed at (B463): a bag opens its screen. Returns false
   * when the item has no use in the air here.
   */
  useItem(item: string): boolean {
    this.heldNow = item;
    const scripts = this.scripts;
    if (scripts?.hears('item.use') === true) {
      // `item.use` (`UseItemCallback`) first; a cancel stops the item's own use.
      scripts.ask(
        'item.use',
        { item: itemValue(item), player: PLAYER_VALUE, hand: 'main' },
        (decision) => {
          if (decision.cancelled) {
            this.log.info(`A script stopped the use of ${this.itemName(item)}.`);
            return;
          }
          if (!this.parity2.useItem(item)) this.triggers.itemUsed(item);
        },
      );
      return true;
    }
    if (this.parity2.useItem(item)) return true;
    return this.triggers.itemUsed(item).fired;
  }

  /**
   * Loads the project's scripts, transpiled (B400); `problems` are those that could not be. Does
   * nothing without {@link LocalSourceOptions.scripts}.
   */
  loadScripts(scripts: readonly CompiledScript[], problems: readonly ScriptProblem[] = []): void {
    this.scripts?.load(scripts, problems);
  }

  /**
   * What the player points at with `look` (the view's smoother look by default the player's):
   * the nearer of the block (or floor) and the mob.
   */
  pointedAt(look: PickLook = {}): PointedAt {
    const alpha = look.alpha ?? 1;
    const yaw = look.yaw ?? this.player.yaw;
    const pitch = look.pitch ?? this.player.pitch;
    const eye = this.player.eyePosition(alpha);
    const direction = lookDirection(yaw, pitch);
    const lookup: BlockLookup = (x, y, z) => this.world.get({ x, y, z });
    const blockHit = pick(lookup, this.shapes, eye, direction, REACH);
    const floorHit = pickFloor(this.world, eye, direction, REACH);
    const block =
      blockHit === null
        ? floorHit
        : floorHit === null || blockHit.distance <= floorHit.distance
          ? blockHit
          : floorHit;
    const entity = this.entities.pick(eye, direction, REACH);
    const vehicle = this.vehicles.pick(eye, direction, REACH);
    if (
      vehicle !== null &&
      (block === null || vehicle.distance < block.distance) &&
      (entity === null || vehicle.distance < entity.distance)
    ) {
      return { kind: 'vehicle', vehicle, block };
    }
    if (entity !== null && (block === null || entity.distance < block.distance)) {
      return { kind: 'entity', entity, block };
    }
    return block === null ? null : { kind: 'block', block };
  }

  /**
   * New lowered files after an edit (ADR 0085 D4): the catalogues are built again and the world
   * kept. A block the project no longer has is taken out with a log line; a state the block no
   * longer has falls back to its default; mobs follow `EntityWorld.setCatalogue`.
   */
  setFiles(
    files: SimFiles,
    target: LocalSourceTarget = this.target,
    vanillaBlockstates: ReadonlyMap<string, string> | undefined = this.vanillaBlockstates,
  ): void {
    if (
      files === this.files &&
      target === this.target &&
      vanillaBlockstates === this.vanillaBlockstates
    ) {
      return;
    }
    const before = this.blockCatalogue;
    this.files = files;
    this.target = target;
    this.vanillaBlockstates = vanillaBlockstates;
    this.blockCatalogue = this.buildBlocks();
    this.entityCatalogue = buildEntityCatalogue(files, target, this.log);
    this.screens = screensFromFiles(files);
    const removed = new Map<string, string>();
    // The world shares one frozen object per state, so each is looked at once (a ground holds
    // tens of thousands of blocks of a few dozen states).
    const memo = new Map<BlockState, BlockState | null | 'same'>();
    for (const { pos, state } of [...this.world.blocks()]) {
      let next = memo.get(state);
      if (next === undefined) {
        const block = this.blockCatalogue.blockFor(state.name);
        if (block === undefined) {
          next = null;
          removed.set(state.name, before.get(state.name)?.displayName ?? state.name);
        } else {
          const normal = this.blockCatalogue.normalise(state);
          next = normal === null || sameState(normal, state) ? 'same' : normal;
        }
        memo.set(state, next);
      }
      if (next !== 'same') this.world.set(pos, next);
    }
    for (const [id, name] of removed) {
      this.log.info(`${name} is no longer in the project; it was taken out of the preview.`, {
        elementId: id,
      });
    }
    this.entities.setCatalogue(this.entityCatalogue, this.shapes);
    this.vehicles.setCatalogue(
      buildVehicleCatalogue(files, target, (text, origin) => this.log.info(text, origin)),
    );
    this.timers.setCatalogue(this.blockCatalogue);
    this.triggers.setDefinitions(readEventDefinitions(files, target));
    this.controls.setFiles(files, target);
    this.parity2.setFiles(files, target);
    this.fluids.setFiles(files, target);
    this.traders.setFiles(files, target);
    const open = this.screenNow;
    if (open !== null) {
      const spec = this.screens.get(open.block);
      if (spec === undefined || this.world.get(open.pos)?.name !== open.block)
        this.screenNow = null;
      else this.screenNow = { ...open, spec };
    }
  }

  /**
   * "Clear the area": blocks, mobs and timers go. On the grid the player stays; on another
   * ground (B405) the ground comes back as it was loaded and the player stands on it again.
   */
  clear(): void {
    if (this.groundKind !== 'grid') {
      this.fillGround();
      this.traceNow.clear();
      this.log.info('You cleared the area; the ground is back as it was.');
      return;
    }
    this.screenNow = null;
    this.vehicles.clear();
    this.timers.clear();
    this.entities.clear();
    this.world.clear();
    this.triggers.clear();
    this.controls.clear();
    this.parity2.clear();
    this.fluids.clear();
    this.traders.clear();
    this.traceNow.clear();
    this.emit({ type: 'entities', entities: [] });
    this.log.info('You cleared the area.');
  }

  /** Stops listening to the world; the source should not be used afterwards. */
  dispose(): void {
    this.unsubscribeWorld();
    this.scripts?.dispose();
    this.listeners.clear();
  }

  /**
   * A right click on a block, in the order of the runtime (see `events/triggers.ts`): the block
   * first (its use by hand, then `msm:on_interact`) unless the player sneaks with something in
   * hand; then the held item on the block (`msm:on_use_on_block`, a block placed, an egg
   * hatched); then the item's own `msm:on_use` when nothing took the click.
   */
  private use(action: Extract<PlayerAction, { type: 'use' }>): void {
    const target = this.world.get(action.pos);
    if (target !== null && this.scripts?.hears('block.interact') === true) {
      // `block.interact` (`UseBlockCallback`) comes before anything else of the click.
      this.scripts.ask(
        'block.interact',
        {
          block: blockValue(action.pos, stateKey(target)),
          player: PLAYER_VALUE,
          hand: 'main',
        },
        (decision) => {
          if (decision.cancelled) {
            this.log.info(
              `A script refused your use of ${this.nameOf(target.name)}; nothing happened.`,
            );
            return;
          }
          this.useNow(action);
        },
      );
      return;
    }
    this.useNow(action);
  }

  /** {@link use} after the scripts' `block.interact`. */
  private useNow(action: Extract<PlayerAction, { type: 'use' }>): void {
    const item = action.item;
    const target = this.world.get(action.pos);
    const block = target === null ? undefined : this.blockCatalogue.blockFor(target.name);
    const secondaryUse = this.player.sneaking && item !== undefined;
    if (target !== null && !secondaryUse) {
      let taken = this.openScreen(action.pos, target);
      if (block !== undefined && this.parity2.use(action.pos, target, block, item).taken)
        taken = true;
      if (
        block !== undefined &&
        ['door', 'trapdoor', 'fence_gate', 'button'].includes(block.type)
      ) {
        const result = useBlock(this.world, this.blockCatalogue, {
          pos: action.pos,
          yaw: this.player.yaw,
        });
        if (result.handled && result.message !== undefined) this.log.info(result.message);
        this.timers.afterUse(action.pos, result);
        taken = result.handled;
      }
      // `{handled: false}` falls through to the block's triggers.
      if (this.triggers.blockUsed(action.pos).fired) taken = true;
      if (taken) return;
    }
    if (item === undefined) return;
    const point = {
      x: action.pos.x + action.hit.x,
      y: action.pos.y + action.hit.y,
      z: action.pos.z + action.hit.z,
    };
    if (this.triggers.itemUsedOn(item, action.pos, point).fired) return;
    if (this.parity2.useItem(item)) return;
    // A project fluid's bucket pours a source of it where a block would go (B483).
    const fluid = this.fluids.bucketOf(item);
    if (fluid !== undefined) {
      const placed = this.place(action.pos, action.face, action.hit, fluid.id);
      if (placed !== null) this.fluids.poured(fluid, placed);
      return;
    }
    if (this.vehicles.isVehicleItem(item)) {
      this.vehicles.place(item, action, this.player.yaw);
      return;
    }
    if (this.entityCatalogue.entityForEgg(item) !== undefined) {
      const spawned = this.entities.spawnFromEgg(item, { pos: action.pos, face: action.face });
      if (spawned.spawned) this.triggers.mobSpawned(spawned.entity.id);
      return;
    }
    if (this.blockCatalogue.blockFor(item) !== undefined) {
      this.placeHeld(action.pos, action.face, action.hit, item);
      return;
    }
    if (this.triggers.itemUsed(item).fired) return;
    if (this.triggers.events.get('item', item) !== undefined) {
      this.log.info(
        `You used ${this.triggers.events.get('item', item)?.displayName}; nothing happens.`,
      );
      return;
    }
    this.log.info(`${item} is not a block or a spawn egg of the project`);
  }

  /**
   * Opens the screen of a container or machine block (the game's menu opens before the block's
   * events fire); `false` for a block without one.
   */
  private openScreen(pos: BlockPos, state: BlockState): boolean {
    const spec = this.screens.get(state.name);
    if (spec === undefined) return false;
    if (this.screenNow !== null) this.closeScreen();
    this.parity2.closeBag();
    this.parity2.closeSignEditor();
    // The game's client lets go of every held key when a screen opens (ADR 0088 D4).
    this.controls.keys.releaseAll();
    const block = this.blockCatalogue.blockFor(state.name);
    const displayName = block?.displayName ?? state.name;
    const origin: SimOrigin = block?.origin ?? { elementId: state.name };
    this.screenNow = { pos, block: state.name, displayName, spec, origin };
    if (state.properties.open === 'false') {
      this.world.set(pos, { name: state.name, properties: { ...state.properties, open: 'true' } });
    }
    this.triggers.screenOpened({ id: state.name, displayName, origin });
    return true;
  }

  /**
   * A right click on a mob, in the runtime's order (B474, B479): a sneaking use of a mob's store,
   * the merchant screen of a trader (B483), then its `msm:on_interact`.
   */
  private interact(id: number): void {
    const mob = this.entities.entity(id);
    if (mob === undefined) return;
    if (this.scripts?.hears('entity.interact') === true) {
      // `entity.interact` (`UseEntityCallback`) comes before the mob's own use.
      this.scripts.ask(
        'entity.interact',
        { entity: mobValue(id), player: PLAYER_VALUE, hand: 'main' },
        (decision) => {
          if (decision.cancelled) {
            this.log.info(`A script refused your use of ${mob.kind.displayName}.`, mob.kind.origin);
            return;
          }
          this.interactNow(id);
        },
      );
      return;
    }
    this.interactNow(id);
  }

  /** {@link interact} after the scripts' `entity.interact`. */
  private interactNow(id: number): void {
    const mob = this.entities.entity(id);
    if (mob === undefined) return;
    const traded = this.traders.use(id, this.player.sneaking);
    if (traded === 'opened') {
      if (this.screenNow !== null) this.closeScreen();
      this.parity2.closeBag();
      this.parity2.closeSignEditor();
      this.controls.keys.releaseAll();
    }
    if (traded !== 'passed') return;
    if (!this.triggers.mobInteracted(id).fired) {
      this.log.info(
        `You used ${mob.kind.displayName}; nothing happens in the preview.`,
        mob.kind.origin,
      );
    }
  }

  /** A hit removes the mob (B393) and fires its `msm:on_death`. */
  private hit(id: number): void {
    const mob = this.entities.entity(id);
    if (mob === undefined) return;
    const type = mob.kind.id;
    const position = mob.position;
    const name = mob.kind.displayName;
    if (!this.entities.hit(id)) return;
    this.triggers.mobDied(type, id, position);
    this.scripts?.fire('entity.death', {
      entity: {
        $entity: {
          kind: 'gone',
          mob: { id, type, name, pos: [position.x, position.y, position.z] },
        },
      },
      attacker: PLAYER_VALUE,
    });
  }

  /**
   * Places the held block: with scripts, after their `block.place` (a cancel places nothing);
   * else as {@link place}.
   */
  private placeHeld(pos: BlockPos, face: Face, hit: Vec3, block: string): void {
    const scripts = this.scripts;
    if (scripts === null) {
      this.place(pos, face, hit, block);
      return;
    }
    const target = adjacentPos(pos, face);
    scripts.ask(
      'block.place',
      {
        pos: posValue(target),
        block,
        item: itemValue(block),
        player: PLAYER_VALUE,
      },
      (decision: ScriptDecision) => {
        if (decision.cancelled) {
          this.log.info(`${this.nameOf(block)} was not placed: a script stopped the placing.`);
          return;
        }
        this.place(pos, face, hit, block);
      },
    );
  }

  /** Places a block as the player; returns where it went, or `null` when it was not placed. */
  private place(pos: BlockPos, face: Face, hit: Vec3, block: string): BlockPos | null {
    // `block.place` rules may stop it before anything changes (B463, ADR 0096 D3); with scripts
    // their own answer came before (B400).
    if (this.scripts === null && !this.parity2.placing(block, this.nameOf(block))) return null;
    // Record what was there, so a place that would trap the player or a mob can be undone.
    const previous: { pos: BlockPos; state: BlockState | null }[] = [];
    const stop = this.world.onChange((change) =>
      previous.push({ pos: change.pos, state: change.previous }),
    );
    let result: ReturnType<typeof placeBlock>;
    try {
      result = placeBlock(this.world, this.blockCatalogue, {
        pos,
        face,
        hit,
        block,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        sneak: this.player.sneaking,
      });
    } finally {
      stop();
    }
    if (!result.placed) {
      this.log.info(`${this.nameOf(block)} was not placed: ${result.reason}.`);
      return null;
    }
    const blocked = result.changes.some(
      (change) =>
        change.state !== null &&
        (this.player.wouldOverlap(change.pos, change.state) ||
          this.entities.wouldOverlap(change.pos, change.state)),
    );
    if (blocked) {
      for (const undo of previous.reverse()) this.world.set(undo.pos, undo.state);
      this.log.info(`${this.nameOf(block)} was not placed: you or a mob stand where it would go.`);
      return null;
    }
    this.triggers.blockPlaced(result.pos);
    this.parity2.placed(result.pos);
    this.traders.placed(block, result.pos, (id) => this.nameOf(id));
    return result.pos;
  }

  private nameOf(id: string): string {
    return this.blockCatalogue.blockFor(id)?.displayName ?? id;
  }

  /** Breaks a block as the player: `msm:on_break` fires before it goes (`playerWillDestroy`). */
  private breakNow(pos: BlockPos): void {
    if (this.screenNow !== null && samePos(this.screenNow.pos, pos)) this.closeScreen();
    if (this.world.get(pos) !== null) this.triggers.blockBreaking(pos);
    breakBlock(this.world, this.blockCatalogue, pos);
  }

  /** A `run_script` firing as the `ActionEvent` scripts get (ADR 0032 D4). */
  private actionData(firing: Firing, eventId: string): Record<string, EncodedValue> {
    const { ctx, owner } = firing;
    const state = ctx.block === undefined ? null : this.world.get(ctx.block);
    const actor = (one: typeof ctx.other): EncodedValue =>
      one === undefined ? null : one.kind === 'player' ? PLAYER_VALUE : mobValue(one.id);
    return {
      owner: owner.id,
      event: eventId,
      pos: posValue(ctx.block ?? ctx.base),
      block:
        ctx.block === undefined || state === null ? null : blockValue(ctx.block, stateKey(state)),
      entity: ctx.entity === undefined ? null : mobValue(ctx.entity),
      player: ctx.player ? PLAYER_VALUE : null,
      other: actor(ctx.other),
    };
  }

  private writeLine(text: string, onlyInMinecraft: boolean, origin?: SimOrigin): void {
    const line: SimLogLine = {
      tick: this.ticks,
      text,
      onlyInMinecraft,
      ...(origin === undefined ? {} : { origin }),
    };
    this.logLines.push(line);
    if (this.logLines.length > this.logLimit)
      this.logLines.splice(0, this.logLines.length - this.logLimit);
    this.emit({ type: 'log', line });
  }

  private emit(event: WorldEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

/** A command's argument values as event data (positions as `[x, y, z]`, ADR 0096). */
function commandArgs(args: Readonly<Record<string, unknown>>): Record<string, EncodedValue> {
  const out: Record<string, EncodedValue> = {};
  for (const [name, value] of Object.entries(args)) {
    out[name] = Array.isArray(value)
      ? value.map((one) => (typeof one === 'number' ? one : String(one)))
      : typeof value === 'number' || typeof value === 'boolean'
        ? value
        : String(value);
  }
  return out;
}
