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

/** A number as text, with at most two decimals. */
const text = (value: number): string => String(Math.round(value * 100) / 100);

// Every 10 seconds.
msm.events.on("server.tick", (e) => {
  if (e.tick % 200 !== 0) return;
  const world = e.world;
  // Every 10 seconds, for each player in the world: show the player "Level [the player's level]" above the hotbar.
  rule("sample", () => { // rule:sample
    msm.players().forEach((player) => { // rule:sample
      players([player]).forEach((target) => target.showActionBar("Level " + text(player.xpLevel))); // rule:sample
    }); // rule:sample
  }); // rule:sample
});
