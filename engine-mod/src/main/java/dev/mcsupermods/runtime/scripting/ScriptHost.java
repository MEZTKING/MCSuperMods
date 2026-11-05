package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.LambdaFunction;
import org.mozilla.javascript.RhinoException;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/**
 * One per server (ADR 0031 D4): loads every {@code msm/<ns>/script/**.js} on {@code SERVER_STARTING} (and again on
 * {@code END_DATA_PACK_RELOAD}) and runs the handlers the scripts register through the API of ADR 0032.
 *
 * <p>Isolation: all scripts share one scope of safe standard objects ({@code initSafeStandardObjects}, sealed, the
 * global object included), so no script can change {@code Array.prototype}, {@code Math} or {@code globalThis} for the
 * others; each script runs in its own top-level scope over it, holding {@code msm}, {@code require}, {@code module}
 * and {@code exports}, so top-level variables and undeclared assignments stay in that script. {@code require} resolves
 * {@code msm:runtime} and relative ids among the same mod's scripts of the same namespace ({@code ./util} next to
 * {@code msm/<ns>/script/main.js} is {@code msm/<ns>/script/util.js}); each module is evaluated once and cached.
 *
 * <p>A Rhino context is entered per dispatch; microtasks ({@code Promise} callbacks) run after every handler call,
 * before the context is left. Handler errors are logged at most once per handler per
 * {@value #ERROR_LOG_INTERVAL_TICKS} ticks. Server thread only.
 */
public final class ScriptHost {
    /** A handler that keeps failing is logged at most once per this many ticks. */
    public static final int ERROR_LOG_INTERVAL_TICKS = 100;
    private static final int RECENT_LOGS = 1024;

    private static volatile ScriptHost current;
    /** {@code run_script} handlers logged as undefined while no host runs (once per handler id). */
    private static final Set<Identifier> UNDEFINED_WITHOUT_HOST = ConcurrentHashMap.newKeySet();

    private final MinecraftServer server;
    private final MsmContextFactory factory;
    private final String version;

    // Per load (cleared on reload).
    private ScriptApi api;
    private final Map<Identifier, Module> modules = new LinkedHashMap<>();
    private final Map<String, List<Handler>> handlers = new HashMap<>();
    private final Map<Identifier, Handler> actions = new HashMap<>();
    private final List<Scheduled> scheduled = new ArrayList<>();
    private final List<String> loadErrors = new ArrayList<>();
    private final Set<Identifier> undefinedLogged = new HashSet<>();
    private int scriptCount;
    private long scheduleSeq;

    // Across reloads (diagnostics and per-player interaction state).
    private final List<String> handlerErrors = new ArrayList<>();
    private final Deque<String> recentLogs = new ArrayDeque<>();
    private final Map<UUID, Long> cancelledMainHand = new HashMap<>();
    private int loads;
    private int depth;
    private boolean reloadPending;

    /** One script file as a CommonJS module. */
    public static final class Module {
        final ScriptSource source;
        State state = State.NEW;
        Scriptable scope;
        Scriptable moduleObject;
        final List<Handler> pendingHandlers = new ArrayList<>();
        final Map<Identifier, Handler> pendingActions = new LinkedHashMap<>();

        Module(ScriptSource source) {
            this.source = source;
        }

        Identifier id() {
            return source.id();
        }
    }

    enum State { NEW, LOADING, LOADED, FAILED }

    /** A script function the host calls: an event handler or a {@code run_script} action handler. */
    static final class Handler {
        final Module module;
        final String label;
        final Function fn;
        long lastLoggedTick = Long.MIN_VALUE;

        Handler(Module module, String label, Function fn) {
            this.module = module;
            this.label = label;
            this.fn = fn;
        }
    }

    private record Scheduled(Module module, long due, long seq, Function fn) {}

    private ScriptHost(MinecraftServer server, MsmContextFactory factory) {
        this.server = server;
        this.factory = factory;
        this.version = FabricLoader.getInstance().getModContainer(MsmRuntime.MOD_ID)
                .map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("unknown");
    }

    // ---- lifecycle -------------------------------------------------------------------------------------

