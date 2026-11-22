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

// When a player crafts Crafting table.
msm.events.on("item.crafted", (e) => {
  if (e.item.id !== "minecraft:crafting_table") return;
  const world = e.world;
  const here = e.player.pos;
  const player: Player | undefined = e.player;
  // When a player crafts Crafting table, show the player who crafted it the message "Something happened.".
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.sendMessage("Something happened.")); // rule:sample
  }); // rule:sample
});
