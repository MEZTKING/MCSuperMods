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

/** The players in the same dimension within `radius` blocks of `pos`. */
const playersNear = (world: World, pos: Pos, radius: number): Player[] =>
  msm.players().filter((player) => {
    if (player.world.dimension !== world.dimension) return false;
    const dx = player.pos.x - pos.x;
    const dy = player.pos.y - pos.y;
    const dz = player.pos.z - pos.z;
    return dx * dx + dy * dy + dz * dz <= radius * radius;
  });

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, heal every player within 8 blocks by 4 half hearts.
  rule("sample", () => { // rule:sample
    playersNear(world, here, 8).forEach((target) => target.heal(4)); // rule:sample
  }); // rule:sample
});
