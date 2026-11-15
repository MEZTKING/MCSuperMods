package dev.mcsupermods.runtime.controls;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.KeyBindDefinition;
import dev.mcsupermods.runtime.loader.KeyBindParser;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.net.InputGuard;
import dev.mcsupermods.runtime.net.KeyPayload;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityLevelChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

/**
 * Project key binds on the server (ADR 0088 D3, D4, D7): the {@code key_bind} definitions, the runtime's vehicle keys
 * (D5), the held set per player ({@link HeldKeys}) and the press, release and hold events.
 *
 * <ul>
 *   <li>{@link #receive} handles one {@code key_v1} payload on the server thread: the rate limit first, then the id
 *       (a key bind, or a runtime key when a vehicle type is loaded), then, for a press, the player's state (not dead,
 *       sleeping or in spectator mode) and the definition's {@code when} and {@code cooldown_ticks}. A dropped packet
 *       is counted and logged by {@link InputGuard}; a press that fails {@code when} or the cooldown does nothing and is
 *       not reported. Releases skip the state checks, so a key never stays held because the player fell asleep.</li>
 *   <li>A press that fires holds the key, runs {@code msm:on_press} and then tells the {@link KeyListener}s; its release
 *       runs {@code msm:on_release}; {@code msm:while_held} runs every {@code hold_interval_ticks} from one interval
 *       after the press, at the end of the server tick.</li>
 *   <li>The player is self, other and the actor of every event ({@link EventContext#forItem}): {@code run_function} runs
 *       as and at the player at the function permission level, as an item's events do (D7 rule 5).</li>
 *   <li>The held set is cleared without events on leave, death, respawn and dimension change.</li>
 * </ul>
 */
public final class KeyBinds {
    /** The runtime's own keys (ADR 0088 D5): registered only when at least one vehicle type is loaded. */
    public enum RuntimeKey {
        FIRE("vehicle_fire", "key.keyboard.r"),
        SECOND("vehicle_fire_second", "key.keyboard.v"),
        HORN("vehicle_horn", "key.keyboard.h"),
        DESCEND("vehicle_descend", "key.keyboard.left.alt");

        private final Identifier id;
        private final String defaultKey;

        RuntimeKey(String path, String defaultKey) {
            this.id = Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, path);
            this.defaultKey = defaultKey;
        }

        /** The payload id, such as {@code msm_runtime:vehicle_fire}. */
        public Identifier id() {
            return id;
        }

        /**
         * The default key, an {@code InputConstants} name; equal to {@code TargetFacts.controls.runtimeKeys} of every
         * target (B410; {@code RuntimeKeysTest} pins it).
         */
        public String defaultKey() {
            return defaultKey;
        }

