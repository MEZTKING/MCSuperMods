"use strict";
// Interacting with bedrock loops for ever: the 2000 ms budget per call stops it (ADR 0031 D3).
var msm = require("msm:runtime").msm;
msm.events.on("block.interact", function (e) {
    if (e.block.id !== "minecraft:bedrock") {
        return;
    }
    var n = 0;
    while (true) {
        try {
            n++;
        } catch (err) {
            // A script cannot swallow the timeout.
        }
    }
});
