// Loads after a_sandbox.js (path order): nothing that script tried to share is visible here.
var msm = require("msm:runtime").msm;
msm.log.info("isolation topLevel=" + typeof topLevel + " undeclaredGlobal=" + typeof undeclaredGlobal
    + " Array.prototype=" + typeof [].msmLeak + " globalThis=" + typeof globalThis.msmLeak + " Math=" + typeof Math.msmLeak);
