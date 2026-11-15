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

// When something explodes.
msm.events.on("world.explosion", (e) => {
  const world = e.world;
  const here = e.pos;
  const other: Entity | undefined = e.source;
  // When something explodes, stop the explosion.
  rule("sample", () => { // rule:sample
    e.cancel(); // rule:sample
  }); // rule:sample
});
