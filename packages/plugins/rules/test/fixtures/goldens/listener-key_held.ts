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

/** Whether someone of the trigger has died or left since the rule started. */
const gone = (entity: Entity | undefined): boolean => entity !== undefined && !entity.isAlive;

/** Runs `body` at a place when there is one. */
const withPos = (pos: Pos | undefined, body: (pos: Pos) => void): void => {
  if (pos !== undefined) body(pos);
};

// Dash: while a player holds the key.
msm.actions.define("demo:rules/rules/dash/key_held", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // Every 0.5 seconds while a player holds Dash, wait 1 second and play Chime here.
  rule("sample", () => { // rule:sample
    msm.schedule(20, () => { // rule:sample
      if (gone(player)) return; // rule:sample
      withPos(here, (at) => world.playSound("minecraft:block.note_block.chime", at)); // rule:sample
    }); // rule:sample
  }); // rule:sample
});
