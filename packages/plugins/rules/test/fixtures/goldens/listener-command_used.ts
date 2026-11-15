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

/** Runs `body` at a place when there is one. */
const withPos = (pos: Pos | undefined, body: (pos: Pos) => void): void => {
  if (pos !== undefined) body(pos);
};

/** The way an entity faces, north, east, south or west, from where it looks; "" without one. */
const entityFacing = (entity: Entity | undefined): string => {
  if (entity === undefined) return "";
  const look = entity.look;
  if (Math.abs(look.x) > Math.abs(look.z)) return look.x > 0 ? "east" : "west";
  return look.z > 0 ? "south" : "north";
};

// /hello: a player types the command.
msm.actions.define("demo:rules/rules/hello/command_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  // When a player types the command /hello, show the player who typed it the message "You face [the way the player faces]".
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.sendMessage("You face " + entityFacing(player))); // rule:sample
  }); // rule:sample
});

// When a player types the command /warp.
msm.events.on("command", (e) => {
  if (e.id !== "demo:warp") return;
  const source = e.source;
  if (source === undefined) return;
  const world = e.world;
  const here = source.pos;
  const player: Player | undefined = source.asPlayer();
  // When a player types the command /warp, play Chime here.
  rule("warp", () => { // rule:warp
    withPos(here, (at) => world.playSound("minecraft:block.note_block.chime", at)); // rule:warp
  }); // rule:warp
});
