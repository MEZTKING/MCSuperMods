package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.MsmRuntime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.level.block.state.BlockState;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.LambdaFunction;
import org.mozilla.javascript.RhinoException;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/**
 * One per server (ADR 0031 D4): loads every {@code msm/<ns>/script/**.js} on {@code SERVER_STARTING} into a
 * sandboxed Rhino scope and runs the handlers the scripts register. Spike quality (B130); B133 replaces it with
 * the full API v1 of ADR 0032. Server thread only.
 */
public final class ScriptHost {
    public static final Set<String> EVENTS = Set.of("block.interact", "block.break", "server.tick");
    /** A handler that keeps failing is logged at most once per this many ticks. */
    public static final int ERROR_LOG_INTERVAL_TICKS = 100;
    private static final int RECENT_LOGS = 256;

    private static volatile ScriptHost current;

    private final MinecraftServer server;
    private final MsmContextFactory factory;
    private ScriptableObject global;
    private final Map<String, List<Handler>> handlers = new HashMap<>();
    private final List<Scheduled> scheduled = new ArrayList<>();
    private final List<String> loadErrors = new ArrayList<>();
    private final List<String> handlerErrors = new ArrayList<>();
    private final Deque<String> recentLogs = new ArrayDeque<>();
    private int scriptCount;
    private int depth;
    /** Handlers registered by the script being loaded; committed only when it loads without an error. */
    private List<Handler> pending;

    private static final class Handler {
        final ScriptSource script;
        final String event;
        final Function fn;
        final Scriptable scope;
        long lastLoggedTick = Long.MIN_VALUE;

        Handler(ScriptSource script, String event, Function fn, Scriptable scope) {
            this.script = script;
            this.event = event;
            this.fn = fn;
            this.scope = scope;
        }
    }

    private record Scheduled(ScriptSource script, long due, long scheduledAt, Function fn, Scriptable scope) {}

    ScriptHost(MinecraftServer server, MsmContextFactory factory) {
        this.server = server;
        this.factory = factory;
    }

    // ---- lifecycle -------------------------------------------------------------------------------------

    /** {@code SERVER_STARTING}: scan, load, log {@code [msm_runtime] loaded S script(s); E error(s)}. */
    public static void start(MinecraftServer server) {
        ScriptScanner.Result scanned = ScriptScanner.scanAllMods();
        ScriptHost host = new ScriptHost(server, new MsmContextFactory(MsmContextFactory.DEFAULT_BUDGET_MS));
        host.loadErrors.addAll(scanned.errors());
        host.load(scanned.scripts());
        current = host;
        MsmRuntime.LOGGER.info(host.summary());
    }

    /** {@code SERVER_STOPPED}: the host and its scopes are discarded. */
    public static void stop() {
        current = null;
    }

    /** The running server's host, or null before {@code SERVER_STARTING} and after {@code SERVER_STOPPED}. */
    public static ScriptHost current() {
        return current;
    }

    MinecraftServer server() {
        return server;
    }

    void load(List<ScriptSource> scripts) {
        try (Context cx = factory.enterContext()) {
            global = cx.initSafeStandardObjects();
            for (ScriptSource script : scripts) {
                scriptCount++;
                loadOne(cx, script);
            }
        }
    }

