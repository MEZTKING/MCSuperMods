/**
 * The vehicle panel of Try it (B428): beside the preview, for the vehicle the player drives or
 * points at, its name, speed, fuel and damage (standing in for the game's dashboard, ADR 0089
 * D5), with Get in or Get out, "Fill the tank" and "Repair" (the game's fuel and repair items
 * are rarely in Try it's hotbar). Also the hidden `tryit-vehicle-state` readout end-to-end
 * tests read, beside the view's own `tryit-state`.
 */

import type { CatalogueVehicle, VehicleSnapshot } from '@msm/sim';
import { Button } from '../../components/ui/Button';

/** What the panel reads from the simulation's vehicles. */
export interface VehiclePanelSource {
  readonly count: number;
  readonly riding: number | null;
  snapshot(id: number): VehicleSnapshot | undefined;
  kindOf(id: number): CatalogueVehicle | undefined;
}

/** Props of {@link VehiclePanel}. */
export interface VehiclePanelProps {
  vehicles: VehiclePanelSource;
  /** The vehicle the player points at, if any. */
  pointed: number | null;
  onGetIn(id: number): void;
  onGetOut(): void;
  onFillTank(id: number): void;
  onRepair(id: number): void;
}

/** Blocks a tick in blocks a second, one decimal. */
export function blocksPerSecond(speed: number): string {
  return (Math.round(Math.abs(speed) * 200) / 10).toFixed(1);
}

/** Fuel ticks in plain words: `1 min 30 s`, `45 s`, `empty`. */
export function fuelWords(ticks: number): string {
  if (ticks <= 0) return 'empty';
  const seconds = Math.ceil(ticks / 20);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** The panel, or only the readout when no vehicle is driven or pointed at. */
export function VehiclePanel(props: VehiclePanelProps) {
  const { vehicles } = props;
  const id = vehicles.riding ?? props.pointed;
  const snapshot = id === null ? undefined : vehicles.snapshot(id);
  const kind = id === null ? undefined : vehicles.kindOf(id);
  const riding = vehicles.riding === null ? undefined : vehicles.snapshot(vehicles.riding);
  const pointed = props.pointed === null ? undefined : vehicles.snapshot(props.pointed);
  const readout = (
    <output
      data-testid="tryit-vehicle-state"
      className="sr-only"
      aria-live="off"
      data-vehicles={vehicles.count}
      data-riding={riding?.type ?? ''}
      data-pointed={pointed?.type ?? ''}
      data-speed={riding === undefined ? '0' : String(round(riding.speed))}
      data-fuel={riding === undefined ? '0' : String(riding.fuel)}
      data-damage={snapshot === undefined ? '0' : String(round(snapshot.damage))}
      data-yaw={riding === undefined ? '0' : String(round(riding.yaw))}
      data-position={
        riding === undefined
          ? ''
          : `${riding.position.x.toFixed(2)} ${riding.position.y.toFixed(2)} ${riding.position.z.toFixed(2)}`
      }
    >
      {riding === undefined
        ? `${vehicles.count} vehicle${vehicles.count === 1 ? '' : 's'} in the area.`
        : `Driving ${vehicles.kindOf(riding.id)?.displayName ?? riding.type} at ${blocksPerSecond(riding.speed)} blocks a second.`}
    </output>
  );
  if (id === null || snapshot === undefined || kind === undefined) return readout;
  const driving = vehicles.riding === id;
  const fuel = kind.fuel;
  const health = Math.max(0, kind.maxHealth - snapshot.damage);
  return (
    <section
      aria-label="Vehicle"
      data-testid="tryit-vehicle"
      data-vehicle={kind.id}
      className="flex flex-col gap-1 rounded border border-border p-1"
    >
      {readout}
      <h3 className="font-medium">
        {kind.displayName}
        <span className="font-normal text-muted">{driving ? ' (you drive it)' : ''}</span>
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
        <dt>Speed</dt>
        <dd data-testid="tryit-vehicle-speed">{blocksPerSecond(snapshot.speed)} blocks a second</dd>
        <dt>Health</dt>
        <dd data-testid="tryit-vehicle-health">
          {round(health)} of {round(kind.maxHealth)}
        </dd>
        {fuel !== undefined && (
          <>
            <dt>Fuel</dt>
            <dd data-testid="tryit-vehicle-fuel">
              <meter
                className="mr-1 h-2 w-16 align-middle"
                min={0}
                max={fuel.capacity}
                value={snapshot.fuel}
                aria-label="Fuel"
              />
              {fuelWords(snapshot.fuel)}
            </dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-1">
        {driving ? (
          <Button type="button" data-testid="tryit-vehicle-get-out" onClick={props.onGetOut}>
            Get out
          </Button>
        ) : (
          <Button
            type="button"
            data-testid="tryit-vehicle-get-in"
            onClick={() => props.onGetIn(id)}
          >
            Get in
          </Button>
        )}
        {fuel !== undefined && (
          <Button
            type="button"
            data-testid="tryit-vehicle-fill"
            disabled={snapshot.fuel >= fuel.capacity}
            title="Fill the tank, as using its fuel on it in the game does"
            onClick={() => props.onFillTank(id)}
          >
            Fill the tank
          </Button>
        )}
        <Button
          type="button"
          data-testid="tryit-vehicle-repair"
          disabled={snapshot.damage <= 0}
          onClick={() => props.onRepair(id)}
        >
          Repair
        </Button>
      </div>
    </section>
  );
}
