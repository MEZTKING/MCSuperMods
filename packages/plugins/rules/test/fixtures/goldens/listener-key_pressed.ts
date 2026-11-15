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

/** A number as text, with at most two decimals. */
const text = (value: number): string => String(Math.round(value * 100) / 100);

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

// When a player presses Dash.
msm.events.on("key.pressed", (e) => {
  if (e.key !== "demo:dash") return;
  const world = e.world;
  const here = e.player.pos;
  const player: Player | undefined = e.player;
  // When a player presses Dash, add 1 to the player's clicks and set Mana to "Dashes: [the player's clicks]" for the player who pressed it.
  rule("sample", () => { // rule:sample
    setCounter(dataOf(player), "clicks", counterValue(dataOf(player), "clicks", 0) + 1); // rule:sample
    players([player]).forEach((target) => target.setHud("demo:mana", "Dashes: " + text(counterValue(dataOf(player), "clicks", 0)))); // rule:sample
  }); // rule:sample
});
