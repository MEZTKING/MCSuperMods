"use strict";
// ADR 0057: World.playSound resolves a project sound key (assets/msm_test/sounds.json); MsmSoundGameTest fires it.
var msm = require("msm:runtime").msm;
msm.actions.define("msm_test:project_sound", function (e) {
    e.world.playSound("msm_test:chime", e.pos, { volume: 0.5, pitch: 1.5 });
    msm.log.info("project sound played at " + e.pos);
});
