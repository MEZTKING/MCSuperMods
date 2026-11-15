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

/** The project vehicle an entity rides, when it rides one (Script API 1.5). */
const riddenBy = (entity: Entity | undefined): Vehicle | undefined => {
  const ridden = entity === undefined ? undefined : entity.vehicle;
  return ridden === undefined ? undefined : ridden.asVehicle();
};

/** The damage a vehicle has taken; 0 without a vehicle. */
const vehicleDamage = (vehicle: Vehicle | undefined): number =>
  vehicle === undefined ? 0 : vehicle.damageTaken;

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, show the player the message "Value: [the vehicle's damage]".
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.sendMessage("Value: " + text(vehicleDamage(riddenBy(player))))); // rule:sample
  }); // rule:sample
});
