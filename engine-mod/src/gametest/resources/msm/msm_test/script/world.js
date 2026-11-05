"use strict";
// World API (ADR 0032 D2) on interacting with a lodestone.
var msm = require("msm:runtime").msm;
msm.events.on("block.interact", function (e) {
    if (e.block.id !== "minecraft:lodestone") {
        return;
    }
    var w = e.world;
    var p = e.block.pos;
    var up = p.offset(0, 1, 0);
    var placed = w.setBlock(up, "minecraft:oak_stairs[facing=east,half=top]");
    var bad = w.setBlock(up, "minecraft:no_such_block");
    var state = w.getBlock(up);
    w.spawnParticle("minecraft:flame", p, { count: 3, spread: 0.2 });
    w.playSound("minecraft:block.note_block.bell", p, { volume: 0.5, pitch: 2 });
    var count = w.runCommand("setblock " + p.x + " " + (p.y + 2) + " " + p.z + " minecraft:gold_block");
    var fn = w.runFunction("msm_test:script_noop");
    var missing = w.runFunction("msm_test:no_such_function");
    var chicken = w.spawnEntity("minecraft:chicken", p.offset(1, 1, 0));
    var near = w.entitiesNear(p.offset(1, 1, 0), 2).filter(function (n) { return chicken !== undefined && n.uuid === chicken.uuid; });
    var none = w.spawnEntity("minecraft:no_such_entity", p);
    msm.log.info("world " + [placed, bad, state, count, fn, missing, chicken ? chicken.type : "none", near.length, typeof none,
        w.dimension, typeof w.time].join(" | ") + " at " + p);
    e.cancel();
});
