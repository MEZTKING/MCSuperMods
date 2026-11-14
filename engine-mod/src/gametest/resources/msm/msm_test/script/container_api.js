"use strict";
// Script API 1.2 (ADR 0076 D5) through run_script handlers that MsmContainerScriptGameTest calls directly with e.pos
// at the block under test: World.getContainer and Container get, set, count and add.
var msm = require("msm:runtime").msm;

function attempt(out, label, fn) {
    try {
        fn();
        out.push(label + ":ok");
    } catch (err) {
        out.push(label + ":" + err.name);
    }
}

function show(item) {
    return item === undefined ? "-" : item.id + "x" + item.count;
}

// e.pos: an empty vanilla chest.
msm.actions.define("msm_test:container_chest", function (e) {
    var c = e.world.getContainer(e.pos);
    var out = [c.size];
    out.push(c.set(0, "minecraft:diamond"), c.set(1, { id: "minecraft:cobblestone", count: 99 }));
    out.push(show(c.get(0)), show(c.get(1)), show(c.get(2)));
    out.push(c.count("minecraft:cobblestone"), c.count("minecraft:stick"));
    // 10 more cobblestone: 0 fit in slot 1 (full at 64), then slot 2 takes them.
    out.push(show(c.add({ id: "minecraft:cobblestone", count: 10 })), show(c.get(2)));
    // 100 sticks over two empty slots in order (3, 4).
    out.push(show(c.add({ id: "minecraft:stick", count: 100 })), show(c.get(3)), show(c.get(4)));
    out.push(c.set(1), show(c.get(1)), c.count("minecraft:cobblestone"));
    var copy = c.get(0);
    c.set(0, "minecraft:emerald");
    out.push(copy.id, show(c.get(0)));
    attempt(out, "27", function () { c.get(27); });
    attempt(out, "neg", function () { c.set(-1, "minecraft:stone"); });
    attempt(out, "frac", function () { c.get(0.5); });
    attempt(out, "name", function () { c.get("head"); });
    attempt(out, "unknownItem", function () { c.add("minecraft:no_such_item"); });
    attempt(out, "badSpec", function () { c.add({ count: 3 }); });
    msm.log.info("chest " + out.join(" "));
});

// e.pos: an empty vanilla chest; fills it with stone, then adds more.
msm.actions.define("msm_test:container_full", function (e) {
    var c = e.world.getContainer(e.pos);
    for (var i = 0; i < c.size; i++) {
        c.set(i, { id: "minecraft:stone", count: i === 5 ? 60 : 64 });
    }
    var out = [];
    out.push(show(c.add({ id: "minecraft:stone", count: 10 })), show(c.get(5)));
    out.push(show(c.add("minecraft:dirt")), c.count("minecraft:stone"), c.count("minecraft:dirt"));
    msm.log.info("full " + out.join(" "));
});

// e.pos: an empty msm_test:container_crate (keep_contents, 27 slots).
msm.actions.define("msm_test:container_crate", function (e) {
    var c = e.world.getContainer(e.pos);
    var out = [c.size];
    out.push(show(c.add({ id: "minecraft:iron_ingot", count: 70 })), show(c.get(0)), show(c.get(1)));
    out.push(show(c.add("minecraft:shulker_box")));
    out.push(c.set(5, "minecraft:shulker_box"), show(c.get(5)));
    out.push(show(c.add("msm_test:container_crate")));
    out.push(c.set(5, "minecraft:gold_ingot"), show(c.get(5)), c.count("minecraft:iron_ingot"));
    msm.log.info("crate " + out.join(" "));
});

// e.pos: an empty msm_test:container_sealed (hoppers: false): a script still adds.
msm.actions.define("msm_test:container_sealed", function (e) {
    var c = e.world.getContainer(e.pos);
    msm.log.info("sealed " + [c.size, show(c.add({ id: "minecraft:coal", count: 5 })), show(c.get(0))].join(" "));
});

// e.pos: stone, then air.
msm.actions.define("msm_test:container_none", function (e) {
    msm.log.info("none " + [e.world.getContainer(e.pos) === undefined, e.world.getContainer(e.pos.offset(0, 1, 0)) === undefined].join(" "));
});

// A container kept across calls: taken from a chest, used after the test removes the chest.
var kept;
msm.actions.define("msm_test:container_keep", function (e) {
    kept = e.world.getContainer(e.pos);
    kept.set(0, "minecraft:apple");
    msm.log.info("keep " + show(kept.get(0)));
});

msm.actions.define("msm_test:container_stale", function (e) {
    var out = [kept.size];
    attempt(out, "get", function () { kept.get(0); });
    attempt(out, "add", function () { kept.add("minecraft:apple"); });
    msm.log.info("stale " + out.join(" "));
});

// e.pos: an empty msm_test:machine_smelter (fuel machine: 0 input, 1 fuel, 2 result), with 2 iron nuggets already in the
// result slot. Slot 2 refuses everything, slot 1 takes fuel only, slot 0 takes anything.
msm.actions.define("msm_test:container_machine", function (e) {
    var c = e.world.getContainer(e.pos);
    var out = [c.size, show(c.get(2))];
    out.push(c.set(0, "minecraft:diamond"), show(c.get(0)));
    out.push(c.set(2, "minecraft:iron_ingot"), show(c.get(2)));
    out.push(c.set(1, "minecraft:dirt"), show(c.get(1)));
    // Nothing takes iron: the input holds a diamond, fuel and result refuse it, so all 5 come back.
    out.push(show(c.add({ id: "minecraft:iron_ingot", count: 5 })));
    out.push(c.set(1, "minecraft:coal"), show(c.get(1)));
    // Coal merges into the fuel slot (the input holds a different item, the result refuses).
    out.push(show(c.add({ id: "minecraft:coal", count: 2 })), show(c.get(1)));
    // Dirt is no fuel and the input is taken, so all 3 come back; once the input is empty the input takes it.
    out.push(show(c.add({ id: "minecraft:dirt", count: 3 })));
    out.push(c.set(0), show(c.add({ id: "minecraft:dirt", count: 3 })), show(c.get(0)), show(c.get(1)), show(c.get(2)));
    out.push(c.count("minecraft:iron_nugget"), c.count("minecraft:coal"));
    msm.log.info("machine " + out.join(" "));
});
