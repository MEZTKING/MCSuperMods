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

// When a player dies.
msm.events.on("entity.death", (e) => {
  const player: Player | undefined = e.entity.asPlayer();
  if (player === undefined) return;
  const world = e.world;
  const here = player.pos;
  const other: Entity | undefined = e.killer;
  // When a player dies, end the round of Lifesteal won by the killer.
  rule("sample", () => { // rule:sample
    players([other]).forEach((target) => target.runCommand("tag @s add demo.game.lifesteal.winner")); // rule:sample
    world.runCommand("function demo:msm_games/game/lifesteal/end"); // rule:sample
  }); // rule:sample
});
