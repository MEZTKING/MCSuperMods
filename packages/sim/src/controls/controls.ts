/**
 * Key binds and the HUD of one Try it area (B429, ADR 0088, ADR 0089, ADR 0091 D6): the
 * {@link KeyBindEngine}, the {@link SimHud}, the vehicle dashboard and the hooks the `show_hud`,
 * `hide_hud` and `set_hud` actions call. `LocalWorldSource` owns one and calls `tick` at the end
 * of each tick, `setFiles` after an edit and `clear` for "Clear the area".
 */
import type { RuntimeKeyFacts, TargetFacts } from '@msm/plugin-api';
import { type ActionHud, type EventContext, PLAYER } from '../events/actions.js';
import type { EventOwner } from '../events/definitions.js';
import type { SimTrace } from '../events/trace.js';
import type { PlayerController } from '../player/controller.js';
import type { SimFiles, SimLog } from '../types.js';
import type { CatalogueVehicle } from '../vehicles/catalogue.js';
import type { VehicleSnapshot, VehicleWorld } from '../vehicles/vehicle-world.js';
import { type DashboardRow, dashboardRows } from './dashboard.js';
import { readHudElements, SimHud } from './hud.js';
import { buildKeyBindCatalogue } from './key-binds.js';
import { KeyBindEngine, type KeyRiding } from './key-engine.js';

/** What the controls read from a target: the language folder and the runtime's vehicle keys. */
export type ControlsTarget = Pick<TargetFacts, 'folders'> & Partial<Pick<TargetFacts, 'controls'>>;

/** What the controls work with. */
export interface ControlsHost {
  /** The current tick. */
  now(): number;
  readonly player: Pick<PlayerController, 'position'>;
  readonly vehicles: Pick<VehicleWorld, 'riding' | 'snapshot' | 'types'>;
  /** Whether a screen is open (presses are ignored then). */
  screenOpen(): boolean;
  /** Runs one event of an owner (the trigger engine's `fireOwned`). */
  fire(owner: EventOwner, eventId: string, ctx: EventContext, sentence: string): void;
  readonly trace: SimTrace;
  readonly log: SimLog;
}

/** The key binds, the HUD and the dashboard of one area; see the module comment. */
export class SimControls {
  readonly keys: KeyBindEngine;
  readonly hud: SimHud;
  private target: ControlsTarget;
  private readonly host: ControlsHost;

  /** The hooks the trigger engine gives the HUD actions. */
  readonly hudActions: ActionHud = {
    has: (id) => this.hud.get(id) !== undefined,
    show: (id) => this.hud.show(id),
    hide: (id) => this.hud.hide(id),
    set: (id, value) => this.hud.set(id, value),
    name: (id) => this.hud.get(id)?.displayName ?? id,
  };

  constructor(files: SimFiles, target: ControlsTarget, host: ControlsHost) {
    this.target = target;
    this.host = host;
    this.keys = new KeyBindEngine(buildKeyBindCatalogue(files, target), {
      now: host.now,
      riding: () => this.ridingNow(),
      screenOpen: host.screenOpen,
      context: () => this.context(),
      fire: host.fire,
      trace: host.trace,
      log: host.log,
      vehicle: (type) => host.vehicles.types.get(type),
      runtimeKeys: (): RuntimeKeyFacts | undefined => this.target.controls?.runtimeKeys,
    });
    this.hud = new SimHud(readHudElements(files, target), {
      position: () => host.player.position,
      riding: () => this.ridden(),
      log: host.log,
    });
  }

  /** New files after an edit: key binds and HUD elements read again; held keys of kept ids stay. */
  setFiles(files: SimFiles, target: ControlsTarget = this.target): void {
    this.target = target;
    this.keys.setCatalogue(buildKeyBindCatalogue(files, target));
    this.hud.setElements(readHudElements(files, target));
  }

  /** The end of a tick: `msm:while_held` of the held keys. */
  tick(): void {
    this.keys.tick();
  }

  /** "Clear the area": held keys, cooldowns and HUD state go, without events. */
  clear(): void {
    this.keys.clear();
    this.hud.clear();
  }

  /** The ridden vehicle's dashboard rows, top first (none on foot or with `hud: false`). */
  dashboard(): DashboardRow[] {
    const ridden = this.ridden();
    return ridden === null ? [] : dashboardRows(ridden.vehicle, ridden.snapshot);
  }

  private ridden(): { snapshot: VehicleSnapshot; vehicle?: CatalogueVehicle } | null {
    const id = this.host.vehicles.riding;
    if (id === null) return null;
    const snapshot = this.host.vehicles.snapshot(id);
    if (snapshot === undefined) return null;
    const vehicle = this.host.vehicles.types.get(snapshot.type);
    return vehicle === undefined ? { snapshot } : { snapshot, vehicle };
  }

  private ridingNow(): KeyRiding | null {
    const ridden = this.ridden();
    return ridden === null ? null : { type: ridden.snapshot.type, driving: ridden.snapshot.driven };
  }

  /** The player's item context (the runtime's `EventContext.forItem`). */
  private context(): EventContext {
    const feet = this.host.player.position;
    return {
      source: 'item',
      base: { x: Math.floor(feet.x), y: Math.floor(feet.y) - 1, z: Math.floor(feet.z) },
      origin: feet,
      player: true,
      other: PLAYER,
    };
  }
}
