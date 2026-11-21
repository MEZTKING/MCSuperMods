"use strict";
// Script API 1.6 (ADR 0096 D3, D4, ADR 0095 D5): the block.place, world.explosion and command events and the riding,
// dropped item and contents members. The event handlers log one line per event, which MsmMixinEventGameTest and
// MsmScriptApi16GameTest find by player name, source UUID or position (other GameTests place blocks, blow things up and
// run commands at the same time). They cancel only for the names the tests give: a player "msm-noplace", an exploding
// entity "msm-cancel", "msm-keep" or "msm-both".
var msm = require("msm:runtime").msm;

function attempt(out, label, fn) {
    try {
        var result = fn();
        out.push(label + ":" + (result === undefined ? "ok" : String(result)));
    } catch (err) {
        out.push(label + ":" + err.name);
    }
}

msm.events.on("block.place", function (e) {
    msm.log.info("place " + e.player.name + " " + e.block + " " + e.pos + " " + e.item.id + " " + e.item.count + " "
        + (e.world !== undefined));
    if (e.player.name === "msm-noplace") {
        e.cancel();
    }
});

msm.events.on("world.explosion", function (e) {
    var name = e.source ? e.source.name : "";
    msm.log.info("explosion " + (e.source ? e.source.uuid : "none") + " " + e.cause + " " + e.radius + " " + e.pos);
    if (name === "msm-cancel" || name === "msm-both") {
        e.cancel();
    }
    if (name === "msm-keep" || name === "msm-both") {
        e.keepBlocks();
    }
});

msm.events.on("command", function (e) {
    msm.log.info("command " + e.id + " " + e.name + " " + (e.source ? e.source.uuid : "none") + " " + JSON.stringify(e.args)
        + " " + (e.world !== undefined));
});

// e.entity: a mob to ride, e.other: a second mob to ride it.
msm.actions.define("msm_test:api16_ride", function (e) {
    var mount = e.entity;
    var rider = e.other;
    var out = [];
    attempt(out, "ride", function () { return rider.ride(mount); });
    out.push(rider.vehicle === undefined ? "none" : rider.vehicle.type);
    out.push(mount.passengers.length);
    out.push(mount.passengers.length > 0 && mount.passengers[0].uuid === rider.uuid);
    out.push(mount.vehicle === undefined);
    attempt(out, "again", function () { return rider.ride(mount); });
    attempt(out, "self", function () { return rider.ride(rider); });
    attempt(out, "loop", function () { return mount.ride(rider); });
    attempt(out, "dismount", function () { return rider.dismount(); });
    out.push(rider.vehicle === undefined);
    out.push(mount.passengers.length);
    attempt(out, "twice", function () { return rider.dismount(); });
    attempt(out, "soon", function () { return rider.ride(mount); });
    attempt(out, "notEntity", function () { return rider.ride("minecraft:pig"); });
    attempt(out, "missing", function () { return rider.ride(); });
    msm.log.info("ride " + out.join(" "));
});

// e.entity: a mob to ride, e.other: a second mob that gets on it and stays.
msm.actions.define("msm_test:api16_ride_only", function (e) {
    msm.log.info("rideOnly " + e.other.ride(e.entity));
});

// e.entity: a mob ridden by e.other; a cow spawned here is the second mount.
msm.actions.define("msm_test:api16_switch", function (e) {
    var cow = e.world.spawnEntity("minecraft:cow", e.entity.pos);
    var result = e.other.ride(cow);
    msm.log.info("switch " + result + " " + (e.other.vehicle === undefined ? "none" : e.other.vehicle.type) + " "
        + e.entity.passengers.length + " " + cow.passengers.length);
    e.other.dismount();
    cow.remove();
});

// e.entity: a mob, e.player: a player, e.other: a second player.
msm.actions.define("msm_test:api16_players", function (e) {
    var out = [];
    attempt(out, "onPlayer", function () { return e.player.ride(e.other); });
    attempt(out, "onMob", function () { return e.player.ride(e.entity); });
    out.push(e.player.vehicle === undefined ? "none" : e.player.vehicle.uuid === e.entity.uuid);
    out.push(e.entity.passengers.length);
    attempt(out, "mobOnPlayer", function () { return e.entity.ride(e.other); });
    attempt(out, "off", function () { return e.player.dismount(); });
    msm.log.info("players " + out.join(" "));
});

// e.pos: the middle of a test; around it a stack of rotten flesh, a poisonous potato thrown by e.player and a stick.
msm.actions.define("msm_test:api16_items", function (e) {
    var found = e.world.itemsNear(e.pos, 3);
    var ids = [];
    var out = [];
    // The flesh's results before the potato's, whatever order itemsNear finds them in (it follows entity sections).
    var fleshOut = [];
    var potatoOut = [];
    for (var i = 0; i < found.length; i++) {
        var d = found[i];
        ids.push(d.item.id + "x" + d.item.count + (d.owner === undefined ? "" : (d.owner === e.player.uuid ? "@player" : "@other")));
        if (d.age < 0 || typeof d.pos.y !== "number") {
            out.push("bad");
        }
        if (d.item.id === "minecraft:rotten_flesh") {
            d.setItem({ id: "minecraft:leather", count: 2 });
            fleshOut.push("set " + d.item.id + "x" + d.item.count);
            attempt(fleshOut, "setMissing", function () { d.setItem(); });
            attempt(fleshOut, "setBad", function () { d.setItem(3); });
            d.setItem({ id: "minecraft:leather", count: 999 });
            fleshOut.push("capped " + d.item.count);
        }
        if (d.item.id === "minecraft:poisonous_potato") {
            d.remove();
            attempt(potatoOut, "removeAgain", function () { d.remove(); });
            attempt(potatoOut, "setGone", function () { d.setItem("minecraft:diamond"); });
        }
    }
    out = out.concat(fleshOut, potatoOut);
    ids.sort();
    out.push("living " + e.world.entitiesNear(e.pos, 3).length);
    out.push("tiny " + e.world.itemsNear(e.pos.offset(0, 50, 0), 0.5).length);
    attempt(out, "assign", function () { found[0].age = 5; });
    msm.log.info("items " + ids.join(",") + " " + out.join(" "));
});

// e.player holds a bag in the main hand, a bundle in the off hand and a stick in the first hotbar slot that is not held.
msm.actions.define("msm_test:api16_contents", function (e) {
    function list(item) {
        if (item === undefined) {
            return "empty";
        }
        var parts = [];
        for (var i = 0; i < item.contents.length; i++) {
            parts.push(item.contents[i].id + "x" + item.contents[i].count);
        }
        return item.id + "[" + parts.join(",") + "]";
    }
    var inv = e.player.inventory;
    var out = [list(inv.get("mainhand")), list(inv.get("offhand")), list(inv.get(1))];
    attempt(out, "assign", function () { inv.get("mainhand").contents = []; });
    msm.log.info("contents " + out.join(" "));
});
