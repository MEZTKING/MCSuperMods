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

/** Where an entity is, when there is one. */
const posOf = (entity: Entity | undefined): Pos | undefined =>
  entity === undefined ? undefined : entity.pos;

// Guard: a player uses the mob.
msm.actions.define("demo:rules/rules/guard/mob_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  const mob: Entity | undefined = e.entity;
  // When a player uses Guard, spawn 1 Chicken at the mob.
  rule("sample", () => { // rule:sample
    withPos(posOf(mob), (at) => { for (let index = 0; index < 1; index += 1) world.spawnEntity("minecraft:chicken", at); }); // rule:sample
  }); // rule:sample
});
