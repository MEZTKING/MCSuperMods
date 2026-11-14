"use strict";
// Script API 1.4 (ADR 0082 D5): weather, time of day, explosions, dropped items, breaking blocks and removing entities,
// through run_script handlers that MsmScriptApi14GameTest calls directly (e.pos at the block under test, e.entity a mob,
// e.player a mock player).
var msm = require("msm:runtime").msm;

function attempt(out, label, fn) {
    try {
        var result = fn();
        out.push(label + ":" + (result === undefined ? "ok" : String(result)));
    } catch (err) {
        out.push(label + ":" + err.name);
    }
}

msm.actions.define("msm_test:api14_report", function (e) {
    var nether = msm.getWorld("minecraft:the_nether");
    msm.log.info("report " + e.world.isRaining + " " + e.world.isThundering + " " + e.world.dayTime + " nether "
        + (nether ? nether.isRaining + " " + nether.isThundering : "none"));
});

msm.actions.define("msm_test:api14_rain", function (e) {
    e.world.setWeather("rain", 30);
});

msm.actions.define("msm_test:api14_thunder", function (e) {
    e.world.setWeather("thunder");
});

msm.actions.define("msm_test:api14_clear", function (e) {
    e.world.setWeather("clear", 0.5);
});

msm.actions.define("msm_test:api14_explode_soft", function (e) {
    e.world.explode(e.pos.offset(0.5, 1.5, 0.5), 2, { breaksBlocks: false });
});

msm.actions.define("msm_test:api14_explode_hard", function (e) {
    e.world.explode(e.pos.offset(0.5, 0.5, 0.5), 3, { fire: false });
});

msm.actions.define("msm_test:api14_drop", function (e) {
    e.world.dropItem(e.pos.offset(0.5, 0.5, 0.5), { id: "minecraft:diamond", count: 70 });
    e.world.dropItem(e.pos.offset(0.5, 0.5, 0.5), "minecraft:ender_pearl");
});

msm.actions.define("msm_test:api14_break", function (e) {
    var out = [];
    attempt(out, "drops", function () { return e.world.breakBlock(e.pos); });
    attempt(out, "air", function () { return e.world.breakBlock(e.pos); });
    msm.log.info("break " + out.join(" "));
});

msm.actions.define("msm_test:api14_break_clean", function (e) {
    msm.log.info("clean " + e.world.breakBlock(e.pos, { drops: false }));
});

msm.actions.define("msm_test:api14_remove", function (e) {
    var out = [];
    attempt(out, "mob", function () { e.entity.remove(); });
    attempt(out, "alive", function () { return e.entity.isAlive; });
    attempt(out, "player", function () { e.player.remove(); });
    msm.log.info("remove " + out.join(" "));
});

msm.actions.define("msm_test:api14_errors", function (e) {
    var out = [];
    attempt(out, "power11", function () { e.world.explode(e.pos, 11); });
    attempt(out, "powerNeg", function () { e.world.explode(e.pos, -1); });
    attempt(out, "powerNaN", function () { e.world.explode(e.pos, NaN); });
    attempt(out, "power0", function () { e.world.explode(e.pos, 0, { breaksBlocks: false }); });
    attempt(out, "snow", function () { e.world.setWeather("snow"); });
    attempt(out, "seconds0", function () { e.world.setWeather("rain", 0); });
    attempt(out, "secondsBig", function () { e.world.setWeather("rain", 1000001); });
    attempt(out, "tooMany", function () { e.world.dropItem(e.pos, { id: "minecraft:ender_pearl", count: 1025 }); });
    attempt(out, "unknownItem", function () { e.world.dropItem(e.pos, "msm_test:missing_item"); });
    attempt(out, "badOptions", function () { e.world.breakBlock(e.pos, 3); });
    msm.log.info("errors " + out.join(" "));
});
