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

/** A number as text, with at most two decimals. */
const text = (value: number): string => String(Math.round(value * 100) / 100);

/** Seconds of driving left in a vehicle's fuel; 0 without a vehicle. */
const vehicleFuel = (vehicle: Vehicle | undefined): number =>
  vehicle === undefined ? 0 : vehicle.fuel / 20;

// When someone gets in Tank.
msm.events.on("vehicle.mounted", (e) => {
  if (e.vehicle.type !== "demo:tank") return;
  const world = e.world;
  const here = e.vehicle.pos;
  const vehicle: Vehicle | undefined = e.vehicle;
  const player: Player | undefined = e.player;
  // When someone gets in Tank, show the player who got in the message "Fuel: [the vehicle's fuel in seconds]".
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.sendMessage("Fuel: " + text(vehicleFuel(vehicle)))); // rule:sample
  }); // rule:sample
});
