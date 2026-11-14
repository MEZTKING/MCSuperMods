package dev.mcsupermods.runtime.scripting;

import com.google.gson.JsonElement;
import com.mojang.serialization.JsonOps;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.attachment.v1.AttachmentTarget;
import net.minecraft.resources.RegistryOps;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/**
 * The script API v1 (ADR 0032 D2, with the 1.1 additions of ADR 0065), built from Java: the {@code msm} tree each script receives and the object types
 * of the event objects. One instance per {@link ScriptHost} load (it holds the shared, sealed standard-object scope);
 * {@link #describe()} returns the installed member tree, which the JUnit {@code ScriptApiContractTest} compares with
 * {@code packages/plugins/scripting/api/script-api-v1.json}.
 */
public final class ScriptApi {
    static final ScriptType MSM_LOG = ScriptType.of("MsmLog")
            .method("info", 1, 1, ScriptHost.Module.class, (api, m, args) -> api.host.log(m, "info", args))
            .method("warn", 1, 1, ScriptHost.Module.class, (api, m, args) -> api.host.log(m, "warn", args))
            .method("error", 1, 1, ScriptHost.Module.class, (api, m, args) -> api.host.log(m, "error", args));

    static final ScriptType MSM_EVENTS = ScriptType.of("MsmEvents")
            .method("on", 2, 3, ScriptHost.Module.class, (api, m, args) ->
                    api.host.on(m, ScriptValues.string(args, 0, "event name"), ScriptValues.function(args, 1, "handler"),
                            ScriptValues.options(args, 2, "options")));

    static final ScriptType MSM_ACTIONS = ScriptType.of("MsmActions")
            .method("define", 2, 2, ScriptHost.Module.class, (api, m, args) ->
                    api.host.define(m, ScriptValues.string(args, 0, "handler id"), ScriptValues.function(args, 1, "handler")));

    static final ScriptType MSM = ScriptType.of("Msm")
            .constant("version", ScriptHost.Module.class, (api, m) -> api.host.version())
            .namespace("log", MSM_LOG)
            .namespace("events", MSM_EVENTS)
            .namespace("actions", MSM_ACTIONS)
            .method("schedule", 2, 2, ScriptHost.Module.class, (api, m, args) ->
                    api.host.schedule(m, ScriptValues.number(args, 0, "ticks"), ScriptValues.function(args, 1, "fn")))
            .constant("storage", ScriptHost.Module.class, (api, m) -> api.store(
                    ScriptDataAttachment.world(api.host.server()), m.id().getNamespace(), ScriptData.WORLD_LIMIT_BYTES, "msm.storage"))
            .namespace("bossBars", ScriptBossBars.NAMESPACE)
            .method("getWorld", 1, 1, ScriptHost.Module.class, (api, m, args) -> {
                ServerLevel level = ScriptEntity.world(api.host.server(), ScriptValues.string(args, 0, "dimension"));
                return level == null ? null : api.world(level);
            })
            .method("players", 0, 0, ScriptHost.Module.class, (api, m, args) ->
                    api.array(api.host.server().getPlayerList().getPlayers().stream().map(api::player).toArray()));

    /** The object types, in the order of {@code script-api-v1.json}. */
    static final List<ScriptType> TYPES = List.of(ScriptPos.TYPE, ScriptWorld.TYPE, ScriptEntity.TYPE, ScriptPlayer.TYPE,
            BlockRef.TYPE, ItemRef.TYPE, DataStore.TYPE, ScriptEvents.GAME_EVENT, ScriptEvents.BLOCK_INTERACT, ScriptEvents.BLOCK_BREAK,
            ScriptEvents.ITEM_USE, ScriptEvents.ENTITY_INTERACT, ScriptEvents.ENTITY_HURT, ScriptEvents.ENTITY_DEATH,
            ScriptEvents.PLAYER_JOIN, ScriptEvents.SERVER_STARTED, ScriptEvents.SERVER_TICK, ScriptEvents.ACTION,
            ScriptInventory.TYPE, ScriptBossBars.TYPE, ScriptRaycast.TYPE, ScriptEvents.PLAYER_TICK, ScriptEvents.PLAYER_RESPAWN,
            ScriptEvents.PLAYER_LEAVE, ScriptEvents.PLAYER_CHANGE_DIMENSION, ScriptEvents.PLAYER_CHAT, ScriptEvents.ENTITY_DAMAGED);

    private final ScriptHost host;
    private final ScriptableObject scope;
    private RegistryOps<JsonElement> jsonOps;

    ScriptApi(ScriptHost host, ScriptableObject scope) {
        this.host = host;
        this.scope = scope;
    }

    /** The shared, sealed scope with the safe standard objects; host objects use it as their parent scope. */
    ScriptableObject scope() {
        return scope;
    }

