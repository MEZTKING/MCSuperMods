"use strict";
// Relative require among the same mod's scripts (ADR 0031 D3): ./util, ./lib/deep.js (which requires ../util).
Object.defineProperty(exports, "__esModule", { value: true });
var msm_runtime_1 = require("msm:runtime");
var util_1 = require("./util");
var deep_1 = require("./lib/deep.js");
function failure(id) {
    try {
        require(id);
        return "loaded";
    }
    catch (e) {
        return e.message;
    }
}
msm_runtime_1.msm.log.info("require answer=" + util_1.answer + " doubled=" + deep_1.doubled + " same=" + (deep_1.util === util_1)
    + "; " + failure("./missing") + "; " + failure("../../escape") + "; " + failure("fs"));
