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

/** What each player rode at the last look, by trigger and player (Script API 1.6). */
const ridingBefore: { [key: string]: Entity | undefined } = {};
/** What a player got on (`on`) or off since the last look for `slot`, else undefined. */
const rideChange = (slot: string, player: Player, on: boolean): Entity | undefined => {
  const key = slot + " " + player.uuid;
  const before = ridingBefore[key];
  const now = player.vehicle;
  if (now === undefined) delete ridingBefore[key];
  else ridingBefore[key] = now;
  const was = before === undefined ? "" : before.uuid;
  const is = now === undefined ? "" : now.uuid;
  if (was === is) return undefined;
  return on ? now : before;
};

// When a player gets on something.
msm.events.on("player.tick", (e) => {
  const other: Entity | undefined = rideChange("player_mounted", e.player, true);
  if (other === undefined) return;
  const world = e.world;
  const here = e.player.pos;
  const player: Player | undefined = e.player;
  // When a player gets on something, make the player get off what they ride.
  rule("sample", () => { // rule:sample
    entities([player]).forEach((target) => { target.dismount(); }); // rule:sample
  }); // rule:sample
}, { interval: 5 });
