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

/** Counters are saved in the data stores under this prefix (ADR 0062). */
const COUNTER = "rules.counter.";
/** The data store of an entity, when there is one. */
const dataOf = (entity: Entity | undefined): DataStore | undefined =>
  entity === undefined ? undefined : entity.data;
/** A counter's value, or its start value when it was never set. */
const counterValue = (store: DataStore | undefined, name: string, start: number): number => {
  const value = store === undefined ? undefined : store.get(COUNTER + name);
  return typeof value === "number" ? value : start;
};
/** Sets a counter. */
const setCounter = (store: DataStore | undefined, name: string, value: number): void => {
  if (store !== undefined) store.set(COUNTER + name, value);
};

/** The project vehicle an entity rides, when it rides one (Script API 1.5). */
const riddenBy = (entity: Entity | undefined): Vehicle | undefined => {
  const ridden = entity === undefined ? undefined : entity.vehicle;
  return ridden === undefined ? undefined : ridden.asVehicle();
};

/** Seconds of driving left in a vehicle's fuel; 0 without a vehicle. */
const vehicleFuel = (vehicle: Vehicle | undefined): number =>
  vehicle === undefined ? 0 : vehicle.fuel / 20;

// Every 1 second while Tank is driven.
msm.events.on("player.tick", (e) => {
  const driven = riddenBy(e.player);
  if (driven === undefined || driven.type !== "demo:tank") return;
  const driver = driven.driver;
  if (driver === undefined || driver.uuid !== e.player.uuid) return;
  const world = e.world;
  const here = driven.pos;
  const vehicle: Vehicle | undefined = driven;
  const player: Player | undefined = e.player;
  // Every 1 second while Tank is driven, show Mana to the driver.
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.showHud("demo:mana")); // rule:sample
  }); // rule:sample
  // Every 1 second while Tank is driven, if the world's goal is less than the vehicle's fuel in seconds, show the driver "Low on fuel" above the hotbar.
  rule("low", () => { // rule:low
    if (!(counterValue(msm.storage, "goal", 10) < vehicleFuel(vehicle))) return; // rule:low
    players([player]).forEach((target) => target.showActionBar("Low on fuel")); // rule:low
  }); // rule:low
}, { interval: 20 });
