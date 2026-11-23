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

/** Runs a command as and at an entity; the command's result, or 0 without the entity. */
const ran = (entity: Entity | undefined, command: string): number =>
  entity === undefined ? 0 : entity.runCommand(command);

// Every 2 seconds for each player.
msm.events.on("player.tick", (e) => {
  const world = e.world;
  const here = e.player.pos;
  const player: Player | undefined = e.player;
  // Every 2 seconds for each player, if the player is in Arena, give the player 2 Ruby.
  rule("sample", () => { // rule:sample
    if (!(ran(player, "execute if entity @s[tag=demo.area.arena]") > 0)) return; // rule:sample
    players([player]).forEach((target) => target.give("demo:ruby", 2)); // rule:sample
  }); // rule:sample
}, { interval: 40 });
