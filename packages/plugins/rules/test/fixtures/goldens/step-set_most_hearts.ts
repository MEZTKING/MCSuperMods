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

// When a player joins.
msm.events.on("player.join", (e) => {
  const world = e.world;
  const here = e.player.pos;
  const player: Player | undefined = e.player;
  // When a player joins, set the most hearts of the player to 12 in Lifesteal and set the most hearts of the player to the player's level.
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => { // rule:sample
      target.runCommand("scoreboard players set @s demo.msm_hearts 12"); // rule:sample
      target.runCommand("function demo:msm_games/game/lifesteal/hearts/apply"); // rule:sample
    }); // rule:sample
    const hearts1 = Math.round((player !== undefined ? player.xpLevel : 0)); // rule:sample
    players([player]).forEach((target) => target.runCommand("attribute @s minecraft:max_health base set " + String(Math.min(1024, Math.max(1, hearts1) * 2)))); // rule:sample
  }); // rule:sample
});
