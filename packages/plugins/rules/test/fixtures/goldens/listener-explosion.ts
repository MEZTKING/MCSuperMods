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

/** Whether an entity is of a type. */
const isType = (entity: Entity | undefined, type: string): boolean =>
  entity !== undefined && entity.type === type;

// When something explodes.
msm.events.on("world.explosion", (e) => {
  const world = e.world;
  const here = e.pos;
  const other: Entity | undefined = e.source;
  // When something explodes, if it was caused by Creeper, keep the blocks safe.
  rule("sample", () => { // rule:sample
    if (!(isType(other, "minecraft:creeper"))) return; // rule:sample
    e.keepBlocks(); // rule:sample
  }); // rule:sample
  // When something explodes, if it was caused by a block, stop the explosion.
  rule("beds", () => { // rule:beds
    if (!(other === undefined)) return; // rule:beds
    e.cancel(); // rule:beds
  }); // rule:beds
});
