"use strict";
// The handler the msm:on_tick run_script action of msm/msm_test/effect/scripted.json calls (ADR 0055 D5).
var msm = require("msm:runtime").msm;
msm.actions.define("msm_test:effect_probe", function (e) {
    var holder = e.other;
    var has = holder.hasEffect("msm_test:scripted");
    var level = holder.effectLevel("msm_test:scripted");
    var none = holder.effectLevel("minecraft:speed");
    var removed = holder.removeEffect("msm_test:scripted");
    var again = holder.removeEffect("msm_test:scripted");
    msm.log.info("probe " + holder.type + " same=" + (holder.uuid === e.entity.uuid) + " has=" + has + " level=" + level
        + " speed=" + none + " removed=" + removed + " again=" + again + " after=" + holder.hasEffect("msm_test:scripted"));
});
