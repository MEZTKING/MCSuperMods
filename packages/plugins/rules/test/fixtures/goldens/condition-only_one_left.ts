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

// When a player dies.
msm.events.on("entity.death", (e) => {
  const player: Player | undefined = e.entity.asPlayer();
  if (player === undefined) return;
  const world = e.world;
  const here = player.pos;
  const other: Entity | undefined = e.killer;
  // When a player dies, if only one player is left in Lifesteal, end the round of Lifesteal.
  rule("sample", () => { // rule:sample
    if (!(world.runCommand("execute if entity @a[tag=demo.game.lifesteal.in]") === 1)) return; // rule:sample
    world.runCommand("function demo:msm_games/game/lifesteal/end"); // rule:sample
  }); // rule:sample
});