    /** {@code SERVER_STARTING}: scan, load, log {@code [msm_runtime] loaded S script(s); E error(s)}. */
    public static void start(MinecraftServer server) {
        ScriptHost host = new ScriptHost(server, new MsmContextFactory(MsmContextFactory.DEFAULT_BUDGET_MS));
        host.load(ScriptScanner.scanAllMods());
        current = host;
    }

    /** {@code SERVER_STOPPED}: the host and its scopes are discarded. */
    public static void stop() {
        current = null;
    }

    /** The running server's host, or null before {@code SERVER_STARTING} and after {@code SERVER_STOPPED}. */
    public static ScriptHost current() {
        return current;
    }

    /**
     * A host that loads the scripts but is not the server's (its handlers never fire); GameTests use it to check
     * {@link #reload()} without disturbing the running host.
     */
    public static ScriptHost detached(MinecraftServer server) {
        ScriptHost host = new ScriptHost(server, new MsmContextFactory(MsmContextFactory.DEFAULT_BUDGET_MS));
        host.load(ScriptScanner.scanAllMods());
        return host;
    }

    /** {@code END_DATA_PACK_RELOAD}: a fresh scope; handlers, action handlers, schedules and module cache cleared. */
    public void reload() {
        if (depth > 0) {
            // Requested from inside a script call: reloading now would clear the handlers that are running.
            reloadPending = true;
            return;
        }
        load(ScriptScanner.scanAllMods());
    }

    MinecraftServer server() {
        return server;
    }

    private void load(ScriptScanner.Result scanned) {
        modules.clear();
        handlers.clear();
        actions.clear();
        scheduled.clear();
        loadErrors.clear();
        undefinedLogged.clear();
        loadErrors.addAll(scanned.errors());
        scriptCount = scanned.scripts().size();
        loads++;
        for (ScriptSource s : scanned.scripts()) {
            if (modules.putIfAbsent(s.id(), new Module(s)) != null) {
                error(loadErrors, "script " + s.id() + ": " + s.file() + " (mod " + s.modId() + ") has the id of another script; ignored");
            }
        }
        try (Context cx = factory.enterContext()) {
            ScriptableObject global = cx.initSafeStandardObjects(null, true);
            global.sealObject();
            api = new ScriptApi(this, global);
            for (Module m : List.copyOf(modules.values())) {
                if (m.state == State.NEW) {
                    loadModule(cx, m);
                }
            }
        }
        MsmRuntime.LOGGER.info(summary());
    }

    /** Evaluates a module once; true when it loaded. Its handlers are committed only when it loads without an error. */
    private boolean loadModule(Context cx, Module m) {
        m.state = State.LOADING;
        m.scope = moduleScope(cx, m);
        boolean top = enter();
        try {
            cx.evaluateString(m.scope, m.source.source(), m.source.file(), 1, null);
            cx.processMicrotasks();
            m.state = State.LOADED;
            // An event handler's label is its event name.
            m.pendingHandlers.forEach(h -> handlers.computeIfAbsent(h.label, k -> new ArrayList<>()).add(h));
            actions.putAll(m.pendingActions);
            return true;
        } catch (ScriptTimeout | RuntimeException e) {
            m.state = State.FAILED;
            scheduled.removeIf(s -> s.module() == m);
            error(loadErrors, "script " + m.id() + ": " + describe(e, m.source), e);
            return false;
        } finally {
            m.pendingHandlers.clear();
            m.pendingActions.clear();
            exit(top);
        }
    }

    /** The top-level scope of a module: {@code msm}, {@code require}, {@code module}, {@code exports}. */
    private Scriptable moduleScope(Context cx, Module m) {
        ScriptableObject global = api.scope();
        ScriptableObject scope = (ScriptableObject) cx.newObject(global);
        scope.setPrototype(global);
        scope.setParentScope(null);
        Scriptable msm = api.msm(m);
        Scriptable runtime = cx.newObject(scope);
        ScriptableObject.putProperty(runtime, "msm", msm);
        Scriptable module = cx.newObject(scope);
        Scriptable exports = cx.newObject(scope);
        ScriptableObject.putProperty(module, "exports", exports);
        ScriptableObject.putProperty(module, "id", m.id().toString());
        m.moduleObject = module;
        ScriptableObject.putProperty(scope, "msm", msm);
        ScriptableObject.putProperty(scope, "module", module);
        ScriptableObject.putProperty(scope, "exports", exports);
        ScriptableObject.putProperty(scope, "require", new LambdaFunction(scope, "require", 1,
                (c, s, t, args) -> require(c, m, args.length > 0 ? Context.toString(args[0]) : "", runtime)));
        return scope;
    }

