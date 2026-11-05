"use strict";
// Player API (ADR 0032 D2) on interacting with a bookshelf.
var msm = require("msm:runtime").msm;
msm.events.on("block.interact", function (e) {
    if (e.block.id !== "minecraft:bookshelf") {
        return;
    }
    var p = e.player;
    p.give("minecraft:apple", 3);
    p.sendMessage("Hello from a script");
    msm.log.info("player " + [p.name, p.isSneaking, p.isCreative, p.heldItem, p.hasItem("minecraft:apple"),
        p.hasItem("minecraft:elytra"), p.isPlayer, p.asPlayer() !== undefined, p.type].join(" | "));
    e.cancel();
});
