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

/** The values typed for the command's arguments, by name (ADR 0111 D1). */
const commandArgs = (e: object): { [name: string]: unknown } => {
  const args = (e as { args?: unknown }).args;
  return typeof args === "object" && args !== null ? (args as { [name: string]: unknown }) : {};
};

// When Magic block is broken in phase 2.
msm.events.on("command", (e) => {
  if (e.id !== "demo:msm_signal" || commandArgs(e)["signal"] !== "break2+demo+magic_block") return;
  const world = e.world;
  // When Magic block is broken in phase 2, add 1 to the Points score of every player.
  rule("sample", () => { // rule:sample
    msm.players().forEach((target) => target.runCommand("scoreboard players add @s demo.points 1")); // rule:sample
  }); // rule:sample
});
