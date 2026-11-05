"use strict";
// The handler the run_script action of msm/msm_test/block/scripted.json calls (ADR 0032 D4).
var msm = require("msm:runtime").msm;
msm.actions.define("msm_test:scripted_action", function (e) {
    e.world.setBlock(e.pos.offset(0, 1, 0), "minecraft:emerald_block");
    msm.log.info("action " + e.owner + " " + e.event + " " + (e.block ? e.block.id : "none") + " "
        + (e.player ? e.player.name : "none") + " entity=" + typeof e.entity + " at " + e.pos);
});
