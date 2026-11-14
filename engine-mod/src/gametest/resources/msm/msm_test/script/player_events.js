"use strict";
// The events of script API 1.1 (ADR 0065 D8), each logged for the players and mobs MsmScriptApiGameTest names.
var msm = require("msm:runtime").msm;

var serverTick = -1;
msm.events.on("server.tick", function (e) {
    serverTick = e.tick;
});

function watched(name) {
    return name.indexOf("msm-ev-") === 0;
}

msm.events.on("player.tick", function (e) {
    if (watched(e.player.name)) {
        msm.log.info("player.tick/7 " + e.player.name + " at " + serverTick);
    }
}, { interval: 7 });

msm.events.on("player.tick", function (e) {
    if (watched(e.player.name)) {
        msm.log.info("player.tick/1 " + e.player.name + " at " + serverTick);
    }
}, { interval: 1 });

msm.events.on("player.respawn", function (e) {
    if (watched(e.player.name)) {
        msm.log.info("player.respawn " + e.player.name + " in " + e.world.dimension + " health " + e.player.health);
    }
});

msm.events.on("player.leave", function (e) {
    if (watched(e.player.name)) {
        msm.log.info("player.leave " + e.player.name + " in " + e.world.dimension);
    }
});

msm.events.on("player.changeDimension", function (e) {
    if (watched(e.player.name)) {
        msm.log.info("player.changeDimension " + e.player.name + " " + e.from + " -> " + e.to + " world "
            + e.world.dimension + " now " + e.player.world.dimension);
    }
});

msm.events.on("player.chat", function (e) {
    if (!watched(e.player.name)) {
        return;
    }
    msm.log.info("player.chat " + e.player.name + ": " + e.message);
    if (e.message.indexOf("secret") >= 0) {
        e.cancel();
    }
});

msm.events.on("entity.damaged", function (e) {
    if (e.entity.name !== "msm-ev-damaged") {
        return;
    }
    msm.log.info("entity.damaged " + e.entity.type + " amount " + e.amount + " source " + e.source + " attacker "
        + (e.attacker ? e.attacker.type : "none") + " direct " + (e.direct ? e.direct.type : "none")
        + " health " + e.entity.health);
});

msm.events.on("entity.hurt", function (e) {
    if (e.entity.name !== "msm-ev-hurt") {
        return;
    }
    msm.log.info("entity.hurt " + e.entity.type + " source " + e.source + " attacker " + (e.attacker ? e.attacker.type : "none")
        + " direct " + (e.direct ? e.direct.type : "none"));
});
