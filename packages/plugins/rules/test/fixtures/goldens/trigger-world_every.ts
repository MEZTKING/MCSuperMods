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

// Every 10 seconds.
msm.events.on("server.tick", (e) => {
  if (e.tick % 200 !== 0) return;
  const world = e.world;
  // Every 10 seconds, set the weather to clear for 30 seconds.
  rule("sample", () => { // rule:sample
    world.setWeather("clear", 30); // rule:sample
  }); // rule:sample
});
