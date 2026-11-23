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

// When a player leaves Arena.
msm.events.on("command", (e) => {
  if (e.id !== "demo:msm_signal" || commandArgs(e)["signal"] !== "leave+demo+arena") return;
  const world = e.world;
  const source = e.source;
  const player: Player | undefined = source !== undefined ? source.asPlayer() : undefined;
  if (player === undefined) return;
  const here = player.pos;
  // When a player leaves Arena, take the player who went out off their team.
  rule("sample", () => { // rule:sample
    entities([player]).forEach((target) => target.runCommand("team leave @s")); // rule:sample
  }); // rule:sample
});
