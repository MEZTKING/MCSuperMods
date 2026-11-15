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

/** The corner of the block a place is in. */
const blockPos = (pos: Pos): Pos =>
  pos.offset(Math.floor(pos.x) - pos.x, Math.floor(pos.y) - pos.y, Math.floor(pos.z) - pos.z);

/**
 * The way the block at a place faces: its `facing`, else its `axis` (x is east, y up and
 * z south); "" when it has neither.
 */
const blockFacing = (world: World, pos: Pos | undefined): string => {
  if (pos === undefined) return "";
  const state = world.getBlock(blockPos(pos));
  const facing = /[[,]facing=([a-z]+)/.exec(state);
  if (facing !== null) return String(facing[1]);
  const axis = /[[,]axis=([xyz])/.exec(state);
  if (axis === null) return "";
  return axis[1] === "x" ? "east" : axis[1] === "y" ? "up" : "south";
};

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, show the player the message "Value: [the way the block here faces]".
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.sendMessage("Value: " + blockFacing(world, here))); // rule:sample
  }); // rule:sample
});
