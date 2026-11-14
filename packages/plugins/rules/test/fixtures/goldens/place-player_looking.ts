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

/** Where an entity looks: the block or entity it looks at, else `distance` blocks ahead. */
const lookingAt = (entity: Entity | undefined, distance: number): Pos | undefined => {
  if (entity === undefined) return undefined;
  const hit = entity.raycast(distance);
  if (hit !== undefined) return hit.pos;
  const look = entity.look;
  return entity.pos.offset(look.x * distance, 1.62 + look.y * distance, look.z * distance);
};

// Wand: a player uses the item.
msm.actions.define("demo:rules/rules/wand/item_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Wand, spawn 1 Chicken where the player looks, up to 10 blocks away.
  rule("sample", () => { // rule:sample
    withPos(lookingAt(player, 10), (at) => { for (let index = 0; index < 1; index += 1) world.spawnEntity("minecraft:chicken", at); }); // rule:sample
  }); // rule:sample
});