    /** The {@code msm} object of one script ({@code msm.log} names that script). */
    Scriptable msm(ScriptHost.Module module) {
        return new HostObject(this, MSM, module);
    }

    Scriptable pos(ScriptPos pos) {
        return new HostObject(this, ScriptPos.TYPE, pos);
    }

    Scriptable world(ServerLevel level) {
        return new HostObject(this, ScriptWorld.TYPE, level);
    }

    /** An entity; players get the {@code Player} type, other entities follow a dimension change ({@link EntityHandle}). */
    Scriptable entity(Entity entity) {
        return entity instanceof ServerPlayer p ? player(p) : new HostObject(this, ScriptEntity.TYPE, new EntityHandle(entity));
    }

    Scriptable player(ServerPlayer player) {
        return new HostObject(this, ScriptPlayer.TYPE, player);
    }

    Scriptable inventory(ServerPlayer player) {
        return new HostObject(this, ScriptInventory.TYPE, player);
    }

    Scriptable rayHit(ScriptRaycast.Hit hit) {
        return new HostObject(this, ScriptRaycast.TYPE, hit);
    }

    Scriptable bossBar(ScriptBossBars.Bar bar) {
        return new HostObject(this, ScriptBossBars.TYPE, bar);
    }

    ScriptHost host() {
        return host;
    }

    Scriptable block(BlockRef block) {
        return new HostObject(this, BlockRef.TYPE, block);
    }

    /** A copy of a stack as {@code ItemRef}, or null ({@code undefined}) for an empty stack. */
    Scriptable itemOrUndefined(net.minecraft.world.item.ItemStack stack) {
        return stack.isEmpty() ? null : item(new ItemRef(stack));
    }

    /** Registry-aware JSON ops of the running server, for data component values (ADR 0065 D1, D9). */
    RegistryOps<JsonElement> jsonOps() {
        if (jsonOps == null) {
            jsonOps = host.server().registryAccess().createSerializationContext(JsonOps.INSTANCE);
        }
        return jsonOps;
    }

    Scriptable item(ItemRef item) {
        return new HostObject(this, ItemRef.TYPE, item);
    }

    /**
     * {@code Entity.data} (ADR 0062 D2): the store of the namespace of the script that runs now, since one entity
     * object is shared by the handlers of every script an event reaches.
     */
    Scriptable entityData(Entity entity) {
        return store(entity, host.runningNamespace(), ScriptData.ENTITY_LIMIT_BYTES, "entity.data");
    }

    private Scriptable store(AttachmentTarget holder, String namespace, int limit, String label) {
        return new HostObject(this, DataStore.TYPE, new DataStore.Target(holder, namespace, limit, label));
    }

    Scriptable event(ScriptType type, ScriptEvents.Data data) {
        return new HostObject(this, type, data);
    }

    Scriptable array(Object[] values) {
        return Context.getCurrentContext().newArray(scope, values);
    }

    // ---- description (contract test) -----------------------------------------------------------------------

    /** A type: the type it extends (or null) and its own members by name. */
    public record TypeDescription(String extendsType, Map<String, MemberDescription> members) {}

    /**
     * A member: {@code kind} as in the JSON ({@code property}, {@code method}, {@code namespace}); for methods the
     * required and the total parameter count; for namespaces the nested members.
     */
    public record MemberDescription(String kind, int minParams, int maxParams, TypeDescription namespace) {}

    /** An event: its object type, whether it has {@code cancel()} and the Fabric API callback behind it. */
    public record EventDescription(String type, boolean cancellable, String source) {}

    /**
     * The whole API: object types, globals ({@code msm}), events and global free functions ({@code require}, installed
     * per script by {@link ScriptHost}; ADR 0032 D1 amendment).
     */
    public record Description(Map<String, TypeDescription> types, Map<String, TypeDescription> globals,
            Map<String, EventDescription> events, Map<String, MemberDescription> functions) {}

    /** The global free functions every script scope has: {@code require(id)} (relative ids or {@code msm:runtime}). */
    static final Map<String, MemberDescription> FUNCTIONS = Map.of("require", new MemberDescription("method", 1, 1, null));

    /** The member tree the host installs; needs no running server. */
    public static Description describe() {
        Map<String, TypeDescription> types = new LinkedHashMap<>();
        for (ScriptType t : TYPES) {
            types.put(t.name(), t.describe());
        }
        Map<String, EventDescription> events = new LinkedHashMap<>();
        ScriptEvents.EVENTS.forEach((name, spec) ->
                events.put(name, new EventDescription(spec.type().name(), spec.cancellable(), spec.source())));
        return new Description(Collections.unmodifiableMap(types), Map.of("msm", MSM.describe()),
                Collections.unmodifiableMap(events), FUNCTIONS);
    }
}
