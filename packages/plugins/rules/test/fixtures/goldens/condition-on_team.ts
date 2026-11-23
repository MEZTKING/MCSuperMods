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

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, if the player is on Red team, give the player 2 Ruby.
  rule("sample", () => { // rule:sample
    if (!(ran(player, "execute if entity @s[team=demo.red]") > 0)) return; // rule:sample
    players([player]).forEach((target) => target.give("demo:ruby", 2)); // rule:sample
  }); // rule:sample
});
