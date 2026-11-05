"use strict";
// msm.schedule: at load, and from a handler (interacting with a target block places gold above it 5 ticks later).
var msm = require("msm:runtime").msm;
msm.schedule(5, function () {
    msm.log.info("schedule(5) at load ran");
});
msm.events.on("block.interact", function (e) {
    if (e.block.id !== "minecraft:target") {
        return;
    }
    var above = e.block.pos.offset(0, 1, 0);
    var world = e.world;
    var at = world.time;
    msm.schedule(5, function () {
        world.setBlock(above, "minecraft:gold_block");
        msm.log.info("scheduled after " + (world.time - at) + " tick(s) at " + above);
    });
    e.cancel();
});
