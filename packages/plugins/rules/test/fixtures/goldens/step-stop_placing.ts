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

// When a player places Tnt.
msm.events.on("block.place", (e) => {
  if (e.block !== "minecraft:tnt") return;
  const world = e.world;
  const here = e.pos.offset(0.5, 0.5, 0.5);
  const player: Player | undefined = e.player;
  // When a player places Tnt, stop the placing and show the player the message "Not here.".
  rule("sample", () => { // rule:sample
    e.cancel(); // rule:sample
    players([player]).forEach((target) => target.sendMessage("Not here.")); // rule:sample
  }); // rule:sample
});
