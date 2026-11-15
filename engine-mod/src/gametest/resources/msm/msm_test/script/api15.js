"use strict";
// Script API 1.5 (ADR 0089 D8): HUD elements, riding, the Vehicle type and the key and vehicle events, through
// run_script handlers that MsmScriptApi15GameTest calls directly and event handlers that note what they see per player
// or vehicle UUID (other GameTests press keys and drive vehicles at the same time, so each test reads only its own).
var msm = require("msm:runtime").msm;

var seen = {};

function note(uuid, line) {
    if (!seen[uuid]) {
        seen[uuid] = [];
    }
    seen[uuid].push(line);
}

function attempt(out, label, fn) {
    try {
        var result = fn();
        out.push(label + ":" + (result === undefined ? "ok" : String(result)));
    } catch (err) {
        out.push(label + ":" + err.name);
    }
}

msm.events.on("key.pressed", function (e) {
    note(e.player.uuid, "pressed " + e.key + " " + (e.world !== undefined));
});

msm.events.on("key.released", function (e) {
    note(e.player.uuid, "released " + e.key);
});

msm.events.on("vehicle.mounted", function (e) {
    var driver = e.vehicle.driver;
    note(e.player.uuid, "mounted " + e.vehicle.type + " " + e.vehicle.isVehicle + " "
        + (driver !== undefined && driver.uuid === e.player.uuid) + " "
        + (e.player.vehicle !== undefined && e.player.vehicle.uuid === e.vehicle.uuid));
    note(e.vehicle.uuid, "mounted");
});

msm.events.on("vehicle.dismounted", function (e) {
    note(e.player.uuid, "dismounted " + e.vehicle.type + " " + (e.player.vehicle === undefined));
    note(e.vehicle.uuid, "dismounted");
});

msm.events.on("vehicle.fired", function (e) {
    note(e.player.uuid, "fired " + e.vehicle.type + " " + e.weapon + " " + e.vehicle.ammo(e.weapon));
});

msm.events.on("vehicle.destroyed", function (e) {
    note(e.vehicle.uuid, "destroyed " + (e.player ? e.player.uuid : "none") + " " + e.vehicle.passengers.length);
    if (e.player) {
        note(e.player.uuid, "destroyed " + e.vehicle.type);
    }
});

// What the event handlers noted for e.player (or e.entity without a player), then forgotten.
msm.actions.define("msm_test:api15_report", function (e) {
    var who = e.player ? e.player.uuid : e.entity.uuid;
    msm.log.info("report " + who + " " + (seen[who] || []).join(","));
    seen[who] = [];
});

// e.player: a player.
msm.actions.define("msm_test:api15_hud", function (e) {
    var p = e.player;
    var out = [];
    attempt(out, "show", function () { return p.showHud("msm_test:hud_hidden"); });
    attempt(out, "bar", function () { return p.setHud("msm_test:hud_set_bar", 7); });
    attempt(out, "text", function () { return p.setHud("msm_test:hud_set_text", "hello"); });
    attempt(out, "hide", function () { return p.hideHud("msm_test:hud_set_text"); });
    attempt(out, "unknownSet", function () { return p.setHud("msm_test:not_a_hud", 1); });
    attempt(out, "unknownShow", function () { return p.showHud("msm_test:not_a_hud"); });
    attempt(out, "unknownHide", function () { return p.hideHud("msm_test:not_a_hud"); });
    attempt(out, "nan", function () { return p.setHud("msm_test:hud_set_bar", NaN); });
    attempt(out, "bool", function () { return p.setHud("msm_test:hud_set_bar", true); });
    attempt(out, "badId", function () { return p.showHud("Not Valid!"); });
    attempt(out, "missing", function () { return p.setHud("msm_test:hud_set_bar"); });
    msm.log.info("hud " + out.join(" "));
});

// e.entity: a kart, e.player its driver (a second player rides behind), e.other a sheep in a minecart.
msm.actions.define("msm_test:api15_riding", function (e) {
    var v = e.entity;
    var p = e.player;
    var cart = e.other.vehicle;
    var out = [
        v.isVehicle, v.asVehicle() !== undefined, v.passengers.length, v.passengers[0].uuid === p.uuid,
        v.vehicle === undefined, p.vehicle.uuid === v.uuid, p.vehicle.isVehicle, p.isVehicle, p.asVehicle() === undefined,
        p.passengers.length, v.driver.uuid === p.uuid, p.vehicle.asVehicle().driver.uuid === p.uuid,
        cart.type, cart.isVehicle, cart.asVehicle() === undefined, cart.passengers[0].uuid === e.other.uuid,
    ];
    attempt(out, "assign", function () { v.passengers = []; });
    msm.log.info("riding " + out.join(" "));
});

// e.entity: a kart (fuel capacity 250, health 10, no weapons), e.player its driver.
msm.actions.define("msm_test:api15_fuel", function (e) {
    var v = e.entity;
    var out = [v.fuel];
    v.setFuel(100);
    out.push(v.fuel);
    v.setFuel(9999);
    out.push(v.fuel);
    v.setFuel(-5);
    out.push(v.fuel);
    v.setFuel(12.7);
    out.push(v.fuel);
    out.push(v.damageTaken);
    v.setDamageTaken(3.5);
    out.push(v.damageTaken);
    v.setDamageTaken(-1);
    out.push(v.damageTaken);
    v.setDamageTaken(2);
    out.push(v.driver === undefined ? "none" : v.driver.uuid === e.player.uuid);
    attempt(out, "ammo", function () { return v.ammo(0); });
    attempt(out, "fuelArg", function () { v.setFuel(); });
    msm.log.info("fuel " + out.join(" "));
});

// e.entity: a tank (weapon "cannon", capacity 10).
msm.actions.define("msm_test:api15_ammo", function (e) {
    var v = e.entity;
    var out = [v.ammo("cannon")];
    v.setAmmo("cannon", 4);
    out.push(v.ammo(0));
    v.setAmmo(0, 99);
    out.push(v.ammo("cannon"));
    v.setAmmo(0, -3);
    out.push(v.ammo(0));
    v.setAmmo(0, 6);
    out.push(v.driver === undefined ? "none" : "driver");
    attempt(out, "unknownId", function () { return v.ammo("nope"); });
    attempt(out, "index", function () { return v.ammo(1); });
    attempt(out, "fraction", function () { return v.ammo(0.5); });
    attempt(out, "negative", function () { return v.setAmmo(-1, 2); });
    attempt(out, "missing", function () { return v.setAmmo("cannon"); });
    msm.log.info("ammo " + out.join(" "));
});

// e.entity: a kart with health.max 10: wrecked by its damage counter.
msm.actions.define("msm_test:api15_wreck", function (e) {
    e.entity.setDamageTaken(10);
});
