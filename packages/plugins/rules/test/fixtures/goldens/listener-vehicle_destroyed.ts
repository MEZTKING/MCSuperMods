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

// When Tank is destroyed.
msm.events.on("vehicle.destroyed", (e) => {
  if (e.vehicle.type !== "demo:tank") return;
  const world = e.world;
  const here = e.vehicle.pos;
  const vehicle: Vehicle | undefined = e.vehicle;
  const player: Player | undefined = e.player;
  // When Tank is destroyed, make an explosion of power 3 above here.
  rule("sample", () => { // rule:sample
    withPos(here.offset(0, 1, 0), (at) => world.explode(at, 3, { fire: false, breaksBlocks: true })); // rule:sample
  }); // rule:sample
});
