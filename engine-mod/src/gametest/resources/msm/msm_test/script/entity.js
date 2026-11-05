"use strict";
// Entity API (ADR 0032 D2) on interacting with an entity named msm-api or msm-kill.
var msm = require("msm:runtime").msm;
msm.events.on("entity.interact", function (e) {
    var t = e.entity;
    if (t.name === "msm-kill") {
        t.kill();
        msm.log.info("killed " + t.type + " alive=" + t.isAlive);
        e.cancel();
        return;
    }
    if (t.name !== "msm-api") {
        return;
    }
    var before = t.health;
    t.damage(4);
    var hurt = t.health;
    t.heal(2);
    var healed = t.health;
    t.addEffect("minecraft:speed", 200, 1);
    t.teleport(t.pos.offset(1, 0, 0));
    t.playAnimation("slam");
    msm.log.info("entity " + t.type + " " + [before - hurt, healed - hurt, t.maxHealth > 0, t.isAlive, t.isPlayer,
        typeof t.uuid, t.asPlayer() === undefined, t.world.dimension].join(" | "));
    e.cancel();
});
