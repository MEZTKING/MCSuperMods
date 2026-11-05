"use strict";
// One handler per game event of script API v1 (ADR 0032 D2), written as TypeScript's ES5 CommonJS output.
Object.defineProperty(exports, "__esModule", { value: true });
var msm_runtime_1 = require("msm:runtime");
var msm = msm_runtime_1.msm;
msm.events.on("server.started", function (e) {
    msm.log.info("server.started in " + e.world.dimension);
});
var ticks = 0;
msm.events.on("server.tick", function (e) {
    ticks++;
    if (e.tick % 20 === 0) {
        msm.log.info("server.tick " + ticks + " at " + e.tick + " in " + e.world.dimension);
    }
});
msm.events.on("block.interact", function (e) {
    msm.log.info("block.interact " + e.hand + " " + e.block.id + " at " + e.block.pos);
    if (e.block.id === "msm_test:kitchen_sink") {
        e.world.setBlock(e.block.pos.offset(0, 1, 0), "minecraft:glowstone");
        e.player.give("minecraft:emerald", 1);
        e.cancel();
    }
});
msm.events.on("block.break", function (e) {
    if (e.block.id === "minecraft:glowstone") {
        msm.log.info("block.break " + e.block.state + " by " + e.player.name + " at " + e.block.pos);
        e.cancel();
    }
});
msm.events.on("item.use", function (e) {
    msm.log.info("item.use " + e.hand + " " + e.item.id + " x" + e.item.count + " held " + e.player.heldItem);
    if (e.item.id === "minecraft:ender_pearl") {
        e.cancel();
    }
});
msm.events.on("entity.interact", function (e) {
    if (e.entity.name !== "msm-interact") {
        return;
    }
    msm.log.info("entity.interact " + e.hand + " " + e.entity.type + " by " + e.player.name);
    e.cancel();
});
msm.events.on("entity.hurt", function (e) {
    if (e.entity.name !== "msm-hurt") {
        return;
    }
    msm.log.info("entity.hurt " + e.entity.type + " amount " + e.amount + " attacker " + (e.attacker ? e.attacker.type : "none"));
    e.cancel();
});
msm.events.on("entity.death", function (e) {
    if (e.entity.name !== "msm-death") {
        return;
    }
    msm.log.info("entity.death " + e.entity.type + " attacker "
        + (e.attacker ? e.attacker.type + " isPlayer=" + e.attacker.isPlayer : "none"));
});
msm.events.on("player.join", function (e) {
    msm.log.info("player.join " + e.player.name + " in " + e.world.dimension);
});
// Not an event of API v1: a load-time error for this call only; the handlers above still register.
msm.events.on("no.such.event", function () { });
