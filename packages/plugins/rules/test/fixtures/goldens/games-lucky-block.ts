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

/** The entities of a list that are there. */
const entities = (list: (Entity | undefined)[]): Entity[] =>
  list.filter((entity): entity is Entity => entity !== undefined);

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

/** Where an entity is, when there is one. */
const posOf = (entity: Entity | undefined): Pos | undefined =>
  entity === undefined ? undefined : entity.pos;

/** The values typed for the command's arguments, by name (ADR 0111 D1). */
const commandArgs = (e: object): { [name: string]: unknown } => {
  const args = (e as { args?: unknown }).args;
  return typeof args === "object" && args !== null ? (args as { [name: string]: unknown }) : {};
};

/** A coordinate as command text: at most two decimals, never an exponent. */
const coord = (value: number): string => String(Math.round(value * 100) / 100);

/** Runs a command as and at an entity; the command's result, or 0 without the entity. */
const ran = (entity: Entity | undefined, command: string): number =>
  entity === undefined ? 0 : entity.runCommand(command);

/** The index of one choice, picked at random by weight; the last when every weight is 0. */
const pickWeighted = (weights: number[]): number => {
  let total = 0;
  weights.forEach((weight) => {
    total += weight;
  });
  let roll = Math.random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return index;
  }
  return weights.length - 1;
};

// When a player breaks Gold block.
msm.events.on("block.break", (e) => {
  if (e.block.id !== "minecraft:gold_block") return;
  const world = e.world;
  const here = e.block.pos.offset(0.5, 0.5, 0.5);
  const player: Player | undefined = e.player;
  // When a player breaks Gold block, pick one at random: drop what Lucky rolls here, repeat 1 times: (wait 1 second and make an explosion of power 3 here) or add the "kills" score of the player to the Points score of the player, set the world border to (the number of players on "blue" times 20) blocks wide over the seconds left on Round seconds centred at the player and put every player on "blue".
  rule("sample", () => { // rule:sample
    const next1 = (): void => { // rule:sample
      withPos(posOf(player), (at) => world.runCommand("worldborder center " + coord(at.x) + " " + coord(at.z), at)); // rule:sample
      world.runCommand("worldborder set " + coord(Math.min(59999968, Math.max(1, (world.runCommand("execute if entity @a[team=blue]") * 20)))) + " " + String(Math.min(86400, Math.max(1, Math.round(world.runCommand("scoreboard players get #round demo.msm_timers"))))) + "s", here); // rule:sample
      msm.players().forEach((target) => target.runCommand("team join blue @s")); // rule:sample
    }; // rule:sample
    const pick2 = pickWeighted([2, 1, 1]); // rule:sample
    if (pick2 === 0) { // rule:sample
      withPos(here, (at) => world.runCommand("loot spawn " + coord(at.x) + " " + coord(at.y) + " " + coord(at.z) + " loot demo:lucky", at)); // rule:sample
      next1(); // rule:sample
    } else if (pick2 === 1) { // rule:sample
      const next3 = (): void => { // rule:sample
        next1(); // rule:sample
      }; // rule:sample
      const loop4 = (count: number): void => { // rule:sample
        if (count >= 1) { // rule:sample
          next3(); // rule:sample
          return; // rule:sample
        } // rule:sample
        msm.schedule(20, () => { // rule:sample
          if (gone(player)) return; // rule:sample
          withPos(here, (at) => world.explode(at, 3, { fire: false, breaksBlocks: true })); // rule:sample
          loop4(count + 1); // rule:sample
        }); // rule:sample
      }; // rule:sample
      loop4(0); // rule:sample
    } else if (pick2 === 2) { // rule:sample
      entities([player]).forEach((target) => target.runCommand("scoreboard players add @s demo.points " + String(Math.max(0, Math.round(ran(player, "scoreboard players get @s kills")))))); // rule:sample
      next1(); // rule:sample
    } // rule:sample
  }); // rule:sample
});

// When Magic block is broken in phase 2.
msm.events.on("command", (e) => {
  if (e.id !== "demo:msm_signal" || commandArgs(e)["signal"] !== "break2+demo+magic_block") return;
  const world = e.world;
  // When Magic block is broken in phase 2, show every player the message "Caves at last!".
  rule("caves", () => { // rule:caves
    msm.players().forEach((target) => target.sendMessage("Caves at last!")); // rule:caves
  }); // rule:caves
});
