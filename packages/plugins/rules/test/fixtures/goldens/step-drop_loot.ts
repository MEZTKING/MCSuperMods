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

/** A coordinate as command text: at most two decimals, never an exponent. */
const coord = (value: number): string => String(Math.round(value * 100) / 100);

// When a player breaks Stone.
msm.events.on("block.break", (e) => {
  if (e.block.id !== "minecraft:stone") return;
  const world = e.world;
  const here = e.block.pos.offset(0.5, 0.5, 0.5);
  const player: Player | undefined = e.player;
  // When a player breaks Stone, drop what Lucky rolls above here.
  rule("sample", () => { // rule:sample
    withPos(here.offset(0, 1, 0), (at) => world.runCommand("loot spawn " + coord(at.x) + " " + coord(at.y) + " " + coord(at.z) + " loot demo:lucky", at)); // rule:sample
  }); // rule:sample
});
