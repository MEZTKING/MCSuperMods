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

/** A place moved by some blocks. */
const shift = (pos: Pos | undefined, x: number, y: number, z: number): Pos | undefined =>
  pos === undefined ? undefined : pos.offset(x, y, z);

/** The corner of the block a place is in. */
const blockPos = (pos: Pos): Pos =>
  pos.offset(Math.floor(pos.x) - pos.x, Math.floor(pos.y) - pos.y, Math.floor(pos.z) - pos.z);

/** Whether the block at a place is `id`. */
const blockIs = (world: World, pos: Pos | undefined, id: string): boolean =>
  pos !== undefined && world.getBlock(blockPos(pos)).split("[")[0] === id;

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, if the block 0, -1, 0 blocks from here is Grass block, give the player 2 Ruby.
  rule("sample", () => { // rule:sample
    if (!(blockIs(world, shift(here, 0, (-1), 0), "minecraft:grass_block"))) return; // rule:sample
    players([player]).forEach((target) => target.give("demo:ruby", 2)); // rule:sample
  }); // rule:sample
});
