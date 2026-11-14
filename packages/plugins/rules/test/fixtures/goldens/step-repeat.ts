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

/** The players of a list. */
const players = (list: (Entity | undefined)[]): Player[] => {
  const found: Player[] = [];
  list.forEach((entity) => {
    const player = entity === undefined ? undefined : entity.asPlayer();
    if (player !== undefined) found.push(player);
  });
  return found;
};

/** Runs `body` at a place when there is one. */
const withPos = (pos: Pos | undefined, body: (pos: Pos) => void): void => {
  if (pos !== undefined) body(pos);
};

// Plain Block: a player uses the block.
msm.actions.define("demo:rules/rules/plain_block/block_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player uses Plain Block, repeat 3 times: (play Chime here and wait 0.5 seconds) and show the player the message "Done.".
  rule("sample", () => { // rule:sample
    const next1 = (): void => { // rule:sample
      players([player]).forEach((target) => target.sendMessage("Done.")); // rule:sample
    }; // rule:sample
    const loop2 = (count: number): void => { // rule:sample
      if (count >= 3) { // rule:sample
        next1(); // rule:sample
        return; // rule:sample
      } // rule:sample
      withPos(here, (at) => world.playSound("minecraft:block.note_block.chime", at)); // rule:sample
      msm.schedule(10, () => { // rule:sample
        if (gone(player)) return; // rule:sample
        loop2(count + 1); // rule:sample
      }); // rule:sample
    }; // rule:sample
    loop2(0); // rule:sample
  }); // rule:sample
});
