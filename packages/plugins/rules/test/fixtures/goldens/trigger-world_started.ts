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

// When the world starts.
msm.events.on("server.started", (e) => {
  const world = e.world;
  // When the world starts, set the weather to clear for 30 seconds.
  rule("sample", () => { // rule:sample
    world.setWeather("clear", 30); // rule:sample
  }); // rule:sample
});
