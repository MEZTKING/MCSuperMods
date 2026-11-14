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

/** The entities of a list that are there. */
const entities = (list: (Entity | undefined)[]): Entity[] =>
  list.filter((entity): entity is Entity => entity !== undefined);

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, heal every player by 4 half hearts.
  rule("sample", () => { // rule:sample
    msm.players().forEach((target) => target.heal(4)); // rule:sample
  }); // rule:sample
});
