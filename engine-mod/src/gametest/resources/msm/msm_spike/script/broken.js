"use strict";
// Deliberate syntax error: logged once at load, contributes no handlers, the other scripts still load.
var msm = require("msm:runtime").msm;
msm.events.on("block.interact", function (e) {
    e.cancel(;
});
