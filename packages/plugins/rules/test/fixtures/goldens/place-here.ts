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

/** Runs `body` at a place when there is one. */
const withPos = (pos: Pos | undefined, body: (pos: Pos) => void): void => {
  if (pos !== undefined) body(pos);
};

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, spawn 1 Chicken here.
  rule("sample", () => { // rule:sample
    withPos(here, (at) => { for (let index = 0; index < 1; index += 1) world.spawnEntity("minecraft:chicken", at); }); // rule:sample
  }); // rule:sample
});
