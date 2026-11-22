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

// /hello: a player types the command.
msm.actions.define("demo:rules/rules/hello/command_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player types the command /hello, set the game rule Keep inventory to true and set the game rule Max mana to 50.
  rule("sample", () => { // rule:sample
    world.setGameRule("minecraft:keep_inventory", true); // rule:sample
    world.setGameRule("demo:max_mana", 50); // rule:sample
  }); // rule:sample
});
