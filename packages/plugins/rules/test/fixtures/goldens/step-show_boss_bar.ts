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

/** The players in the same dimension within `radius` blocks of `pos`. */
const playersNear = (world: World, pos: Pos, radius: number): Player[] =>
  msm.players().filter((player) => {
    if (player.world.dimension !== world.dimension) return false;
    const dx = player.pos.x - pos.x;
    const dy = player.pos.y - pos.y;
    const dz = player.pos.z - pos.z;
    return dx * dx + dy * dy + dz * dz <= radius * radius;
  });

/** `a` divided by `b`; dividing by zero gives 0. */
const divide = (a: number, b: number): number => (b === 0 ? 0 : a / b);

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

/** Shows, updates or hides a boss bar of this script. */
const showBossBar = (
  id: string,
  title: string | undefined,
  progress: number | undefined,
  color: BossBarColor | undefined,
  visible: boolean,
  viewers: Player[],
): void => {
  const found = msm.bossBars.get(id);
  if (!visible) {
    if (found !== undefined) found.remove();
    return;
  }
  const bar = found !== undefined ? found : msm.bossBars.create(id, { title: title !== undefined ? title : "" });
  if (title !== undefined) bar.setTitle(title);
  if (color !== undefined) bar.setColor(color);
  if (progress !== undefined) bar.setProgress(Math.max(0, Math.min(1, progress)));
  viewers.forEach((viewer) => bar.addPlayer(viewer));
};

// Guard: the mob is hurt.
msm.actions.define("demo:rules/rules/guard/mob_hurt", (e) => {
  const world = e.world;
  const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;
  const player: Player | undefined = e.player;
  const mob: Entity | undefined = e.entity;
  // When Guard is hurt, add 1 to the world's hits and show the boss bar "guard" to every player within 32 blocks.
  rule("sample", () => { // rule:sample
    setCounter(msm.storage, "hits", counterValue(msm.storage, "hits", 0) + 1); // rule:sample
    showBossBar("rules_guard", "Guard hits: " + text(counterValue(msm.storage, "hits", 0)), divide(counterValue(msm.storage, "hits", 0), 10), "red", true, playersNear(world, here, 32)); // rule:sample
  }); // rule:sample
});
