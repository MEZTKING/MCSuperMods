"use strict";
// Written by hand in the shape TypeScript's transpileModule emits for ES5 CommonJS (B130 spike).
Object.defineProperty(exports, "__esModule", { value: true });
var msm_runtime_1 = require("msm:runtime");
var msm = msm_runtime_1.msm;
var ORE = "msm_spike:glow_ore";
var ticks = 0;
msm.events.on("block.interact", function (e) {
    if (e.block.id !== ORE) {
        return;
    }
    e.world.setBlock(e.block.pos.offset(0, 1, 0), "minecraft:glowstone");
    e.player.give("msm_spike:shard", 1);
    e.cancel();
});
msm.events.on("block.break", function (e) {
    if (e.block.id === "minecraft:glowstone") {
        e.cancel();
    }
});
msm.events.on("block.interact", function (e) {
    if (e.block.id !== "minecraft:target") {
        return;
    }
    var above = e.block.pos.offset(0, 1, 0);
    msm.schedule(5, function () {
        e.world.setBlock(above, "minecraft:gold_block");
    });
    e.cancel();
});
// Deliberately throws: the server keeps running and the error is logged once per 100 ticks.
msm.events.on("block.interact", function (e) {
    if (e.block.id === "minecraft:diamond_block") {
        var missing = undefined;
        missing.boom();
    }
});
msm.events.on("server.tick", function (_e) {
    ticks++;
    if (ticks % 100 === 0) {
        msm.log.info("ticks seen: " + ticks);
    }
});
msm.schedule(5, function () {
    msm.log.info("schedule(5) at load ran");
});
// Named groups need Rhino's RegExpLoader service, found through ServiceLoader from the nested jar.
var match = /(?<ns>[a-z_]+):(?<path>[a-z_]+)/.exec(ORE);
msm.log.info("regex " + match.groups.ns + "/" + match.groups.path);
msm.log.info("sandbox java=" + typeof java + " Packages=" + typeof Packages + " JavaAdapter=" + typeof JavaAdapter);
