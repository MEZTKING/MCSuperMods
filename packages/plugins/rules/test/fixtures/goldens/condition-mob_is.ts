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

/** The players of a list. */
const players = (list: (Entity | undefined)[]): Player[] => {
  const found: Player[] = [];
  list.forEach((entity) => {
    const player = entity === undefined ? undefined : entity.asPlayer();
    if (player !== undefined) found.push(player);
  });
  return found;
};

/** Whether an entity is of a type. */
const isType = (entity: Entity | undefined, type: string): boolean =>
  entity !== undefined && entity.type === type;

// Wand: the item hits a mob.
msm.actions.define("demo:rules/rules/wand/item_hit_mob", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  const other: Entity | undefined = e.other;
  // When Wand hits a mob, if the mob hit is Zombie, give the player holding it 2 Ruby.
  rule("sample", () => { // rule:sample
    if (!(isType(other, "minecraft:zombie"))) return; // rule:sample
    players([player]).forEach((target) => target.give("demo:ruby", 2)); // rule:sample
  }); // rule:sample
});
