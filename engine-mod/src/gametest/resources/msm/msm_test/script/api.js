"use strict";
// Script API 1.1 (ADR 0065 D1 to D7, D9) through run_script handlers that MsmScriptApiGameTest calls directly:
// inventory and equipment, item components, player state, screen text, boss bars, typed damage, raycasts, teleports.
var msm = require("msm:runtime").msm;

function attempt(out, label, fn) {
    try {
        fn();
        out.push(label + ":ok");
    } catch (err) {
        out.push(label + ":" + err.name);
    }
}

function big(n) {
    return new Array(n + 1).join("x");
}

// e.player: a fresh mock player; e.entity: a zombie.
msm.actions.define("msm_test:api_inventory", function (e) {
    var p = e.player;
    var inv = p.inventory;
    var out = [];
    inv.set(0, "minecraft:diamond");
    inv.set(5, { id: "minecraft:diamond", count: 10 });
    inv.set(35, { id: "minecraft:emerald", count: 3 });
    inv.set("head", "minecraft:iron_helmet");
    inv.set("offhand", { id: "minecraft:shield" });
    inv.set("feet", "minecraft:diamond");
    out.push(inv.size, inv.selectedSlot, inv.get(0).id, inv.get(5).count, inv.get(35).id, inv.get("head").id,
        inv.get("offhand").id, inv.get("feet").id, inv.get(1) === undefined, inv.get("mainhand").id);
    out.push(inv.count("minecraft:diamond"), inv.find("minecraft:emerald"), inv.find("minecraft:diamond"),
        inv.find("minecraft:stick"));
    out.push(inv.remove("minecraft:diamond", 5), inv.count("minecraft:diamond"), inv.get(5).count);
    out.push(inv.remove("minecraft:diamond"), inv.count("minecraft:diamond"), inv.get(0) === undefined,
        inv.get("feet") === undefined, inv.remove("minecraft:diamond", 3));
    inv.set(35);
    out.push(inv.get(35) === undefined, inv.set(1, { id: "minecraft:stick", count: 99 }) === undefined, inv.get(1).count);
    attempt(out, "36", function () { inv.get(36); });
    attempt(out, "neg", function () { inv.get(-1); });
    attempt(out, "frac", function () { inv.get(1.5); });
    attempt(out, "body", function () { inv.get("body"); });
    attempt(out, "unknownItem", function () { inv.count("minecraft:no_such_item"); });
    var z = e.entity;
    z.setEquipment("mainhand", "minecraft:iron_sword");
    z.setEquipment("head", { id: "minecraft:golden_helmet" });
    out.push(z.equipment("mainhand").id, z.equipment("head").id, z.equipment("chest") === undefined);
    z.setEquipment("head");
    out.push(z.equipment("head") === undefined, p.equipment("head").id, p.equipment("offhand").id);
    attempt(out, "mobSlot", function () { z.equipment(0); });
    msm.log.info("inventory " + out.join(" "));
});

// e.player: a mock player; slot 2 holds a stick with a custom name over 64 KiB (set by the test).
msm.actions.define("msm_test:api_items", function (e) {
    var p = e.player;
    var inv = p.inventory;
    var out = [];
    inv.set(0, { id: "minecraft:diamond_sword", components: { "minecraft:custom_name": "Edge", "minecraft:damage": 5 } });
    var s = inv.get(0);
    out.push(s.name, s.maxCount, s.damage, s.maxDamage, s.hasComponent("minecraft:custom_name"),
        s.hasComponent("minecraft:max_damage"), s.hasComponent("minecraft:custom_data"));
    out.push(JSON.stringify(s.getComponent("minecraft:max_damage")), JSON.stringify(s.getComponent("minecraft:custom_name")),
        JSON.stringify(s.getComponent("minecraft:damage")), s.getComponent("minecraft:custom_data") === undefined);
    inv.setComponent(0, "minecraft:custom_name", "Renamed");
    inv.setComponent(0, "minecraft:custom_data", { level: 3, tags: ["a"] });
    out.push(inv.get(0).name, JSON.stringify(inv.get(0).getComponent("minecraft:custom_data")));
    inv.setComponent(0, "minecraft:custom_name");
    out.push(inv.get(0).name, inv.get(0).hasComponent("minecraft:custom_name"));
    attempt(out, "badValue", function () { inv.setComponent(0, "minecraft:damage", "lots"); });
    attempt(out, "invalidStack", function () { inv.setComponent(0, "minecraft:max_stack_size", 64); });
    attempt(out, "unknownComponent", function () { inv.setComponent(0, "minecraft:no_such_component", 1); });
    attempt(out, "notJson", function () { inv.setComponent(0, "minecraft:damage", function () {}); });
    attempt(out, "setOver64k", function () { inv.setComponent(0, "minecraft:custom_name", big(70000)); });
    attempt(out, "specOver64k", function () {
        p.give({ id: "minecraft:stone", components: { "minecraft:custom_name": big(70000) } });
    });
    attempt(out, "getOver64k", function () { inv.get(2).getComponent("minecraft:custom_name"); });
    attempt(out, "badSpec", function () { p.give({ id: "minecraft:stone", components: { "minecraft:damage": "x" } }); });
    attempt(out, "noId", function () { p.give({ count: 2 }); });
    out.push(inv.get(0).damage, inv.get(0).maxCount);
    inv.setComponent(1, "minecraft:custom_name", "nothing here");
    out.push(inv.get(1) === undefined);
    p.give({ id: "minecraft:apple", count: 70, components: { "minecraft:custom_name": "Gold" } });
    p.give("minecraft:arrow");
    p.give({ id: "minecraft:arrow", count: 9 }, 3);
    out.push(inv.count("minecraft:apple"), inv.count("minecraft:arrow"));
    msm.log.info("items " + out.join(" "));
});