    private Object require(Context cx, Module from, String id, Scriptable runtime) {
        if ("msm:runtime".equals(id)) {
            return runtime;
        }
        if (!id.startsWith("./") && !id.startsWith("../")) {
            throw ScriptRuntime.typeError("cannot find module '" + id + "': only 'msm:runtime' and relative ids are allowed");
        }
        Identifier target = resolve(from.id(), id);
        Module m = target == null ? null : modules.get(target);
        if (m == null || !m.source.modId().equals(from.source.modId())) {
            throw ScriptRuntime.typeError("cannot find module '" + id + "' from " + from.id());
        }
        switch (m.state) {
            case NEW -> {
                if (!loadModule(cx, m)) {
                    throw ScriptRuntime.constructError("Error", "module '" + id + "' (" + m.id() + ") failed to load");
                }
            }
            case FAILED -> throw ScriptRuntime.constructError("Error", "module '" + id + "' (" + m.id() + ") failed to load");
            case LOADING, LOADED -> {
                // LOADING: a require cycle; the partly filled exports are returned, as in Node.js.
            }
        }
        return ScriptableObject.getProperty(m.moduleObject, "exports");
    }

    /** {@code ./util} or {@code ../lib/x} (with or without {@code .js}) relative to {@code from}; null outside the script folder. */
    static Identifier resolve(Identifier from, String relative) {
        List<String> parts = new ArrayList<>(List.of(from.getPath().split("/")));
        parts.removeLast();
        String rel = relative.endsWith(".js") ? relative.substring(0, relative.length() - 3) : relative;
        for (String part : rel.split("/")) {
            switch (part) {
                case "", "." -> {}
                case ".." -> {
                    if (parts.isEmpty()) {
                        return null;
                    }
                    parts.removeLast();
                }
                default -> parts.add(part);
            }
        }
        if (parts.isEmpty()) {
            return null;
        }
        return Identifier.tryBuild(from.getNamespace(), String.join("/", parts));
    }

    // ---- API callbacks (ScriptApi) -------------------------------------------------------------------------

    String version() {
        return version;
    }

