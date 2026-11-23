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

/** The block coordinate of a position part as command text. */
const blockCoord = (value: number): string => String(Math.floor(value));

// Wand: a player uses the item on a block.
msm.actions.define("demo:rules/rules/wand/item_used_on_block", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Wand on a block, place the structure Island here mirrored left to right.
  rule("sample", () => { // rule:sample
    withPos(here, (at) => world.runCommand("place template demo:island " + blockCoord(at.x) + " " + blockCoord(at.y) + " " + blockCoord(at.z) + " none left_right", at)); // rule:sample
  }); // rule:sample
});