        /** The Controls name key, {@code key.msm_runtime.<path>}. */
        public String translationKey() {
            return KeyBindDefinition.nameKey(id);
        }
    }

    /** The Controls category of the runtime keys, "MSM Vehicles" ({@code key.category.msm_runtime.vehicles}). */
    public static final Identifier RUNTIME_CATEGORY = Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, "vehicles");

    /** Told about every press that fired and every release of a held key, after the definition's events (D6). */
    public interface KeyListener {
        default void pressed(ServerPlayer player, Identifier key) {}

        default void released(ServerPlayer player, Identifier key) {}
    }

    private static final InputGuard GUARD = new InputGuard();
    private static final List<KeyListener> LISTENERS = new CopyOnWriteArrayList<>();
    /** Last firing press per player and key bind, by server tick (cooldowns). */
    private static final Map<UUID, Map<Identifier, Long>> LAST_FIRED = new HashMap<>();

    private static volatile Map<Identifier, KeyBindDefinition> definitions = Map.of();
    private static volatile Map<Identifier, RuntimeKey> runtimeKeys = Map.of();
    private static boolean registered;

    private KeyBinds() {}

    /**
     * Parses the scanned {@code key_bind} definitions and returns {@code report} with the key binds registered and any
     * errors and warnings; called once from {@code MsmRuntime.onInitialize}, after the vehicles (a key bind's
     * {@code vehicle} must be one, and the runtime keys exist only with one).
     */
    public static LoadReport init(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, KeyBindDefinition> parsed = KeyBindParser.parseAll(report.definitions(), errors, warnings);
        parsed.forEach((id, def) -> def.vehicle().ifPresent(vehicle -> {
            if (!report.vehicles().contains(vehicle)) {
                warnings.add("key bind " + id + ": vehicle " + vehicle + " is not a vehicle type of this game; the key never fires");
            }
        }));
        errors.forEach(message -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message));
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        definitions = Map.copyOf(parsed);
        Map<Identifier, RuntimeKey> runtime = new LinkedHashMap<>();
        if (!report.vehicles().isEmpty()) {
            for (RuntimeKey key : RuntimeKey.values()) {
                runtime.put(key.id(), key);
            }
        }
        runtimeKeys = Map.copyOf(runtime);
        register();
        return report.withKeyBinds(List.copyOf(parsed.keySet()), errors, warnings);
    }

    /** The key bind definitions, by id (both sides; the client makes its key mappings from them). */
    public static Map<Identifier, KeyBindDefinition> definitions() {
        return definitions;
    }

    /** The key bind {@code id}, if one was registered. */
    public static Optional<KeyBindDefinition> definition(Identifier id) {
        return Optional.ofNullable(definitions.get(id));
    }

    /** Whether the runtime keys are registered (at least one vehicle type is loaded). */
    public static boolean runtimeKeysActive() {
        return !runtimeKeys.isEmpty();
    }

    /** Whether {@code key} is a key the server accepts. */
    public static boolean known(Identifier key) {
        return definitions.containsKey(key) || runtimeKeys.containsKey(key);
    }

    /** The guard's counters (GameTests, diagnostics). */
    public static InputGuard guard() {
        return GUARD;
    }

    public static void addListener(KeyListener listener) {
        LISTENERS.add(listener);
    }

    public static void removeListener(KeyListener listener) {
        LISTENERS.remove(listener);
    }

    private static void register() {
        if (registered) {
            return;
        }
        registered = true;
        ServerTickEvents.END_SERVER_TICK.register(KeyBinds::tick);
        ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
            if (entity instanceof ServerPlayer player) {
                clear(player);
            }
        });
        ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> clear(newPlayer));
        ServerEntityLevelChangeEvents.AFTER_PLAYER_CHANGE_LEVEL.register((player, origin, destination) -> clear(player));
        ServerPlayerEvents.LEAVE.register(KeyBinds::left);
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> left(handler.player));
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
            HeldKeys.clearAll();
            LAST_FIRED.clear();
            GUARD.clear();
        });
    }

    /** Clears {@code player}'s held keys without events (death, respawn, dimension change). */
    public static void clear(ServerPlayer player) {
        HeldKeys.clear(player.getUUID());
    }

    /** {@code player} left: held keys, cooldowns and the guard's state are forgotten. */
    public static void left(ServerPlayer player) {
        UUID uuid = player.getUUID();
        HeldKeys.clear(uuid);
        LAST_FIRED.remove(uuid);
        String line = GUARD.forget(uuid, now(player.level().getServer()));
        if (line != null) {
            MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, line);
        }
    }

    private static long now(MinecraftServer server) {
        return server == null ? 0 : server.getTickCount();
    }

    /** One {@code key_v1} payload from {@code player}, on the server thread (the network receiver and GameTests). */
    public static void receive(ServerPlayer player, KeyPayload payload) {
        long now = now(player.level().getServer());
        Identifier key = payload.key();
        if (!GUARD.tryAcquire(player.getUUID(), now)) {
            drop(player, InputGuard.Reason.RATE_LIMIT, now);
            return;
        }
        if (!known(key)) {
            drop(player, InputGuard.Reason.UNKNOWN_KEY, now);
            return;
        }
        if (payload.pressed()) {
            press(player, key, now);
        } else {
            release(player, key);
        }
    }

    private static void drop(ServerPlayer player, InputGuard.Reason reason, long now) {
        String line = GUARD.drop(player.getUUID(), player.getGameProfile().name(), reason, now);
        if (line != null) {
            MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, line);
        }
    }

    private static void press(ServerPlayer player, Identifier key, long now) {
        if (player.isDeadOrDying() || player.isRemoved()) {
            drop(player, InputGuard.Reason.DEAD, now);
            return;
        }
        if (player.isSleeping()) {
            drop(player, InputGuard.Reason.SLEEPING, now);
            return;
        }
        if (player.isSpectator()) {
            drop(player, InputGuard.Reason.SPECTATOR, now);
            return;
        }
        UUID uuid = player.getUUID();
        if (HeldKeys.isHeld(uuid, key)) {
            return;
        }
        KeyBindDefinition def = definitions.get(key);
        if (def == null) {
            // A runtime key: held state only; the vehicle weapons and horn read it (B417, B418).
            HeldKeys.press(uuid, key, now, 0);
            LISTENERS.forEach(l -> l.pressed(player, key));
            return;
        }
        if (!whenHolds(def, player)) {
            return;
        }
        Map<Identifier, Long> fired = LAST_FIRED.computeIfAbsent(uuid, u -> new HashMap<>());
        Long last = fired.get(key);
        if (def.cooldownTicks() > 0 && last != null && now - last < def.cooldownTicks()) {
            return;
        }
        fired.put(key, now);
        HeldKeys.press(uuid, key, now, def.holdIntervalTicks());
        def.onPress().ifPresent(event -> fire(key, def, event, player));
        LISTENERS.forEach(l -> l.pressed(player, key));
    }

    private static void release(ServerPlayer player, Identifier key) {
        if (!HeldKeys.release(player.getUUID(), key)) {
            return;
        }
        KeyBindDefinition def = definitions.get(key);
        if (def != null && !player.isRemoved()) {
            def.onRelease().ifPresent(event -> fire(key, def, event, player));
        }
        LISTENERS.forEach(l -> l.released(player, key));
    }

    /** {@code when} (ADR 0088 D3), checked at press time. */
    static boolean whenHolds(KeyBindDefinition def, ServerPlayer player) {
        return switch (def.when()) {
            case ALWAYS -> true;
            case ON_FOOT -> player.getVehicle() == null;
            case IN_VEHICLE -> player.getVehicle() instanceof MsmVehicle vehicle && vehicleMatches(def, vehicle);
            case DRIVING -> player.getVehicle() instanceof MsmVehicle vehicle && vehicle.driver() == player && vehicleMatches(def, vehicle);
        };
    }

    private static boolean vehicleMatches(KeyBindDefinition def, MsmVehicle vehicle) {
        return def.vehicle().isEmpty() || def.vehicle().get().equals(BuiltInRegistries.ENTITY_TYPE.getKey(vehicle.getType()));
    }

    private static void fire(Identifier key, KeyBindDefinition def, String event, ServerPlayer player) {
        Identifier eventId = Identifier.tryParse(event);
        if (eventId == null) {
            MsmRuntime.LOGGER.error("[{}] {}: invalid event id {}", MsmRuntime.MOD_ID, key, event);
            return;
        }
        EventRunner.fire(key, def.events(), eventId, EventContext.forItem(player.level(), player));
    }

    /** {@code msm:while_held} of every held key that is due, and the guard's waiting log lines. */
    private static void tick(MinecraftServer server) {
        long now = server.getTickCount();
        if (now % 20 == 0) {
            for (String line : GUARD.due(now)) {
                MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, line);
            }
        }
        for (UUID uuid : HeldKeys.players()) {
            ServerPlayer player = server.getPlayerList().getPlayer(uuid);
            if (player == null) {
                continue;
            }
            for (Identifier key : HeldKeys.due(uuid, now, id -> {
                KeyBindDefinition def = definitions.get(id);
                return def == null || def.whileHeld().isEmpty() ? 0 : def.holdIntervalTicks();
            })) {
                KeyBindDefinition def = definitions.get(key);
                fire(key, def, def.whileHeld().get(), player);
            }
        }
    }
}
