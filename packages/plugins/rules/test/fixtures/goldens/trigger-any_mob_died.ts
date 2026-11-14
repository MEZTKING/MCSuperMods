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

// When any mob dies.
msm.events.on("entity.death", (e) => {
  if (e.entity.isPlayer) return;
  const world = e.world;
  const here = e.entity.pos;
  const mob: Entity | undefined = e.entity;
  const other: Entity | undefined = e.attacker;
  const player: Player | undefined = e.attacker !== undefined ? e.attacker.asPlayer() : undefined;
  // When any mob dies, show the player who killed it the message "Something happened.".
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.sendMessage("Something happened.")); // rule:sample
  }); // rule:sample
});
