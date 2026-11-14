package dev.mcsupermods.runtime.scripting;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.BossEvent;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;

/**
 * {@code msm.bossBars} and {@code BossBar} (ADR 0065 D4): vanilla {@link ServerBossEvent}s owned by the script host,
 * per script namespace, at most {@value #MAX_PER_NAMESPACE} per namespace (a further one is a {@code RangeError}).
 * They are not saved; the host removes them all (hiding them from every player) on {@code /reload} and when the
 * server stops, as it drops {@code msm.schedule} callbacks. A player who leaves is taken off every bar; a respawned
 * player (a new {@code ServerPlayer}) is put back on the bars the old one was on. Server thread only.
 */
final class ScriptBossBars {
    /** Bars per script namespace (ADR 0065 D4 default). */
    static final int MAX_PER_NAMESPACE = 32;

    /** One bar; {@code removed} once {@code remove()} or a reload dropped it (it then does nothing). */
    static final class Bar {
        final String namespace;
        final String id;
        final ServerBossEvent event;
        boolean removed;

        Bar(String namespace, String id, ServerBossEvent event) {
            this.namespace = namespace;
            this.id = id;
            this.event = event;
        }
    }

    private final Map<String, Map<String, Bar>> bars = new HashMap<>();

    static final ScriptType TYPE = ScriptType.of("BossBar")
            .method("setTitle", 1, 1, Bar.class, (api, b, args) -> {
                String title = ScriptValues.string(args, 0, "title");
                if (!b.removed) {
                    b.event.setName(Component.literal(title));
                }
                return null;
            })
            .method("setProgress", 1, 1, Bar.class, (api, b, args) -> {
                float progress = progress(ScriptValues.number(args, 0, "progress"));
                if (!b.removed) {
                    b.event.setProgress(progress);
                }
                return null;
            })
            .method("setColor", 1, 1, Bar.class, (api, b, args) -> {
                BossEvent.BossBarColor color = color(ScriptValues.string(args, 0, "color"));
                if (!b.removed) {
                    b.event.setColor(color);
                }
                return null;
            })
            .method("setStyle", 1, 1, Bar.class, (api, b, args) -> {
                BossEvent.BossBarOverlay style = style(ScriptValues.string(args, 0, "style"));
                if (!b.removed) {
                    b.event.setOverlay(style);
                }
                return null;
            })
            .method("addPlayer", 1, 1, Bar.class, (api, b, args) -> {
                ServerPlayer player = ScriptValues.player(args.length > 0 ? args[0] : null, "player");
                if (!b.removed && !b.event.getPlayers().contains(player)) {
                    b.event.addPlayer(player);
                }
                return null;
            })
            .method("removePlayer", 1, 1, Bar.class, (api, b, args) -> {
                ServerPlayer player = ScriptValues.player(args.length > 0 ? args[0] : null, "player");
                b.event.removePlayer(player);
                return null;
            })
            .method("players", 0, 0, Bar.class, (api, b, args) ->
                    api.array(b.event.getPlayers().stream().map(api::player).toArray()))
            .method("remove", 0, 0, Bar.class, (api, b, args) -> {
                api.host().bossBars().remove(b);
                return null;
            });

    /** {@code msm.bossBars}: over the script's module, so a bar belongs to the script's namespace. */
    static final ScriptType NAMESPACE = ScriptType.of("MsmBossBars")
            .method("create", 2, 2, ScriptHost.Module.class, (api, m, args) -> {
                String id = barId(args);
                Scriptable options = ScriptValues.options(args, 1, "options");
                if (options == null) {
                    throw ScriptRuntime.typeError("options are missing");
                }
                Object titleValue = ScriptValues.member(options, "title");
                if (titleValue == null) {
                    throw ScriptRuntime.typeError("options.title is missing");
                }
                String title = Context.toString(titleValue);
                BossEvent.BossBarColor color = color(ScriptValues.stringMember(options, "color", "white"));
                BossEvent.BossBarOverlay style = style(ScriptValues.stringMember(options, "style", "progress"));
                float progress = progress(ScriptValues.numberMember(options, "progress", 1));
                return api.bossBar(api.host().bossBars().create(m.id().getNamespace(), id, title, color, style, progress));
            })
            .method("get", 1, 1, ScriptHost.Module.class, (api, m, args) -> {
                Bar bar = api.host().bossBars().get(m.id().getNamespace(), barId(args));
                return bar == null ? null : api.bossBar(bar);
            });

