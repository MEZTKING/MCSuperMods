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

/** One block along each way a block can face. */
const FACING_STEPS: { [facing: string]: [number, number, number] } = {
  north: [0, 0, -1],
  east: [1, 0, 0],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};
/** One block along the facing of the block at a place; undefined when it faces no way. */
const inFront = (world: World, pos: Pos): Pos | undefined => {
  const step = FACING_STEPS[blockFacing(world, pos)];
  return step === undefined ? undefined : pos.offset(step[0], step[1], step[2]);
};

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, spawn 1 Chicken in front of here.
  rule("sample", () => { // rule:sample
    withPos(inFront(world, here), (at) => { for (let index = 0; index < 1; index += 1) world.spawnEntity("minecraft:chicken", at); }); // rule:sample
  }); // rule:sample
});
