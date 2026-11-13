"use strict";
// Script commands (ADR 0058 D2): World.runCommand and World.runFunction with and without `at` on interacting with an
// amethyst block; Entity.runCommand and Entity.runFunction on interacting with an entity named msm-cmd. Cancel resync
// (ADR 0058 D3): breaking an oak sign is cancelled, so the sign's block entity is sent back.
var msm = require("msm:runtime").msm;
msm.events.on("block.interact", function (e) {
    if (e.block.id !== "minecraft:amethyst_block") {
        return;
    }
    var w = e.world;
    var p = e.block.pos;
    // The same command without and with `at`: the first marker goes to the world spawn point, the second above p.
    var spawnTp = w.runCommand("tp @e[type=minecraft:marker,tag=msm_cmd_spawn] ~ ~ ~");
    var atTp = w.runCommand("tp @e[type=minecraft:marker,tag=msm_cmd_at] ~ ~1 ~", p);
    var noSelf = w.runCommand("execute if entity @s");
    var placed = w.runCommand("setblock ~ ~2 ~ minecraft:emerald_block", p);
    // script_place.mcfunction sets a diamond block at ~ ~3 ~.
    var fn = w.runFunction("msm_test:script_place", p);
    var missing = w.runFunction("msm_test:no_such_function", p);
    msm.log.info("world " + [spawnTp, atTp, noSelf, placed, fn, missing].join(" | ") + " at " + p);
    e.cancel();
});
msm.events.on("entity.interact", function (e) {
    var t = e.entity;
    if (t.name !== "msm-cmd") {
        return;
    }
    var tagged = t.runCommand("tag @s add msm_cmd");
    var self = t.runCommand("execute if entity @s[tag=msm_cmd]");
    var here = t.runCommand("setblock ~ ~2 ~ minecraft:gold_block");
    var ahead = t.runCommand("setblock ^ ^ ^2 minecraft:lapis_block");
    var time = t.runCommand("time query gametime");
    var fn = t.runFunction("msm_test:mark");
    var missing = t.runFunction("msm_test:no_such_function");
    msm.log.info("entity " + [tagged, self, here, ahead, fn, missing].join(" | ") + " time " + time);
    e.cancel();
});
msm.events.on("block.break", function (e) {
    if (e.block.id === "minecraft:oak_sign") {
        e.cancel();
    }
});
