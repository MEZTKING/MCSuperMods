/**
 * A vehicle's built-in dashboard in Try it (B429, ADR 0089 D5), the rows of the runtime's
 * `VehicleDashboard` (read only to match it): for the rider of a vehicle whose `hud` is not
 * `false`, read from the top: health, fuel when the vehicle needs fuel, then one row per weapon.
 * Each row is a label and how full its bar is. Weapons are only in the game (ADR 0091 D6), so a
 * weapon's row is always ready and its label has no ammunition count (said once by the vehicle
 * catalogue). The view lays the rows out in the `bottom_right` stack and draws them.
 */
import type { CatalogueVehicle } from '../vehicles/catalogue.js';
import type { VehicleSnapshot } from '../vehicles/vehicle-world.js';

/** The look of a row's bar (the runtime's colours, by kind). */
export type DashboardRowKind = 'health' | 'fuel' | 'ready' | 'reloading';

/** One dashboard row. */
export interface DashboardRow {
  readonly label: string;
  /** 0 to 1. */
  readonly fraction: number;
  readonly kind: DashboardRowKind;
}

/** A weapon id as a label: `machine_gun` is "Machine gun". */
export function weaponLabel(id: string): string {
  const spaced = id.replaceAll('_', ' ');
  return spaced === '' ? spaced : `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

/** The rows for the rider of `snapshot`, top first; none with `hud: false`. */
export function dashboardRows(
  vehicle: CatalogueVehicle | undefined,
  snapshot: VehicleSnapshot,
): DashboardRow[] {
  if (vehicle === undefined || vehicle.definition.hud === false) return [];
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  const max = snapshot.maxHealth;
  const rows: DashboardRow[] = [
    {
      label: 'Health',
      fraction: max <= 0 ? 0 : clamp(Math.max(0, max - snapshot.damage) / max),
      kind: 'health',
    },
  ];
  if (vehicle.fuel !== undefined) {
    const capacity = snapshot.fuelCapacity;
    rows.push({
      label: 'Fuel',
      fraction: capacity <= 0 ? 0 : clamp(snapshot.fuel / capacity),
      kind: 'fuel',
    });
  }
  const weapons = Array.isArray(vehicle.definition.weapons) ? vehicle.definition.weapons : [];
  for (const weapon of weapons) {
    if (typeof weapon !== 'object' || weapon === null || Array.isArray(weapon)) continue;
    const id = typeof weapon.id === 'string' ? weapon.id : '';
    rows.push({ label: weaponLabel(id), fraction: 1, kind: 'ready' });
  }
  return rows;
}
