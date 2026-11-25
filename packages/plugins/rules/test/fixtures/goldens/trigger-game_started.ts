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

/** The values typed for the command's arguments, by name (ADR 0111 D1). */
const commandArgs = (e: object): { [name: string]: unknown } => {
  const args = (e as { args?: unknown }).args;
  return typeof args === "object" && args !== null ? (args as { [name: string]: unknown }) : {};
};

// When a round of Lifesteal starts.
msm.events.on("command", (e) => {
  if (e.id !== "demo:msm_signal" || commandArgs(e)["signal"] !== "game_start+demo+lifesteal") return;
  const world = e.world;
  // When a round of Lifesteal starts, set the weather to clear for 30 seconds.
  rule("sample", () => { // rule:sample
    world.setWeather("clear", 30); // rule:sample
  }); // rule:sample
});
