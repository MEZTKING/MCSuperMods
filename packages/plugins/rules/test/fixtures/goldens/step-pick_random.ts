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

// When a player breaks Stone.
msm.events.on("block.break", (e) => {
  if (e.block.id !== "minecraft:stone") return;
  const world = e.world;
  const here = e.block.pos.offset(0.5, 0.5, 0.5);
  const player: Player | undefined = e.player;
  // When a player breaks Stone, pick one at random: drop 3 Diamond here, spawn 1 Zombie here or make an explosion of power 2 here.
  rule("sample", () => { // rule:sample
    const pick1 = pickWeighted([5, 3, 1]); // rule:sample
    if (pick1 === 0) { // rule:sample
      withPos(here, (at) => world.dropItem(at, { id: "minecraft:diamond", count: 3 })); // rule:sample
    } else if (pick1 === 1) { // rule:sample
      withPos(here, (at) => { for (let index = 0; index < 1; index += 1) world.spawnEntity("minecraft:zombie", at); }); // rule:sample
    } else if (pick1 === 2) { // rule:sample
      withPos(here, (at) => world.explode(at, 2, { fire: false, breaksBlocks: true })); // rule:sample
    } // rule:sample
  }); // rule:sample
});
