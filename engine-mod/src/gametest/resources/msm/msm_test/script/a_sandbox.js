// Sloppy mode on purpose (no "use strict"), hand-written ES5 CommonJS as TypeScript's transpileModule emits it.
// The standard objects are shared by every script and sealed: changing them fails here and leaks nothing to
// z_isolation.js, which loads later; top-level and undeclared variables stay in this script's own scope.
var msm = require("msm:runtime").msm;
var refused = [];
try {
    Array.prototype.msmLeak = 1;
} catch (e) {
    refused.push("Array.prototype");
}
try {
    globalThis.msmLeak = 1;
} catch (e) {
    refused.push("globalThis");
}
try {
    Math.msmLeak = 1;
} catch (e) {
    refused.push("Math");
}
var topLevel = "a_sandbox";
undeclaredGlobal = "a_sandbox";
msm.log.info("sandbox refused " + refused.join(", ") + "; java=" + typeof java + " Packages=" + typeof Packages
    + " JavaAdapter=" + typeof JavaAdapter);
// Named groups need Rhino's RegExpLoader service, found through ServiceLoader from the nested jar.
var match = /(?<ns>[a-z_]+):(?<path>[a-z_]+)/.exec("msm_test:kitchen_sink");
msm.log.info("regex " + match.groups.ns + "/" + match.groups.path);
Promise.resolve(7).then(function (v) {
    msm.log.info("promise " + v);
});
