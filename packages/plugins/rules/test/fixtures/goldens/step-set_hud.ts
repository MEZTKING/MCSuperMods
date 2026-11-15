// Made by Rules from demo:rules; edit the rules, not this file.
import { msm } from "msm:runtime";

const BOOK = "demo:rules";

/** Runs one rule; an error stops only that rule and is logged with its key. */
const rule = (key: string, body: () => void): void => {
  try {
    body();
  } catch (error) {
    msm.log.error("Rules " + BOOK + ", rule " + key + ": " + String(error));
  }
};

/** The players of a list. */
const players = (list: (Entity | undefined)[]): Player[] => {
  const found: Player[] = [];
  list.forEach((entity) => {
    const player = entity === undefined ? undefined : entity.asPlayer();
    if (player !== undefined) found.push(player);
  });
  return found;
};

/** The rounds loaded in a vehicle's weapon; 0 without a vehicle or such a weapon. */
const vehicleAmmo = (vehicle: Vehicle | undefined, weapon: string | number): number => {
  if (vehicle === undefined) return 0;
  try {
    return vehicle.ammo(weapon);
  } catch (error) {
    return 0;
  }
};

// When Tank fires.
msm.events.on("vehicle.fired", (e) => {
  if (e.vehicle.type !== "demo:tank") return;
  const world = e.world;
  const here = e.vehicle.pos;
  const vehicle: Vehicle | undefined = e.vehicle;
  const player: Player | undefined = e.player;
  // When Tank fires, set Mana to the vehicle's ammunition for the weapon "cannon" for the player who fired.
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.setHud("demo:mana", vehicleAmmo(vehicle, "cannon"))); // rule:sample
  }); // rule:sample
});
