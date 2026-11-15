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

// When something explodes.
msm.events.on("world.explosion", (e) => {
  const world = e.world;
  const here = e.pos;
  const other: Entity | undefined = e.source;
  // When something explodes, keep the blocks safe and play Chime here.
  rule("sample", () => { // rule:sample
    e.keepBlocks(); // rule:sample
    withPos(here, (at) => world.playSound("minecraft:block.note_block.chime", at)); // rule:sample
  }); // rule:sample
});
