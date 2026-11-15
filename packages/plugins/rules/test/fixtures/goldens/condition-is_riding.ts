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

/** Whether an entity rides something, or something of a type (Script API 1.6). */
const riding = (entity: Entity | undefined, type: string | undefined): boolean => {
  const ridden = entity === undefined ? undefined : entity.vehicle;
  return ridden !== undefined && (type === undefined || ridden.type === type);
};

// Every 2 seconds for each player.
msm.events.on("player.tick", (e) => {
  const world = e.world;
  const here = e.player.pos;
  const player: Player | undefined = e.player;
  // Every 2 seconds for each player, if the player is riding Horse, give the player 2 Ruby.
  rule("sample", () => { // rule:sample
    if (!(riding(player, "minecraft:horse"))) return; // rule:sample
    players([player]).forEach((target) => target.give("demo:ruby", 2)); // rule:sample
  }); // rule:sample
}, { interval: 40 });
