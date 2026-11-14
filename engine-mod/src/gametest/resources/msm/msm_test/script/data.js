"use strict";
// Saved script data (ADR 0062): Entity.data, Player.data and msm.storage, driven through these run_script handlers by
// MsmScriptGameTest. msm/msm_test_b/script/data.js writes the same keys from another namespace.
var msm = require("msm:runtime").msm;

msm.actions.define("msm_test:data_write", function (e) {
    e.entity.data.set("mob", { count: 1, tags: ["a", "b"], nested: { ok: true, none: null }, ratio: 0.5, text: "é<>" });
    var visits = e.player.data.get("visits");
    e.player.data.set("visits", typeof visits === "number" ? visits + 1 : 1);
    msm.storage.set("written", { by: "data_write" });
    msm.log.info("write " + JSON.stringify([e.entity.data.keys(), e.player.data.keys(), msm.storage.has("written")]));
});

msm.actions.define("msm_test:data_read", function (e) {
    var target = e.entity || e.player;
    msm.log.info("read " + JSON.stringify([target.data.get("mob"), e.player ? e.player.data.get("visits") : "none",
        msm.storage.get("written")]));
});

msm.actions.define("msm_test:data_values", function (e) {
    var d = e.entity.data;
    var out = [];
    function attempt(label, fn) {
        try {
            fn();
            out.push(label + ":ok");
        } catch (err) {
            out.push(label + ":" + err.name);
        }
    }
    var obj = { list: [1, 2, { x: "y" }], n: null, f: 1.5 };
    d.set("v", obj);
    obj.list.push("set copied");
    var got = d.get("v");
    got.list.push("get copied");
    out.push(JSON.stringify(d.get("v")));
    out.push(d.get("v") !== d.get("v"), d.get("missing") === undefined, d.has("v"), d.has("missing"));
    d.set("nul", null);
    out.push(d.get("nul") === null, d.has("nul"));
    attempt("fn", function () { d.set("bad", function () {}); });
    attempt("nan", function () { d.set("bad", NaN); });
    attempt("inf", function () { d.set("bad", [Infinity]); });
    attempt("undef", function () { d.set("bad", undefined); });
    attempt("nestedUndef", function () { d.set("bad", { a: undefined }); });
    attempt("date", function () { d.set("bad", new Date(0)); });
    attempt("host", function () { d.set("bad", e.entity); });
    attempt("cycle", function () { var c = {}; c.self = c; d.set("bad", c); });
    attempt("key64", function () { d.set(new Array(65).join("k"), 1); });
    attempt("key65", function () { d.set(new Array(66).join("k"), 1); });
    attempt("get65", function () { d.get(new Array(66).join("k")); });
    out.push(d.has("bad"));
    d.set("big", "small");
    attempt("over", function () { d.set("big", new Array(16 * 1024).join("x")); });
    out.push(d.get("big"));
    out.push(d.remove("big"), d.remove("big"));
    out.push(JSON.stringify(d.keys()));
    msm.log.info("values " + out.join(" "));
});

msm.actions.define("msm_test:data_ns", function (e) {
    e.entity.data.set("shared", "test");
    msm.storage.set("shared_ns", "test");
    msm.log.info("ns " + JSON.stringify([e.entity.data.get("shared"), msm.storage.get("shared_ns"), e.entity.data.keys()]));
});

// Data survive /reload while schedules do not: counts the calls in msm.storage and schedules a timer far ahead.
msm.actions.define("msm_test:data_reload", function (e) {
    var n = msm.storage.get("reload_count");
    msm.storage.set("reload_count", typeof n === "number" ? n + 1 : 1);
    msm.schedule(1000000, function () {});
    msm.log.info("reload count " + msm.storage.get("reload_count"));
});

msm.actions.define("msm_test:data_storage_limit", function (e) {
    msm.storage.set("huge", "small");
    var result;
    try {
        msm.storage.set("huge", new Array(1024 * 1024).join("x"));
        result = "ok";
    } catch (err) {
        result = err.name + ": " + err.message;
    }
    msm.log.info("storage limit " + result + " | " + msm.storage.get("huge"));
});