    Object log(Module m, String level, Object[] args) {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < args.length; i++) {
            if (i > 0) {
                text.append(' ');
            }
            text.append(Context.toString(args[i]));
        }
        switch (level) {
            case "warn" -> MsmRuntime.LOGGER.warn("[{}] {}: {}", MsmRuntime.MOD_ID, m.id(), text);
            case "error" -> MsmRuntime.LOGGER.error("[{}] {}: {}", MsmRuntime.MOD_ID, m.id(), text);
            default -> MsmRuntime.LOGGER.info("[{}] {}: {}", MsmRuntime.MOD_ID, m.id(), text);
        }
        remember(m.id() + ": " + text);
        return null;
    }

    Object on(Module m, String name, Function fn) {
        if (!ScriptEvents.EVENTS.containsKey(name)) {
            // ADR 0032 D2: an unknown name is a load-time error for that call; the rest of the script loads.
            String line = "script " + m.id() + ": unknown event '" + name + "' (" + m.source.file() + ")";
            error(m.state == State.LOADING ? loadErrors : handlerErrors, line);
            return null;
        }
        Handler h = new Handler(m, name, fn);
        if (m.state == State.LOADING) {
            m.pendingHandlers.add(h);
        } else {
            handlers.computeIfAbsent(name, k -> new ArrayList<>()).add(h);
        }
        return null;
    }

    Object define(Module m, String idText, Function fn) {
        Identifier id = ScriptValues.id(idText, "handler id");
        Handler h = new Handler(m, "action " + id, fn);
        if (m.state == State.LOADING) {
            m.pendingActions.put(id, h);
        } else {
            actions.put(id, h);
        }
        return null;
    }

    Object schedule(Module m, double ticks, Function fn) {
        long delay = Math.max(1, (long) Math.floor(ticks));
        scheduled.add(new Scheduled(m, server.getTickCount() + delay, scheduleSeq++, fn));
        return null;
    }

    // ---- events ----------------------------------------------------------------------------------------

    /** Runs the handlers of a game event; true when one of them called {@code cancel()}. */
    public boolean fire(String event, ScriptEvents.Data data) {
        List<Handler> list = handlers.get(event);
        if (list == null || list.isEmpty()) {
            return false;
        }
        ScriptType type = ScriptEvents.EVENTS.get(event).type();
        try (Context cx = factory.enterContext()) {
            Scriptable ev = api.event(type, data);
            for (Handler h : List.copyOf(list)) {
                call(cx, h, ev);
            }
        }
        return data.cancelled;
    }

    /** Whether {@code event} has handlers (bridges skip building event data otherwise). */
    public boolean handles(String event) {
        List<Handler> list = handlers.get(event);
        return list != null && !list.isEmpty();
    }

    /**
     * A {@code run_script} action (ADR 0032 D4): calls the handler {@code msm.actions.define} defined for
     * {@code handler}; an undefined handler (or no running host) is logged once per handler id.
     */
    public static void runAction(Identifier owner, Identifier event, Identifier handler, EventContext ctx) {
        ScriptHost host = current;
        if (host == null || host.server != ctx.level().getServer()) {
            if (UNDEFINED_WITHOUT_HOST.add(handler)) {
                MsmRuntime.LOGGER.error("[{}] {}: run_script handler {} is not defined (no scripts loaded)", MsmRuntime.MOD_ID, owner, handler);
            }
            return;
        }
        host.action(owner, event, handler, ctx);
    }

    private void action(Identifier owner, Identifier event, Identifier handler, EventContext ctx) {
        Handler h = actions.get(handler);
        if (h == null) {
            if (undefinedLogged.add(handler)) {
                error(handlerErrors, owner + ": run_script handler " + handler + " is not defined");
            }
            return;
        }
        BlockPos at = ctx.block();
        ScriptEvents.Action data = new ScriptEvents.Action(ctx.level(), owner, event,
                at != null ? ScriptPos.of(at) : ScriptPos.of(ctx.origin()),
                at != null ? new BlockRef(ctx.level().getBlockState(at), at) : null,
                ctx.entity(), ctx.player() instanceof ServerPlayer sp ? sp : null);
        try (Context cx = factory.enterContext()) {
            call(cx, h, api.event(ScriptEvents.ACTION, data));
        }
    }

    /** {@code END_SERVER_TICK}: due {@code msm.schedule} callbacks, then the {@code server.tick} handlers. */
    public void tick() {
        long now = server.getTickCount();
        cancelledMainHand.values().removeIf(t -> t < now);
        if (reloadPending) {
            reloadPending = false;
            reload();
        }
        boolean ticking = handles(ScriptEvents.SERVER_TICK_EVENT);
        if (scheduled.isEmpty() && !ticking) {
            return;
        }
        try (Context cx = factory.enterContext()) {
            List<Scheduled> due = new ArrayList<>();
            scheduled.removeIf(s -> {
                if (s.due() <= now) {
                    due.add(s);
                    return true;
                }
                return false;
            });
            for (Scheduled s : due) {
                callScheduled(cx, s);
            }
            if (ticking) {
                ServerLevel overworld = server.overworld();
                Scriptable ev = api.event(ScriptEvents.SERVER_TICK, new ScriptEvents.ServerTick(overworld, now));
                for (Handler h : List.copyOf(handlers.get(ScriptEvents.SERVER_TICK_EVENT))) {
                    call(cx, h, ev);
                }
            }
            cx.processMicrotasks();
        }
    }

    // ---- interactions (off-hand suppression, ADR 0031 spike findings) ------------------------------------

    /** Remembers that a script cancelled a player's main-hand interaction in this tick. */
    public void mainHandCancelled(ServerPlayer player) {
        cancelledMainHand.put(player.getUUID(), (long) server.getTickCount());
    }

    /**
     * Whether an interaction must be refused without running scripts: after a cancelled main-hand interaction, the
     * client still sends its off-hand attempts and the main-hand item use of the same click (its own prediction was
     * {@code PASS}); they are refused in that tick, so one click fires {@code block.interact} once.
     */
    public boolean suppressed(ServerPlayer player, InteractionHand hand, boolean itemUse) {
        Long tick = cancelledMainHand.get(player.getUUID());
        return tick != null && tick == server.getTickCount() && (hand == InteractionHand.OFF_HAND || itemUse);
    }

    // ---- calls and errors ------------------------------------------------------------------------------

    private void call(Context cx, Handler h, Scriptable ev) {
        boolean top = enter();
        try {
            h.fn.call(cx, h.module.scope, h.module.scope, new Object[] {ev});
            cx.processMicrotasks();
        } catch (ScriptTimeout | RuntimeException e) {
            long now = server.getTickCount();
            if (h.lastLoggedTick == Long.MIN_VALUE || now - h.lastLoggedTick >= ERROR_LOG_INTERVAL_TICKS) {
                h.lastLoggedTick = now;
                error(handlerErrors, "script " + h.module.id() + ": " + h.label + " handler: " + describe(e, h.module.source), e);
            }
        } finally {
            exit(top);
        }
    }

    private void callScheduled(Context cx, Scheduled s) {
        boolean top = enter();
        try {
            s.fn().call(cx, s.module().scope, s.module().scope, new Object[0]);
            cx.processMicrotasks();
        } catch (ScriptTimeout | RuntimeException e) {
            error(handlerErrors, "script " + s.module().id() + ": scheduled function: " + describe(e, s.module().source), e);
        } finally {
            exit(top);
        }
    }

    /** Starts the wall-clock budget for a top-level call; nested calls (script to host to script) share it. */
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

    private void error(List<String> list, String line) {
        list.add(line);
        MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, line);
    }

    /** Script errors are logged without a stack trace; unexpected Java exceptions with one. */
    private void error(List<String> list, String line, Throwable e) {
        list.add(line);
        if (e instanceof RhinoException || e instanceof ScriptTimeout) {
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, line);
        } else {
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, line, e);
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

    // ---- report and diagnostics ------------------------------------------------------------------------

    /**
     * {@code [msm_runtime] loaded S script(s); E error(s)}: S counts every script file found, E the scan errors, the
     * scripts that failed to load and unknown event names used while loading (ADR 0031 D4 and its spike findings).
     */
    public String summary() {
        return "[" + MsmRuntime.MOD_ID + "] loaded " + scriptCount + " script(s); " + loadErrors.size() + " error(s)";
    }

    /** What the last load found: script ids in load order, their states and the load errors. */
    public record Report(List<Identifier> scripts, List<Identifier> loaded, List<String> errors) {}

    public Report report() {
        List<Identifier> loaded = modules.values().stream().filter(m -> m.state == State.LOADED).map(Module::id).toList();
        return new Report(List.copyOf(modules.keySet()), loaded, List.copyOf(loadErrors));
    }

    public int scriptCount() {
        return scriptCount;
    }

    public List<String> loadErrors() {
        return List.copyOf(loadErrors);
    }

    /** Logged handler, scheduled-function and {@code run_script} errors (rate-limited lines only), across reloads. */
    public List<String> handlerErrors() {
        return List.copyOf(handlerErrors);
    }

    /** The last {@value #RECENT_LOGS} {@code msm.log} lines as {@code <script id>: <text>}, across reloads. */
    public List<String> recentLogs() {
        return List.copyOf(recentLogs);
    }

    /** Registered handlers per event name. */
    public int handlerCount(String event) {
        List<Handler> list = handlers.get(event);
        return list == null ? 0 : list.size();
    }

    public Set<Identifier> actionHandlers() {
        return Set.copyOf(actions.keySet());
    }

    public int pendingSchedules() {
        return scheduled.size();
    }

    /** How many times scripts were loaded by this host (1 after start, plus one per reload). */
    public int loads() {
        return loads;
    }

    /** The shared standard-object scope of the current load; a reload replaces it. */
    public Object scopeIdentity() {
        return api.scope();
    }

    public long budgetMs() {
        return factory.budgetMs();
    }
}