msm.actions.define("msm_test:api_state", function (e) {
    var p = e.player;
    var out = [];
    p.setXpLevels(5);
    out.push(p.xpLevel);
    p.addXpLevels(2);
    out.push(p.xpLevel);
    var points = p.xpPoints;
    p.addXp(10);
    out.push(p.xpPoints - points);
    p.setXpLevels(-3);
    out.push(p.xpLevel);
    p.setXpLevels(7);
    p.setFood(5, 9);
    out.push(p.food, p.saturation);
    p.setFood(25);
    out.push(p.food, p.saturation);
    p.setFood(17, 3);
    out.push(p.food, p.saturation);
    out.push(p.gameMode, p.setGameMode("adventure"), p.setGameMode("adventure"), p.gameMode);
    attempt(out, "mode", function () { p.setGameMode("hardcore"); });
    msm.log.info("state " + out.join(" "));
});

msm.actions.define("msm_test:api_titles", function (e) {
    var p = e.player;
    p.showTitle("Wave 3", { subtitle: "Get ready", stay: 40 });
    p.showTitle("Plain");
    p.showActionBar("Mana: 7");
    p.clearTitle();
    msm.log.info("titles done");
});

msm.actions.define("msm_test:api_bossbar", function (e) {
    var p = e.player;
    var out = [];
    var bar = msm.bossBars.create("countdown", { title: "Time left", color: "red", style: "notched_10", progress: 0.5 });
    bar.addPlayer(p);
    bar.addPlayer(p);
    out.push(bar.players().length, bar.players()[0].name === p.name, msm.bossBars.get("countdown") !== undefined,
        msm.bossBars.get("none") === undefined);
    bar.setProgress(0.25);
    bar.setProgress(7);
    bar.setTitle("Hurry");
    bar.setColor("green");
    bar.setStyle("progress");
    bar.removePlayer(p);
    out.push(bar.players().length);
    attempt(out, "colour", function () { msm.bossBars.create("bad", { title: "x", color: "orange" }); });
    attempt(out, "style", function () { msm.bossBars.create("bad", { title: "x", style: "notched_7" }); });
    attempt(out, "noTitle", function () { msm.bossBars.create("bad", {}); });
    attempt(out, "badId", function () { msm.bossBars.create("Bad Id", { title: "x" }); });
    attempt(out, "notPlayer", function () { bar.addPlayer(e.entity); });
    for (var i = 0; i < 31; i++) {
        msm.bossBars.create("b" + i, { title: "Bar " + i });
    }
    attempt(out, "33rd", function () { msm.bossBars.create("b31", { title: "one too many" }); });
    attempt(out, "replace", function () { msm.bossBars.create("b0", { title: "again" }); });
    for (var j = 0; j < 31; j++) {
        msm.bossBars.get("b" + j).remove();
    }
    bar.addPlayer(p);
    bar.remove();
    bar.addPlayer(p);
    out.push(msm.bossBars.get("countdown") === undefined, bar.players().length);
    msm.log.info("bossbar " + out.join(" "));
});

