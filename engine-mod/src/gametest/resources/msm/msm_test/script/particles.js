"use strict";
// Script API 1.3 (ADR 0080 D5): World.spawnParticle with ids, project ids, options objects, motion and force, through
// run_script handlers that MsmParticleSpawnGameTest calls directly with e.pos at the block under test.
var msm = require("msm:runtime").msm;

function attempt(out, label, fn) {
    try {
        fn();
        out.push(label + ":ok");
    } catch (err) {
        out.push(label + ":" + err.name);
    }
}

msm.actions.define("msm_test:particles_id", function (e) {
    e.world.spawnParticle("minecraft:flame", e.pos, { count: 3, spread: 0.2, speed: 0.05 });
});

msm.actions.define("msm_test:particles_project", function (e) {
    e.world.spawnParticle("msm_test:spark", e.pos);
});

msm.actions.define("msm_test:particles_object", function (e) {
    e.world.spawnParticle({ type: "minecraft:dust", color: [0, 0, 1], scale: 2 }, e.pos, { count: 4 });
});

msm.actions.define("msm_test:particles_motion", function (e) {
    e.world.spawnParticle("msm_test:spark", e.pos, { count: 3, motion: [0, 0.5, 0], force: true });
});

msm.actions.define("msm_test:particles_errors", function (e) {
    var out = [];
    attempt(out, "unknown", function () { e.world.spawnParticle("msm_test:missing", e.pos); });
    attempt(out, "needsOptions", function () { e.world.spawnParticle("minecraft:dust", e.pos); });
    attempt(out, "noType", function () { e.world.spawnParticle({ color: [1, 0, 0] }, e.pos); });
    attempt(out, "badField", function () { e.world.spawnParticle({ type: "minecraft:dust", color: "red", scale: 1 }, e.pos); });
    attempt(out, "extra", function () { e.world.spawnParticle({ type: "msm_test:spark", scale: 2 }, e.pos); });
    attempt(out, "motion2", function () { e.world.spawnParticle("msm_test:spark", e.pos, { motion: [0, 1] }); });
    attempt(out, "tooMany", function () { e.world.spawnParticle("msm_test:spark", e.pos, { count: 1001, motion: [0, 0, 0] }); });
    attempt(out, "manyNoMotion", function () { e.world.spawnParticle("msm_test:spark", e.pos, { count: 1001 }); });
    msm.log.info("errors " + out.join(" "));
});
