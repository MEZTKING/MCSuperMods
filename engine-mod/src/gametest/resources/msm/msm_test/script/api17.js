"use strict";
// Script API 1.7 (ADR 0111 D3 to D6): the crafted, picked up, ate, slept, woke and advancement events and the game rule,
// statistic and dialog members. The event handlers log one line per event, but only for players whose name starts with
// "b533" (the recording players of MsmScriptApi17GameTest), so other GameTests' crafting, pickups and meals stay out of
// the log.
var msm = require("msm:runtime").msm;

function ours(player) {
    return player.name.indexOf("b533") === 0;
}

function attempt(out, label, fn) {
    try {
        var result = fn();
        out.push(label + ":" + (result === undefined ? "ok" : String(result)));
    } catch (err) {
        out.push(label + ":" + err.name);
    }
}

msm.events.on("item.crafted", function (e) {
    if (ours(e.player)) {
        msm.log.info("crafted " + e.player.name + " " + e.item.id + " " + e.count + " " + e.item.count + " " + (e.world !== undefined));
    }
});

msm.events.on("item.picked_up", function (e) {
    if (ours(e.player)) {
        msm.log.info("picked " + e.player.name + " " + e.item.id + " " + e.count + " " + e.item.count);
    }
});

msm.events.on("player.ate", function (e) {
    if (ours(e.player)) {
        msm.log.info("ate " + e.player.name + " " + e.item.id + " " + e.item.count);
    }
});

msm.events.on("player.slept", function (e) {
    if (ours(e.player)) {
        msm.log.info("slept " + e.player.name + " " + e.pos.x + " " + e.pos.y + " " + e.pos.z);
    }
});

msm.events.on("player.woke", function (e) {
    if (ours(e.player)) {
        msm.log.info("woke " + e.player.name + " " + e.pos.x + " " + e.pos.y + " " + e.pos.z);
    }
});

msm.events.on("player.advancement", function (e) {
    if (ours(e.player)) {
        msm.log.info("advancement " + e.player.name + " " + e.advancement);
    }
});

// e.player: a recording player. Game rules msm_test:b533_script_flag (boolean, false) and b533_script_level (1..5, 2),
// which only this handler changes; both are put back at the end.
msm.actions.define("msm_test:api17_rules", function (e) {
    var w = e.world;
    var out = [];
    out.push(w.gameRule("msm_test:b533_script_flag"));
    out.push(w.gameRule("msm_test:b533_script_level"));
    attempt(out, "setFlag", function () { return w.setGameRule("msm_test:b533_script_flag", true); });
    out.push(w.gameRule("msm_test:b533_script_flag"));
    attempt(out, "setLevel", function () { return w.setGameRule("msm_test:b533_script_level", 4.7); });
    out.push(w.gameRule("msm_test:b533_script_level"));
    attempt(out, "high", function () { return w.setGameRule("msm_test:b533_script_level", 99); });
    out.push(w.gameRule("msm_test:b533_script_level"));
    attempt(out, "low", function () { return w.setGameRule("msm_test:b533_script_level", -3); });
    out.push(w.gameRule("msm_test:b533_script_level"));
    attempt(out, "flagNumber", function () { return w.setGameRule("msm_test:b533_script_flag", 1); });
    attempt(out, "levelBool", function () { return w.setGameRule("msm_test:b533_script_level", true); });
    attempt(out, "levelNaN", function () { return w.setGameRule("msm_test:b533_script_level", NaN); });
    attempt(out, "unknown", function () { return w.gameRule("msm_test:no_such_rule"); });
    attempt(out, "invalid", function () { return w.gameRule("Not An Id"); });
    out.push(typeof w.gameRule("keep_inventory"));
    out.push(typeof w.gameRule("minecraft:random_tick_speed"));
    w.setGameRule("msm_test:b533_script_flag", false);
    w.setGameRule("msm_test:b533_script_level", 2);
    msm.log.info("rules " + out.join(" "));
});

// A run_script action: its args (a project command's arguments when it runs in that command's own event).
msm.actions.define("msm_test:api17_args", function (e) {
    msm.log.info("args " + (e.player ? e.player.name : "none") + " " + (e.args === undefined ? "undefined" : JSON.stringify(e.args)));
});

// e.player: a recording player who has no msm_test:b533_script statistic yet.
msm.actions.define("msm_test:api17_stats", function (e) {
    var p = e.player;
    var out = [];
    out.push(p.stat("msm_test:b533_script"));
    attempt(out, "add", function () { return p.addStat("msm_test:b533_script", 3); });
    attempt(out, "addFraction", function () { return p.addStat("msm_test:b533_script", 2.9); });
    out.push(p.stat("msm_test:b533_script"));
    attempt(out, "takeAway", function () { return p.addStat("msm_test:b533_script", -1); });
    attempt(out, "belowZero", function () { return p.addStat("msm_test:b533_script", -100); });
    attempt(out, "again", function () { return p.addStat("msm_test:b533_script", 7); });
    attempt(out, "vanilla", function () { return p.stat("minecraft:jump"); });
    attempt(out, "unknown", function () { return p.stat("msm_test:no_such_stat"); });
    attempt(out, "infinite", function () { return p.addStat("msm_test:b533_script", Infinity); });
    msm.log.info("stats " + out.join(" "));
});

// e.player: a recording player.
msm.actions.define("msm_test:api17_dialog", function (e) {
    var p = e.player;
    var out = [];
    attempt(out, "open", function () { return p.openDialog("msm_test:b533_hello"); });
    attempt(out, "missing", function () { return p.openDialog("msm_test:no_such_dialog"); });
    attempt(out, "invalid", function () { return p.openDialog("Not An Id"); });
    msm.log.info("dialog " + out.join(" "));
});
