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

/** The values typed for the command's arguments, by name (ADR 0111 D1). */
const commandArgs = (e: object): { [name: string]: unknown } => {
  const args = (e as { args?: unknown }).args;
  return typeof args === "object" && args !== null ? (args as { [name: string]: unknown }) : {};
};

/** What was typed for an argument in words: a player by name, a position as "x y z". */
const argWords = (args: { [name: string]: unknown }, name: string, player: boolean): string => {
  const value = args[name];
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(" ");
  if (player && typeof value === "string") {
    const found = msm.players().filter((someone) => someone.uuid === value)[0];
    if (found !== undefined) return found.name;
  }
  return String(value);
};

// /gift: a player types the command.
msm.actions.define("demo:rules/rules/gift/command_used", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  const args = commandArgs(e);
  // When a player types the command /gift, show the player who typed it the message "Value: [what the player typed for "friend"]".
  rule("sample", () => { // rule:sample
    players([player]).forEach((target) => target.sendMessage("Value: " + argWords(args, "friend", true))); // rule:sample
  }); // rule:sample
});
