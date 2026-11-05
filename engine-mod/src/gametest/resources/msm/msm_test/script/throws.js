"use strict";
// Deliberately throws: the server keeps running and the error is logged once per handler per 100 ticks.
var msm = require("msm:runtime").msm;
msm.events.on("block.interact", function (e) {
    if (e.block.id === "minecraft:diamond_block") {
        var missing = undefined;
        missing.boom();
    }
});
