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

/** A random number from `min` to `max`. */
const random = (min: number, max: number, whole: boolean): number => {
  if (!whole) return min + Math.random() * (max - min);
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return low + Math.floor(Math.random() * (high - low + 1));
};

// Guard: the mob is hurt.
msm.actions.define("demo:rules/rules/guard/mob_hurt", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  const mob: Entity | undefined = e.entity;
  // When Guard is hurt, set the mob on fire for 5 seconds and set the mob on fire for a random number from 2 to 8 seconds.
  rule("sample", () => { // rule:sample
    entities([mob]).forEach((target) => { if (target.asPlayer() === undefined) target.runCommand("data merge entity @s {Fire:100s}"); }); // rule:sample
    entities([mob]).forEach((target) => { if (target.asPlayer() === undefined) target.runCommand("data merge entity @s {Fire:" + String(Math.min(32767, Math.max(1, Math.round(random(2, 8, true) * 20)))) + "s}"); }); // rule:sample
  }); // rule:sample
});
