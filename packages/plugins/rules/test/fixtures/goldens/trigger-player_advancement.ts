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

// When a player gets Mine stone.
msm.events.on("player.advancement", (e) => {
  if (e.advancement !== "minecraft:story/mine_stone") return;
  const world = e.world;
  const here = e.player.pos;
  const player: Player | undefined = e.player;
  // When a player gets Mine stone, show the player who got it the message "Something happened.".
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.sendMessage("Something happened.")); // rule:sample
  }); // rule:sample
});
