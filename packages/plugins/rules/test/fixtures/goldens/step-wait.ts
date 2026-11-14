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

// Guard: every few seconds while the mob is alive.
msm.actions.define("demo:rules/rules/guard/mob_every", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const mob: Entity | undefined = e.entity;
  // Every 3 seconds while Guard is alive, play Chime here, wait 2 seconds and play the animation "wave" on the mob.
  rule("sample", () => { // rule:sample
    withPos(here, (at) => world.playSound("minecraft:block.note_block.chime", at)); // rule:sample
    msm.schedule(40, () => { // rule:sample
      if (gone(mob)) return; // rule:sample
      if (mob !== undefined) mob.playAnimation("wave"); // rule:sample
    }); // rule:sample
  }); // rule:sample
});
