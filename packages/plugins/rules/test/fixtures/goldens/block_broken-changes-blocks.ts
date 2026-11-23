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

/** The corner of the block a place is in. */
const blockPos = (pos: Pos): Pos =>
  pos.offset(Math.floor(pos.x) - pos.x, Math.floor(pos.y) - pos.y, Math.floor(pos.z) - pos.z);

/** The block coordinate of a position part as command text. */
const blockCoord = (value: number): string => String(Math.floor(value));

/** The index of one choice, picked at random by weight; the last when every weight is 0. */
const pickWeighted = (weights: number[]): number => {
  let total = 0;
  weights.forEach((weight) => {
    total += weight;
  });
  let roll = Math.random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return index;
  }
  return weights.length - 1;
};

// Plain Block: a player breaks the block.
msm.actions.define("demo:rules/rules/plain_block/block_broken", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player breaks Plain Block, place Gold block here, pick one at random: place the structure Island here or make an explosion of power 1 here, drop 1 Emerald here, wait 1 second and remove the block above here.
  rule("sample", () => { // rule:sample
    msm.schedule(1, () => { // rule:sample
      withPos(here, (at) => world.setBlock(blockPos(at), "minecraft:gold_block")); // rule:sample
    }); // rule:sample
    const pick1 = pickWeighted([1, 1]); // rule:sample
    if (pick1 === 0) { // rule:sample
      msm.schedule(1, () => { // rule:sample
        withPos(here, (at) => world.runCommand("place template demo:island " + blockCoord(at.x) + " " + blockCoord(at.y) + " " + blockCoord(at.z), at)); // rule:sample
      }); // rule:sample
    } else if (pick1 === 1) { // rule:sample
      withPos(here, (at) => world.explode(at, 1, { fire: false, breaksBlocks: false })); // rule:sample
    } // rule:sample
    withPos(here, (at) => world.dropItem(at, { id: "minecraft:emerald", count: 1 })); // rule:sample
    msm.schedule(20, () => { // rule:sample
      if (gone(player)) return; // rule:sample
      withPos(here.offset(0, 1, 0), (at) => world.breakBlock(blockPos(at), { drops: false })); // rule:sample
    }); // rule:sample
  }); // rule:sample
});

// When a player breaks Stone.
msm.events.on("block.break", (e) => {
  if (e.block.id !== "minecraft:stone") return;
  const world = e.world;
  const here = e.block.pos.offset(0.5, 0.5, 0.5);
  const player: Player | undefined = e.player;
  // When a player breaks Stone, stop the normal action, reset Arena and make an explosion of power 2 here.
  rule("any", () => { // rule:any
    e.cancel(); // rule:any
    msm.schedule(1, () => { // rule:any
      world.runFunction("demo:msm_games/area/arena/clear"); // rule:any
    }); // rule:any
    msm.schedule(1, () => { // rule:any
      withPos(here, (at) => world.explode(at, 2, { fire: false, breaksBlocks: true })); // rule:any
    }); // rule:any
  }); // rule:any
});