    private static String barId(Object[] args) {
        String id = ScriptValues.string(args, 0, "id");
        if (id.isEmpty() || !Identifier.isValidPath(id)) {
            throw ScriptRuntime.typeError("boss bar id '" + id + "' is not a valid name (a-z, 0-9, _ - . /)");
        }
        return id;
    }

    private static float progress(double value) {
        return (float) Math.clamp(value, 0.0, 1.0);
    }

    static BossEvent.BossBarColor color(String name) {
        for (BossEvent.BossBarColor c : BossEvent.BossBarColor.values()) {
            if (c.getName().equals(name)) {
                return c;
            }
        }
        throw ScriptRuntime.typeError("unknown boss bar colour '" + name + "'");
    }

    static BossEvent.BossBarOverlay style(String name) {
        for (BossEvent.BossBarOverlay o : BossEvent.BossBarOverlay.values()) {
            if (o.getName().equals(name)) {
                return o;
            }
        }
        throw ScriptRuntime.typeError("unknown boss bar style '" + name + "'");
    }

    // ---- per host ----------------------------------------------------------------------------------------

    Bar create(String namespace, String id, String title, BossEvent.BossBarColor color, BossEvent.BossBarOverlay style,
            float progress) {
        Map<String, Bar> own = bars.computeIfAbsent(namespace, k -> new LinkedHashMap<>());
        if (!own.containsKey(id) && own.size() >= MAX_PER_NAMESPACE) {
            throw ScriptValues.rangeError("namespace " + namespace + " already has " + MAX_PER_NAMESPACE
                    + " boss bars, the most it may have");
        }
        Bar old = own.get(id);
        if (old != null) {
            remove(old);
        }
        ServerBossEvent event = new ServerBossEvent(UUID.randomUUID(), Component.literal(title), color, style);
        event.setProgress(progress);
        Bar bar = new Bar(namespace, id, event);
        bars.computeIfAbsent(namespace, k -> new LinkedHashMap<>()).put(id, bar);
        return bar;
    }

    Bar get(String namespace, String id) {
        Map<String, Bar> own = bars.get(namespace);
        return own == null ? null : own.get(id);
    }

    void remove(Bar bar) {
        bar.removed = true;
        bar.event.removeAllPlayers();
        Map<String, Bar> own = bars.get(bar.namespace);
        if (own != null && own.get(bar.id) == bar) {
            own.remove(bar.id);
        }
    }

    /** {@code /reload} and server stop: every bar hidden from everyone and dropped. */
    void clear() {
        for (Map<String, Bar> own : List.copyOf(bars.values())) {
            for (Bar bar : List.copyOf(own.values())) {
                remove(bar);
            }
        }
        bars.clear();
    }

    /** How many bars a namespace has. */
    int count(String namespace) {
        Map<String, Bar> own = bars.get(namespace);
        return own == null ? 0 : own.size();
    }

    /** A player left: off every bar (the bars would otherwise keep the disconnected player). */
    void playerLeft(ServerPlayer player) {
        for (Map<String, Bar> own : bars.values()) {
            for (Bar bar : own.values()) {
                bar.event.removePlayer(player);
            }
        }
    }

    /** A respawn made a new player object: it takes the old one's place on every bar the old one was on. */
    void playerRespawned(ServerPlayer oldPlayer, ServerPlayer newPlayer) {
        if (oldPlayer == newPlayer) {
            return;
        }
        for (Map<String, Bar> own : bars.values()) {
            for (Bar bar : own.values()) {
                if (bar.event.getPlayers().contains(oldPlayer)) {
                    bar.event.removePlayer(oldPlayer);
                    bar.event.addPlayer(newPlayer);
                }
            }
        }
    }
}
