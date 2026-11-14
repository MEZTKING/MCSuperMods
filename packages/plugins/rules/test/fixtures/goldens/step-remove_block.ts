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

/** The corner of the block a place is in. */
const blockPos = (pos: Pos): Pos =>
  pos.offset(Math.floor(pos.x) - pos.x, Math.floor(pos.y) - pos.y, Math.floor(pos.z) - pos.z);

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, remove the block above here.
  rule("sample", () => { // rule:sample
    withPos(here.offset(0, 1, 0), (at) => world.setBlock(blockPos(at), "minecraft:air")); // rule:sample
  }); // rule:sample
});
