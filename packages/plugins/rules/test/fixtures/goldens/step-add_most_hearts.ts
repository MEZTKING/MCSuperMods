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
  // When a player dies, add 1 to the most hearts of the killer in Lifesteal and add -1 to the most hearts of the player who died.
  rule("sample", () => { // rule:sample
    players([other]).forEach((target) => { // rule:sample
      target.runCommand("scoreboard players add @s demo.msm_hearts 1"); // rule:sample
      target.runCommand("execute if score @s demo.msm_hearts matches ..0 run scoreboard players set @s demo.msm_hearts 1"); // rule:sample
      target.runCommand("function demo:msm_games/game/lifesteal/hearts/apply"); // rule:sample
    }); // rule:sample
    players([player]).forEach((target) => target.runCommand("attribute @s minecraft:max_health base set " + String(Math.min(1024, Math.max(1, Math.round(target.maxHealth / 2) + (-1)) * 2)))); // rule:sample
  }); // rule:sample
});
