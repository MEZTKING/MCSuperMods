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

/** The entities of a list that are there. */
const entities = (list: (Entity | undefined)[]): Entity[] =>
  list.filter((entity): entity is Entity => entity !== undefined);

// When a player joins.
msm.events.on("player.join", (e) => {
  const world = e.world;
  const here = e.player.pos;
  const player: Player | undefined = e.player;
  // When a player joins, set the Points score of the player to 0.
  rule("sample", () => { // rule:sample
    entities([player]).forEach((target) => target.runCommand("scoreboard players set @s demo.points 0")); // rule:sample
  }); // rule:sample
});