    private void loadOne(Context cx, ScriptSource script) {
        Scriptable scope = newScriptScope(cx, script);
        pending = new ArrayList<>();
        boolean top = enter();
        try {
            cx.evaluateString(scope, script.source(), script.file(), 1, null);
            cx.processMicrotasks();
            for (Handler h : pending) {
                handlers.computeIfAbsent(h.event, k -> new ArrayList<>()).add(h);
            }
        } catch (ScriptTimeout | RhinoException e) {
            String line = "script " + script.id() + ": " + describe(e, script);
            loadErrors.add(line);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, line);
        } catch (RuntimeException e) {
            String line = "script " + script.id() + ": " + describe(e, script);
            loadErrors.add(line);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, line, e);
        } finally {
            pending = null;
            exit(top);
        }
    }

    /** A per-script scope over the shared safe global: {@code msm}, {@code require}, {@code module}, {@code exports}. */
    private Scriptable newScriptScope(Context cx, ScriptSource script) {
        Scriptable scope = cx.newObject(global);
        scope.setPrototype(global);
        scope.setParentScope(null);
        Scriptable msm = api(cx, scope, script);
        Scriptable module = cx.newObject(scope);
        Scriptable exports = cx.newObject(scope);
        ScriptableObject.putProperty(module, "exports", exports);
        ScriptableObject.putProperty(module, "id", script.id().toString());
        Scriptable runtimeModule = cx.newObject(scope);
        ScriptableObject.putProperty(runtimeModule, "msm", msm);
        ScriptableObject.putProperty(scope, "msm", msm);
        ScriptableObject.putProperty(scope, "module", module);
        ScriptableObject.putProperty(scope, "exports", exports);
        ScriptableObject.putProperty(scope, "require", new LambdaFunction(scope, "require", 1, (c, s, t, args) -> {
            String id = args.length > 0 ? Context.toString(args[0]) : "";
            if ("msm:runtime".equals(id)) {
                return runtimeModule;
            }
            throw ScriptRuntime.typeError("cannot find module '" + id + "'");
        }));
        return scope;
    }

    private Scriptable api(Context cx, Scriptable scope, ScriptSource script) {
        Scriptable msm = cx.newObject(scope);
        Scriptable log = cx.newObject(scope);
        ScriptableObject.putProperty(log, "info", logFunction(scope, script, "info"));
        ScriptableObject.putProperty(log, "warn", logFunction(scope, script, "warn"));
        ScriptableObject.putProperty(log, "error", logFunction(scope, script, "error"));
        ScriptableObject.putProperty(msm, "log", log);
        Scriptable events = cx.newObject(scope);
        ScriptableObject.putProperty(events, "on", new LambdaFunction(scope, "on", 2, (c, s, t, args) -> {
            String name = args.length > 0 ? Context.toString(args[0]) : "";
            if (!EVENTS.contains(name)) {
                throw ScriptRuntime.typeError("unknown event '" + name + "'");
            }
            if (args.length < 2 || !(args[1] instanceof Function fn)) {
                throw ScriptRuntime.typeError("msm.events.on('" + name + "', handler) needs a function");
            }
            Handler h = new Handler(script, name, fn, scope);
            if (pending != null) {
                pending.add(h);
            } else {
                handlers.computeIfAbsent(name, k -> new ArrayList<>()).add(h);
            }
            return Context.getUndefinedValue();
        }));
        ScriptableObject.putProperty(msm, "events", events);
        ScriptableObject.putProperty(msm, "schedule", new LambdaFunction(scope, "schedule", 2, (c, s, t, args) -> {
            if (args.length < 2 || !(args[1] instanceof Function fn)) {
                throw ScriptRuntime.typeError("msm.schedule(ticks, fn) needs a function");
            }
            int ticks = Math.max(1, Pos.intArg(args, 0));
            long now = server.getTickCount();
            scheduled.add(new Scheduled(script, now + ticks, now, fn, scope));
            return Context.getUndefinedValue();
        }));
        return msm;
    }

    private LambdaFunction logFunction(Scriptable scope, ScriptSource script, String level) {
        return new LambdaFunction(scope, level, 1, (c, s, t, args) -> {
            StringBuilder message = new StringBuilder();
            for (int i = 0; i < args.length; i++) {
                if (i > 0) {
                    message.append(' ');
                }
                message.append(Context.toString(args[i]));
            }
            String text = message.toString();
            switch (level) {
                case "warn" -> MsmRuntime.LOGGER.warn("[{}] script {}: {}", MsmRuntime.MOD_ID, script.id(), text);
                case "error" -> MsmRuntime.LOGGER.error("[{}] script {}: {}", MsmRuntime.MOD_ID, script.id(), text);
                default -> MsmRuntime.LOGGER.info("[{}] script {}: {}", MsmRuntime.MOD_ID, script.id(), text);
            }
            remember(script.id() + ": " + text);
            return Context.getUndefinedValue();
        });
    }

    // ---- events ----------------------------------------------------------------------------------------

    /**
     * Runs the handlers of a block event; true when one of them called {@code cancel()}.
     * {@code event} is {@code block.interact} or {@code block.break}.
     */
    public boolean fireBlockEvent(String event, ServerLevel level, BlockPos pos, BlockState state, ServerPlayer player,
            InteractionHand hand) {
        List<Handler> list = handlers.get(event);
        if (list == null || list.isEmpty()) {
            return false;
        }
        boolean[] cancelled = {false};
        try (Context cx = factory.enterContext()) {
            Scriptable ev = cx.newObject(global);
            Scriptable block = cx.newObject(global);
            ScriptableObject.putProperty(block, "id", BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString());
            ScriptableObject.putProperty(block, "pos", Pos.of(cx, global, pos));
            ScriptableObject.putProperty(ev, "block", block);
            ScriptableObject.putProperty(ev, "player", ScriptPlayer.of(cx, global, player));
            ScriptableObject.putProperty(ev, "world", ScriptWorld.of(cx, global, level));
            if (hand != null) {
                ScriptableObject.putProperty(ev, "hand", hand == InteractionHand.MAIN_HAND ? "main_hand" : "off_hand");
            }
            ScriptableObject.putProperty(ev, "cancel", new LambdaFunction(global, "cancel", 0, (c, s, t, args) -> {
                cancelled[0] = true;
                return Context.getUndefinedValue();
            }));
            for (Handler h : List.copyOf(list)) {
                call(cx, h, ev);
            }
        }
        return cancelled[0];
    }

    /** {@code END_SERVER_TICK}: due {@code msm.schedule} callbacks, then the {@code server.tick} handlers. */
    public void tick() {
        long now = server.getTickCount();
        List<Handler> tickHandlers = handlers.getOrDefault("server.tick", List.of());
        if (scheduled.isEmpty() && tickHandlers.isEmpty()) {
            return;
        }
        try (Context cx = factory.enterContext()) {
            List<Scheduled> due = new ArrayList<>();
            for (Iterator<Scheduled> it = scheduled.iterator(); it.hasNext(); ) {
                Scheduled s = it.next();
                if (s.due() <= now) {
                    due.add(s);
                    it.remove();
                }
            }
            for (Scheduled s : due) {
                remember("[schedule] " + s.script().id() + " ran after " + (now - s.scheduledAt()) + " tick(s)");
                callScheduled(cx, s);
            }
            if (!tickHandlers.isEmpty()) {
                Scriptable ev = cx.newObject(global);
                ScriptableObject.putProperty(ev, "tick", now);
                for (Handler h : List.copyOf(tickHandlers)) {
                    call(cx, h, ev);
                }
            }
            cx.processMicrotasks();
        }
    }

    private void call(Context cx, Handler h, Scriptable ev) {
        boolean top = enter();
        try {
            h.fn.call(cx, h.scope, h.scope, new Object[] {ev});
            cx.processMicrotasks();
        } catch (ScriptTimeout | RhinoException | RuntimeException e) {
            handlerFailed(h, e);
        } finally {
            exit(top);
        }
    }

    private void callScheduled(Context cx, Scheduled s) {
        boolean top = enter();
        try {
            s.fn().call(cx, s.scope(), s.scope(), new Object[0]);
            cx.processMicrotasks();
        } catch (ScriptTimeout | RhinoException | RuntimeException e) {
            String line = "script " + s.script().id() + ": scheduled function: " + describe(e, s.script());
            handlerErrors.add(line);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, line);
        } finally {
            exit(top);
        }
    }

    private void handlerFailed(Handler h, Throwable e) {
        long now = server.getTickCount();
        if (h.lastLoggedTick != Long.MIN_VALUE && now - h.lastLoggedTick < ERROR_LOG_INTERVAL_TICKS) {
            return;
        }
        h.lastLoggedTick = now;
        String line = "script " + h.script.id() + ": " + h.event + " handler: " + describe(e, h.script);
        handlerErrors.add(line);
        MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, line);
    }

    /** Starts the wall-clock budget for a top-level call; nested calls (host to script) share the outer budget. */
    private boolean enter() {
        boolean top = depth++ == 0;
        if (top) {
            factory.startCall();
        }
        return top;
    }

    private void exit(boolean top) {
        depth--;
        if (top) {
            factory.endCall();
        }
    }

    static String describe(Throwable e, ScriptSource script) {
        if (e instanceof RhinoException re) {
            String file = re.sourceName() != null ? re.sourceName() : script.file();
            return re.details() + " (" + file + "#" + re.lineNumber() + ")";
        }
        if (e instanceof ScriptTimeout) {
            return e.getMessage() + " (" + script.file() + ")";
        }
        return e.getClass().getSimpleName() + ": " + e.getMessage() + " (" + script.file() + ")";
    }

    private void remember(String line) {
        if (recentLogs.size() == RECENT_LOGS) {
            recentLogs.removeFirst();
        }
        recentLogs.addLast(line);
    }

    // ---- diagnostics (GameTests) -----------------------------------------------------------------------

    public String summary() {
        return "[" + MsmRuntime.MOD_ID + "] loaded " + scriptCount + " script(s); " + loadErrors.size() + " error(s)";
    }

    public int scriptCount() {
        return scriptCount;
    }

    public List<String> loadErrors() {
        return List.copyOf(loadErrors);
    }

    /** Logged handler and scheduled-function errors (rate-limited lines only). */
    public List<String> handlerErrors() {
        return List.copyOf(handlerErrors);
    }

    /** The last {@value #RECENT_LOGS} {@code msm.log} lines ({@code <id>: <text>}) and schedule notes. */
    public List<String> recentLogs() {
        return List.copyOf(recentLogs);
    }

    public long budgetMs() {
        return factory.budgetMs();
    }

    /**
     * Per-call cost of a trivial {@code server.tick}-style handler through the same path as {@link #tick()}:
     * a fresh event object, the budget bookkeeping, the call and the microtask run, inside one entered context.
     * Returns the mean in nanoseconds over {@code calls} after {@code warmup} unmeasured calls.
     */
    public double benchmarkTrivialHandler(int warmup, int calls) {
        ScriptSource bench = new ScriptSource(MsmRuntime.MOD_ID, net.minecraft.resources.Identifier.fromNamespaceAndPath(
                MsmRuntime.MOD_ID, "benchmark"), "benchmark.js", "");
        try (Context cx = factory.enterContext()) {
            Scriptable scope = cx.newObject(global);
            scope.setPrototype(global);
            scope.setParentScope(null);
            Function fn = (Function) cx.evaluateString(scope,
                    "var n = 0; (function (e) { n = n + e.tick; })", bench.file(), 1, null);
            Handler h = new Handler(bench, "server.tick", fn, scope);
            for (int i = 0; i < warmup; i++) {
                call(cx, h, tickEvent(cx, i));
            }
            long start = System.nanoTime();
            for (int i = 0; i < calls; i++) {
                call(cx, h, tickEvent(cx, i));
            }
            return (System.nanoTime() - start) / (double) calls;
        }
    }

    /** The same as {@link #benchmarkTrivialHandler} but entering a Rhino context per call (the event bridges' path). */
    public double benchmarkTrivialHandlerWithContextPerCall(int warmup, int calls) {
        Function fn;
        Scriptable scope;
        ScriptSource bench = new ScriptSource(MsmRuntime.MOD_ID, net.minecraft.resources.Identifier.fromNamespaceAndPath(
                MsmRuntime.MOD_ID, "benchmark"), "benchmark.js", "");
        try (Context cx = factory.enterContext()) {
            scope = cx.newObject(global);
            scope.setPrototype(global);
            scope.setParentScope(null);
            fn = (Function) cx.evaluateString(scope, "var n = 0; (function (e) { n = n + e.tick; })", bench.file(), 1, null);
        }
        Handler h = new Handler(bench, "server.tick", fn, scope);
        for (int i = 0; i < warmup; i++) {
            try (Context cx = factory.enterContext()) {
                call(cx, h, tickEvent(cx, i));
            }
        }
        long start = System.nanoTime();
        for (int i = 0; i < calls; i++) {
            try (Context cx = factory.enterContext()) {
                call(cx, h, tickEvent(cx, i));
            }
        }
        return (System.nanoTime() - start) / (double) calls;
    }

    private Scriptable tickEvent(Context cx, long tick) {
        Scriptable ev = cx.newObject(global);
        ScriptableObject.putProperty(ev, "tick", tick);
        return ev;
    }
}
