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

/** A game rule's value as a number: true is 1, false and a rule the world lacks 0. */
const gameRuleNumber = (world: World, id: string): number => {
  const value: unknown = world.gameRule(id);
  return typeof value === "number" ? value : value === true ? 1 : 0;
};

// Every 2 seconds for each player.
msm.events.on("player.tick", (e) => {
  const world = e.world;
  const here = e.player.pos;
  const player: Player | undefined = e.player;
  // Every 2 seconds for each player, if the game rule Max mana is more than 10, give the player 2 Ruby.
  rule("sample", () => { // rule:sample
    if (!(gameRuleNumber(world, "demo:max_mana") > 10)) return; // rule:sample
    players([player]).forEach((target) => target.give("demo:ruby", 2)); // rule:sample
  }); // rule:sample
}, { interval: 40 });
