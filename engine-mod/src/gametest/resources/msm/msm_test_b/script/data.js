"use strict";
// Saved script data of a second namespace (ADR 0062 D2): the same keys as msm/msm_test/script/data.js, kept apart.
var msm = require("msm:runtime").msm;

msm.actions.define("msm_test_b:data_ns", function (e) {
    e.entity.data.set("shared", "b");
    msm.storage.set("shared_ns", "b");
    msm.log.info("ns " + JSON.stringify([e.entity.data.get("shared"), msm.storage.get("shared_ns"), e.entity.data.keys()]));
});