// On a detached host: a bar shown to e.player, left for the reload to remove.
msm.actions.define("msm_test:api_bossbar_reload", function (e) {
    msm.bossBars.create("reloaded", { title: "Until reload" }).addPlayer(e.player);
});

// e.entity: the target; e.player: the attacker, or none.
msm.actions.define("msm_test:api_damage_by_player", function (e) {
    e.entity.damage(1000, { type: "minecraft:player_attack", attacker: e.player });
});

msm.actions.define("msm_test:api_damage_plain", function (e) {
    e.entity.damage(1000);
});

msm.actions.define("msm_test:api_damage_typed", function (e) {
    var out = [];
    e.entity.damage(3, { type: "msm_test:script_zap" });
    out.push(e.entity.health);
    attempt(out, "unknownType", function () { e.entity.damage(1, { type: "msm_test:no_such_type" }); });
    attempt(out, "badAttacker", function () { e.entity.damage(1, { attacker: "me" }); });
    msm.log.info("damage " + out.join(" "));
});

// e.pos: the ray origin block; stone 3 east (two high), a pig 3 south with stone 6 south, air above; e.player
// stands one block west looking east.
msm.actions.define("msm_test:api_raycast", function (e) {
    var w = e.world;
    var from = e.pos.offset(0.5, 0.5, 0.5);
    var out = [];
    var h = w.raycast(from, { x: 1, y: 0, z: 0 }, 10);
    out.push(h.kind, h.block.id, h.face, h.distance, h.pos.x - e.pos.x, h.entity === undefined);
    out.push(w.raycast(from, { x: 0, y: 1, z: 0 }, 1) === undefined);
    var pig = w.raycast(from, { x: 0, y: 0, z: 2 }, 10);
    out.push(pig.kind, pig.entity.type, pig.block === undefined, pig.face === undefined, pig.distance < 3);
    var behind = w.raycast(from, { x: 0, y: 0, z: 1 }, 10, { ignore: pig.entity });
    out.push(behind.kind, behind.block.id, behind.face);
    var through = w.raycast(from, { x: 0, y: 0, z: 1 }, 10, { entities: false });
    out.push(through.kind, through.distance);
    out.push(w.raycast(from, { x: 1, y: 0, z: 0 }, 2) === undefined);
    attempt(out, "129", function () { w.raycast(from, { x: 1, y: 0, z: 0 }, 129); });
    attempt(out, "128", function () { w.raycast(from, { x: 0, y: 1, z: 0 }, 128); });
    attempt(out, "negative", function () { w.raycast(from, { x: 1, y: 0, z: 0 }, -1); });
    attempt(out, "zero", function () { w.raycast(from, { x: 0, y: 0, z: 0 }, 5); });
    var eye = e.player.raycast(10);
    out.push(eye.kind, eye.block.id, eye.face);
    attempt(out, "eye129", function () { e.player.raycast(129); });
    msm.log.info("raycast " + out.join(" "));
});

// e.entity: a cow; e.player: a mock player.
msm.actions.define("msm_test:api_teleport", function (e) {
    var cow = e.entity;
    var p = e.player;
    var out = [];
    cow.teleport({ x: 0.5, y: 120, z: 0.5 }, { dimension: "minecraft:the_nether", yaw: 45 });
    out.push(cow.world.dimension, cow.isAlive, cow.pos.y, cow.type);
    cow.teleport(cow.pos.offset(1, 0, 0));
    out.push(cow.world.dimension, cow.pos.x);
    p.teleport({ x: 0.5, y: 100, z: 0.5 }, { dimension: "minecraft:the_end", yaw: 90, pitch: 10 });
    out.push(p.world.dimension, p.pos.y);
    attempt(out, "unknownDimension", function () { cow.teleport(cow.pos, { dimension: "minecraft:nowhere" }); });
    attempt(out, "badDimension", function () { cow.teleport(cow.pos, { dimension: "Not An Id" }); });
    out.push(msm.getWorld("minecraft:the_nether").dimension, msm.getWorld("minecraft:nowhere") === undefined);
    var named = msm.players().filter(function (q) { return q.name === p.name; });
    out.push(msm.players().length >= 1, named.length >= 1, named.length >= 1 && named[0].isPlayer);
    msm.log.info("teleport " + out.join(" "));
});
