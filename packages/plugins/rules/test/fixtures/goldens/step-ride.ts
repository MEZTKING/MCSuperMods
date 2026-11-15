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

// Guard: a player uses the mob.
msm.actions.define("demo:rules/rules/guard/mob_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  const mob: Entity | undefined = e.entity;
  // When a player uses Guard, make the player ride the mob.
  rule("sample", () => { // rule:sample
    entities([mob]).forEach((mount) => entities([player]).forEach((target) => { if (target.uuid !== mount.uuid) target.ride(mount); })); // rule:sample
  }); // rule:sample
});
