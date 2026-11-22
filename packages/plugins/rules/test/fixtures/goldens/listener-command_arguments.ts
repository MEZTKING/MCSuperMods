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

/** A whole number of at least `min`. */
const whole = (value: number, min: number): number => Math.max(min, Math.floor(value));

/** Counters are saved in the data stores under this prefix (ADR 0062). */
const COUNTER = "rules.counter.";
/** The data store of an entity, when there is one. */
const dataOf = (entity: Entity | undefined): DataStore | undefined =>
  entity === undefined ? undefined : entity.data;
/** A counter's value, or its start value when it was never set. */
const counterValue = (store: DataStore | undefined, name: string, start: number): number => {
  const value = store === undefined ? undefined : store.get(COUNTER + name);
  return typeof value === "number" ? value : start;
};
/** Sets a counter. */
const setCounter = (store: DataStore | undefined, name: string, value: number): void => {
  if (store !== undefined) store.set(COUNTER + name, value);
};

/** The values typed for the command's arguments, by name (ADR 0111 D1). */
const commandArgs = (e: object): { [name: string]: unknown } => {
  const args = (e as { args?: unknown }).args;
  return typeof args === "object" && args !== null ? (args as { [name: string]: unknown }) : {};
};

/** A number typed for an argument, or one part of a position; 0 when it was left out. */
const argNumber = (args: { [name: string]: unknown }, name: string, axis: number): number => {
  const value = args[name];
  if (typeof value === "number") return value;
  if (Array.isArray(value) && typeof value[axis] === "number") return value[axis];
  return 0;
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
  // When a player types the command /gift, give every player what the player typed for "amount" Diamond, show the player who typed it the message "A gift for [what the player typed for "friend"] at [what the player typed for "spot"]: [what the player typed for "note"]" and set the world's goal to (the y of what the player typed for "spot" plus 1).
  rule("sample", () => { // rule:sample
    msm.players().forEach((target) => target.give("minecraft:diamond", whole(argNumber(args, "amount", 0), 1))); // rule:sample
    players([player]).forEach((target) => target.sendMessage("A gift for " + argWords(args, "friend", true) + " at " + argWords(args, "spot", false) + ": " + argWords(args, "note", false))); // rule:sample
    setCounter(msm.storage, "goal", (argNumber(args, "spot", 1) + 1)); // rule:sample
  }); // rule:sample
});

// When a player types the command /roll.
msm.events.on("command", (e) => {
  if (e.id !== "demo:roll") return;
  const source = e.source;
  if (source === undefined) return;
  const world = e.world;
  const here = source.pos;
  const player: Player | undefined = source.asPlayer();
  const args = commandArgs(e);
  // When a player types the command /roll, show the player who typed it the message "You rolled a [what the player typed for "sides"]".
  rule("roll", () => { // rule:roll
    players([player]).forEach((target) => target.sendMessage("You rolled a " + argWords(args, "sides", false))); // rule:roll
  }); // rule:roll
});
