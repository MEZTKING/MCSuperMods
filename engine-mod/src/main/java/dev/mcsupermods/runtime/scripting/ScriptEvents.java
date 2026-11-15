package dev.mcsupermods.runtime.scripting;

import com.google.gson.JsonObject;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

/**
 * The event objects of ADR 0032 D2, ADR 0065 D8, ADR 0089 D8 and ADR 0096 D3/D4: one data class per event, a {@link ScriptType} per event type over
 * {@code GameEvent} ({@code world}), and the event table ({@link #EVENTS}: name, type, cancellable, Fabric API source).
 */
public final class ScriptEvents {
    private ScriptEvents() {}

    /** Base of every event object: the world it happened in and, for cancellable events, the cancel flag. */
    public abstract static class Data {
        final ServerLevel level;
        boolean cancelled;

        Data(ServerLevel level) {
            this.level = level;
        }

        public boolean cancelled() {
            return cancelled;
        }
    }

    public static final class BlockInteract extends Data {
        final BlockRef block;
        final ServerPlayer player;
        final InteractionHand hand;

        BlockInteract(ServerLevel level, BlockRef block, ServerPlayer player, InteractionHand hand) {
            super(level);
            this.block = block;
            this.player = player;
            this.hand = hand;
        }
    }

    public static final class BlockBreak extends Data {
        final BlockRef block;
        final ServerPlayer player;

        BlockBreak(ServerLevel level, BlockRef block, ServerPlayer player) {
            super(level);
            this.block = block;
            this.player = player;
        }
    }

    public static final class ItemUse extends Data {
        final ItemRef item;
        final ServerPlayer player;
        final InteractionHand hand;

        ItemUse(ServerLevel level, ItemRef item, ServerPlayer player, InteractionHand hand) {
            super(level);
            this.item = item;
            this.player = player;
            this.hand = hand;
        }
    }

    public static final class EntityInteract extends Data {
        final Entity entity;
        final ServerPlayer player;
        final InteractionHand hand;

        EntityInteract(ServerLevel level, Entity entity, ServerPlayer player, InteractionHand hand) {
            super(level);
            this.entity = entity;
            this.player = player;
            this.hand = hand;
        }
    }

    public static final class EntityHurt extends Data {
        final Entity entity;
        final float amount;
        final Entity attacker;
        final Entity direct;
        final String source;

        EntityHurt(ServerLevel level, Entity entity, float amount, DamageSource source) {
            super(level);
            this.entity = entity;
            this.amount = amount;
            this.attacker = source.getEntity();
            this.direct = source.getDirectEntity();
            this.source = damageType(source);
        }
    }

    /** {@code entity.damaged} (ADR 0065 D8): after the damage, with the amount actually taken. */
    public static final class EntityDamaged extends Data {
        final Entity entity;
        final float amount;
        final Entity attacker;
        final Entity direct;
        final String source;

        EntityDamaged(ServerLevel level, Entity entity, float amount, DamageSource source) {
            super(level);
            this.entity = entity;
            this.amount = amount;
            this.attacker = source.getEntity();
            this.direct = source.getDirectEntity();
            this.source = damageType(source);
        }
    }

    /** The damage type id of a source, such as {@code minecraft:fall}. */
    static String damageType(DamageSource source) {
        return source.typeHolder().unwrapKey().map(k -> k.identifier().toString()).orElse("unknown");
    }

    /** {@code player.tick}, {@code player.respawn} and {@code player.leave} (ADR 0065 D8): the player only. */
    public static final class PlayerOnly extends Data {
        final ServerPlayer player;

        PlayerOnly(ServerLevel level, ServerPlayer player) {
            super(level);
            this.player = player;
        }
    }

    public static final class PlayerChangeDimension extends Data {
        final ServerPlayer player;
        final String from;
        final String to;

        PlayerChangeDimension(ServerPlayer player, ServerLevel from, ServerLevel to) {
            super(to);
            this.player = player;
            this.from = from.dimension().identifier().toString();
            this.to = to.dimension().identifier().toString();
        }
    }

    public static final class PlayerChat extends Data {
        final ServerPlayer player;
        final String message;

        PlayerChat(ServerLevel level, ServerPlayer player, String message) {
            super(level);
            this.player = player;
            this.message = message;
        }
    }

    public static final class EntityDeath extends Data {
        final Entity entity;
        final Entity attacker;

        EntityDeath(ServerLevel level, Entity entity, Entity attacker) {
            super(level);
            this.entity = entity;
            this.attacker = attacker;
        }
    }

    public static final class PlayerJoin extends Data {
        final ServerPlayer player;

        PlayerJoin(ServerLevel level, ServerPlayer player) {
            super(level);
            this.player = player;
        }
    }

    public static final class ServerStarted extends Data {
        ServerStarted(ServerLevel overworld) {
            super(overworld);
        }
    }

    public static final class ServerTick extends Data {
        final long tick;

        ServerTick(ServerLevel overworld, long tick) {
            super(overworld);
            this.tick = tick;
        }
    }

    /** The context of a {@code run_script} action (ADR 0032 D4). */
    public static final class Action extends Data {
        final Identifier owner;
        final Identifier event;
        final ScriptPos pos;
        final BlockRef block;
        final Entity entity;
        final ServerPlayer player;
        final Entity other;

        Action(ServerLevel level, Identifier owner, Identifier event, ScriptPos pos, BlockRef block, Entity entity,
                ServerPlayer player, Entity other) {
            super(level);
            this.other = other;
            this.owner = owner;
            this.event = event;
            this.pos = pos;
            this.block = block;
            this.entity = entity;
            this.player = player;
        }
    }

    /** {@code key.pressed} and {@code key.released} (Script API 1.5, ADR 0088 D6): the player and the key bind's id. */
    public static final class Key extends Data {
        final ServerPlayer player;
        final Identifier key;

        Key(ServerLevel level, ServerPlayer player, Identifier key) {
            super(level);
            this.player = player;
            this.key = key;
        }
    }

    /**
     * The vehicle events of Script API 1.5 (ADR 0090 D11): the vehicle, the player (who got in or out, shot, or
     * destroyed it; null for a vehicle destroyed without a player) and, for {@code vehicle.fired}, the weapon's id.
     */
    public static final class VehicleEvent extends Data {
        final Entity vehicle;
        final ServerPlayer player;
        final String weapon;

        VehicleEvent(ServerLevel level, Entity vehicle, ServerPlayer player, String weapon) {
            super(level);
            this.vehicle = vehicle;
            this.player = player;
            this.weapon = weapon;
        }
    }

    /**
     * {@code block.place} (Script API 1.6, ADR 0096 D3): a player is about to place a block from a block item; the
     * placement position, the item's block id and a copy of the stack.
     */
    public static final class BlockPlace extends Data {
        final ScriptPos pos;
        final String block;
        final ItemRef item;
        final ServerPlayer player;

        BlockPlace(ServerLevel level, ScriptPos pos, String block, ItemRef item, ServerPlayer player) {
            super(level);
            this.pos = pos;
            this.block = block;
            this.item = item;
            this.player = player;
        }
    }

    /**
     * {@code world.explosion} (Script API 1.6, ADR 0096 D3): an explosion about to happen; {@code cancel()} stops it
     * and {@code keepBlocks()} lets it hurt and push entities but break no block.
     */
    public static final class Explosion extends Data {
        final Vec3 pos;
        final float radius;
        final Entity source;
        final String cause;
        boolean keepBlocks;

        Explosion(ServerLevel level, Vec3 pos, float radius, Entity source, String cause) {
            super(level);
            this.pos = pos;
            this.radius = radius;
            this.source = source;
            this.cause = cause;
        }

        public boolean keepBlocks() {
            return keepBlocks;
        }
    }

    /**
     * {@code command} (Script API 1.6, ADR 0096 D1, D4): a project command ran; its definition id, its name, the source
     * entity (null for the console or a command block) and the arguments as JSON.
     */
    public static final class Command extends Data {
        final String id;
        final String name;
        final Entity source;
        final JsonObject args;

        Command(ServerLevel level, String id, String name, Entity source, JsonObject args) {
            super(level);
            this.id = id;
            this.name = name;
            this.source = source;
            this.args = args;
        }
    }

    static String hand(InteractionHand hand) {
        return hand == InteractionHand.OFF_HAND ? "off" : "main";
    }

    static final ScriptType GAME_EVENT = ScriptType.of("GameEvent")
            .constant("world", Data.class, (api, e) -> api.world(e.level));

    private static ScriptType event(String name) {
        return ScriptType.extending(name, GAME_EVENT);
    }

    private static ScriptType cancellable(ScriptType type) {
        return type.method("cancel", 0, 0, Data.class, (api, e, args) -> {
            e.cancelled = true;
            return null;
        });
    }

    static final ScriptType BLOCK_INTERACT = cancellable(event("BlockInteractEvent")
            .constant("block", BlockInteract.class, (api, e) -> api.block(e.block))
            .constant("player", BlockInteract.class, (api, e) -> api.player(e.player))
            .constant("hand", BlockInteract.class, (api, e) -> hand(e.hand)));

    static final ScriptType BLOCK_BREAK = cancellable(event("BlockBreakEvent")
            .constant("block", BlockBreak.class, (api, e) -> api.block(e.block))
            .constant("player", BlockBreak.class, (api, e) -> api.player(e.player)));

    static final ScriptType ITEM_USE = cancellable(event("ItemUseEvent")
            .constant("item", ItemUse.class, (api, e) -> api.item(e.item))
            .constant("player", ItemUse.class, (api, e) -> api.player(e.player))
            .constant("hand", ItemUse.class, (api, e) -> hand(e.hand)));

    static final ScriptType ENTITY_INTERACT = cancellable(event("EntityInteractEvent")
            .constant("entity", EntityInteract.class, (api, e) -> api.entity(e.entity))
            .constant("player", EntityInteract.class, (api, e) -> api.player(e.player))
            .constant("hand", EntityInteract.class, (api, e) -> hand(e.hand)));

    static final ScriptType ENTITY_HURT = cancellable(event("EntityHurtEvent")
            .constant("entity", EntityHurt.class, (api, e) -> api.entity(e.entity))
            .constant("amount", EntityHurt.class, (api, e) -> (double) e.amount)
            .constant("attacker", EntityHurt.class, (api, e) -> e.attacker == null ? null : api.entity(e.attacker))
            .constant("source", EntityHurt.class, (api, e) -> e.source)
            .constant("direct", EntityHurt.class, (api, e) -> e.direct == null ? null : api.entity(e.direct)));

    static final ScriptType ENTITY_DEATH = event("EntityDeathEvent")
            .constant("entity", EntityDeath.class, (api, e) -> api.entity(e.entity))
            .constant("attacker", EntityDeath.class, (api, e) -> e.attacker == null ? null : api.entity(e.attacker));

    static final ScriptType PLAYER_JOIN = event("PlayerJoinEvent")
            .constant("player", PlayerJoin.class, (api, e) -> api.player(e.player));

    static final ScriptType SERVER_STARTED = event("ServerStartedEvent");

    static final ScriptType SERVER_TICK = event("ServerTickEvent")
            .constant("tick", ServerTick.class, (api, e) -> (double) e.tick);

    static final ScriptType ACTION = event("ActionEvent")
            .constant("owner", Action.class, (api, e) -> e.owner.toString())
            .constant("event", Action.class, (api, e) -> e.event.toString())
            .constant("pos", Action.class, (api, e) -> api.pos(e.pos))
            .constant("block", Action.class, (api, e) -> e.block == null ? null : api.block(e.block))
            .constant("entity", Action.class, (api, e) -> e.entity == null ? null : api.entity(e.entity))
            .constant("player", Action.class, (api, e) -> e.player == null ? null : api.player(e.player))
            .constant("other", Action.class, (api, e) -> e.other == null ? null : api.entity(e.other));

    static final ScriptType PLAYER_TICK = event("PlayerTickEvent")
            .constant("player", PlayerOnly.class, (api, e) -> api.player(e.player));

    static final ScriptType PLAYER_RESPAWN = event("PlayerRespawnEvent")
            .constant("player", PlayerOnly.class, (api, e) -> api.player(e.player));

    static final ScriptType PLAYER_LEAVE = event("PlayerLeaveEvent")
            .constant("player", PlayerOnly.class, (api, e) -> api.player(e.player));

    static final ScriptType PLAYER_CHANGE_DIMENSION = event("PlayerChangeDimensionEvent")
            .constant("player", PlayerChangeDimension.class, (api, e) -> api.player(e.player))
            .constant("from", PlayerChangeDimension.class, (api, e) -> e.from)
            .constant("to", PlayerChangeDimension.class, (api, e) -> e.to);

    static final ScriptType PLAYER_CHAT = cancellable(event("PlayerChatEvent")
            .constant("player", PlayerChat.class, (api, e) -> api.player(e.player))
            .constant("message", PlayerChat.class, (api, e) -> e.message));

    static final ScriptType ENTITY_DAMAGED = event("EntityDamagedEvent")
            .constant("entity", EntityDamaged.class, (api, e) -> api.entity(e.entity))
            .constant("amount", EntityDamaged.class, (api, e) -> (double) e.amount)
            .constant("attacker", EntityDamaged.class, (api, e) -> e.attacker == null ? null : api.entity(e.attacker))
            .constant("direct", EntityDamaged.class, (api, e) -> e.direct == null ? null : api.entity(e.direct))
            .constant("source", EntityDamaged.class, (api, e) -> e.source);

    // Script API 1.5 (ADR 0089 D8)

    static final ScriptType KEY_PRESSED = event("KeyPressedEvent")
            .constant("player", Key.class, (api, e) -> api.player(e.player))
            .constant("key", Key.class, (api, e) -> e.key.toString());

    static final ScriptType KEY_RELEASED = event("KeyReleasedEvent")
            .constant("player", Key.class, (api, e) -> api.player(e.player))
            .constant("key", Key.class, (api, e) -> e.key.toString());

    static final ScriptType VEHICLE_MOUNTED = event("VehicleMountedEvent")
            .constant("vehicle", VehicleEvent.class, (api, e) -> api.entity(e.vehicle))
            .constant("player", VehicleEvent.class, (api, e) -> api.player(e.player));

    static final ScriptType VEHICLE_DISMOUNTED = event("VehicleDismountedEvent")
            .constant("vehicle", VehicleEvent.class, (api, e) -> api.entity(e.vehicle))
            .constant("player", VehicleEvent.class, (api, e) -> api.player(e.player));

    static final ScriptType VEHICLE_FIRED = event("VehicleFiredEvent")
            .constant("vehicle", VehicleEvent.class, (api, e) -> api.entity(e.vehicle))
            .constant("player", VehicleEvent.class, (api, e) -> api.player(e.player))
            .constant("weapon", VehicleEvent.class, (api, e) -> e.weapon);

    static final ScriptType VEHICLE_DESTROYED = event("VehicleDestroyedEvent")
            .constant("vehicle", VehicleEvent.class, (api, e) -> api.entity(e.vehicle))
            .constant("player", VehicleEvent.class, (api, e) -> e.player == null ? null : api.player(e.player));

    // Script API 1.6 (ADR 0096 D3, D4)

    static final ScriptType BLOCK_PLACE = cancellable(event("BlockPlaceEvent")
            .constant("pos", BlockPlace.class, (api, e) -> api.pos(e.pos))
            .constant("block", BlockPlace.class, (api, e) -> e.block)
            .constant("item", BlockPlace.class, (api, e) -> api.item(e.item))
            .constant("player", BlockPlace.class, (api, e) -> api.player(e.player)));

    static final ScriptType EXPLOSION = cancellable(event("ExplosionEvent")
            .constant("pos", Explosion.class, (api, e) -> api.pos(ScriptPos.of(e.pos)))
            .constant("radius", Explosion.class, (api, e) -> (double) e.radius)
            .constant("source", Explosion.class, (api, e) -> e.source == null ? null : api.entity(e.source))
            .constant("cause", Explosion.class, (api, e) -> e.cause)
            .method("keepBlocks", 0, 0, Explosion.class, (api, e, args) -> {
                e.keepBlocks = true;
                return null;
            }));

    static final ScriptType COMMAND = event("CommandEvent")
            .constant("id", Command.class, (api, e) -> e.id)
            .constant("name", Command.class, (api, e) -> e.name)
            .constant("source", Command.class, (api, e) -> e.source == null ? null : api.entity(e.source))
            .constant("args", Command.class, (api, e) -> api.json(e.args));

    /** One row of the event table of ADR 0032 D2. */
    public record Spec(String name, ScriptType type, boolean cancellable, String source) {}

    public static final String BLOCK_INTERACT_EVENT = "block.interact";
    public static final String BLOCK_BREAK_EVENT = "block.break";
    public static final String ITEM_USE_EVENT = "item.use";
    public static final String ENTITY_INTERACT_EVENT = "entity.interact";
    public static final String ENTITY_HURT_EVENT = "entity.hurt";
    public static final String ENTITY_DEATH_EVENT = "entity.death";
    public static final String PLAYER_JOIN_EVENT = "player.join";
    public static final String SERVER_STARTED_EVENT = "server.started";
    public static final String SERVER_TICK_EVENT = "server.tick";
    public static final String PLAYER_TICK_EVENT = "player.tick";
    public static final String PLAYER_RESPAWN_EVENT = "player.respawn";
    public static final String PLAYER_LEAVE_EVENT = "player.leave";
    public static final String PLAYER_CHANGE_DIMENSION_EVENT = "player.changeDimension";
    public static final String PLAYER_CHAT_EVENT = "player.chat";
    public static final String ENTITY_DAMAGED_EVENT = "entity.damaged";
    public static final String KEY_PRESSED_EVENT = "key.pressed";
    public static final String KEY_RELEASED_EVENT = "key.released";
    public static final String VEHICLE_MOUNTED_EVENT = "vehicle.mounted";
    public static final String VEHICLE_DISMOUNTED_EVENT = "vehicle.dismounted";
    public static final String VEHICLE_FIRED_EVENT = "vehicle.fired";
    public static final String VEHICLE_DESTROYED_EVENT = "vehicle.destroyed";
    public static final String BLOCK_PLACE_EVENT = "block.place";
    public static final String EXPLOSION_EVENT = "world.explosion";
    public static final String COMMAND_EVENT = "command";

    /**
     * The events scripts can handle, by name, in the order of ADR 0032 D2, then ADR 0065 D8, then ADR 0089 D8 (Script
     * API 1.5), then ADR 0096 D4 (Script API 1.6). The 1.5 and 1.6 events come from the runtime's own listeners, not
     * from Fabric callbacks: {@code source} names the listener method
     * ({@link dev.mcsupermods.runtime.controls.KeyBinds.KeyListener},
     * {@link dev.mcsupermods.runtime.registry.vehicle.VehicleEvents.Listener}, {@code MsmCommands.run}) or the Mixin
     * ({@code BlockItemPlaceMixin}, {@code ServerExplosionMixin}; no Fabric API event exists for either).
     */
    public static final Map<String, Spec> EVENTS = table(List.of(
            new Spec(BLOCK_INTERACT_EVENT, BLOCK_INTERACT, true, "UseBlockCallback"),
            new Spec(BLOCK_BREAK_EVENT, BLOCK_BREAK, true, "PlayerBlockBreakEvents.BEFORE"),
            new Spec(ITEM_USE_EVENT, ITEM_USE, true, "UseItemCallback"),
            new Spec(ENTITY_INTERACT_EVENT, ENTITY_INTERACT, true, "UseEntityCallback"),
            new Spec(ENTITY_HURT_EVENT, ENTITY_HURT, true, "ServerLivingEntityEvents.ALLOW_DAMAGE"),
            new Spec(ENTITY_DEATH_EVENT, ENTITY_DEATH, false, "ServerLivingEntityEvents.AFTER_DEATH"),
            new Spec(PLAYER_JOIN_EVENT, PLAYER_JOIN, false, "ServerPlayConnectionEvents.JOIN"),
            new Spec(SERVER_STARTED_EVENT, SERVER_STARTED, false, "ServerLifecycleEvents.SERVER_STARTED"),
            new Spec(SERVER_TICK_EVENT, SERVER_TICK, false, "ServerTickEvents.END_SERVER_TICK"),
            new Spec(PLAYER_TICK_EVENT, PLAYER_TICK, false, "ServerTickEvents.END_SERVER_TICK"),
            new Spec(PLAYER_RESPAWN_EVENT, PLAYER_RESPAWN, false, "ServerPlayerEvents.AFTER_RESPAWN"),
            new Spec(PLAYER_LEAVE_EVENT, PLAYER_LEAVE, false, "ServerPlayerEvents.LEAVE"),
            new Spec(PLAYER_CHANGE_DIMENSION_EVENT, PLAYER_CHANGE_DIMENSION, false,
                    "ServerEntityLevelChangeEvents.AFTER_PLAYER_CHANGE_LEVEL"),
            new Spec(PLAYER_CHAT_EVENT, PLAYER_CHAT, true, "ServerMessageEvents.ALLOW_CHAT_MESSAGE"),
            new Spec(ENTITY_DAMAGED_EVENT, ENTITY_DAMAGED, false, "ServerLivingEntityEvents.AFTER_DAMAGE"),
            new Spec(KEY_PRESSED_EVENT, KEY_PRESSED, false, "KeyBinds.KeyListener.pressed"),
            new Spec(KEY_RELEASED_EVENT, KEY_RELEASED, false, "KeyBinds.KeyListener.released"),
            new Spec(VEHICLE_MOUNTED_EVENT, VEHICLE_MOUNTED, false, "VehicleEvents.Listener.mounted"),
            new Spec(VEHICLE_DISMOUNTED_EVENT, VEHICLE_DISMOUNTED, false, "VehicleEvents.Listener.dismounted"),
            new Spec(VEHICLE_FIRED_EVENT, VEHICLE_FIRED, false, "VehicleEvents.Listener.fired"),
            new Spec(VEHICLE_DESTROYED_EVENT, VEHICLE_DESTROYED, false, "VehicleEvents.Listener.destroyed"),
            new Spec(BLOCK_PLACE_EVENT, BLOCK_PLACE, true, "BlockItemPlaceMixin"),
            new Spec(EXPLOSION_EVENT, EXPLOSION, true, "ServerExplosionMixin"),
            new Spec(COMMAND_EVENT, COMMAND, false, "MsmCommands.run")));

    private static Map<String, Spec> table(List<Spec> specs) {
        Map<String, Spec> map = new LinkedHashMap<>();
        for (Spec s : specs) {
            map.put(s.name(), s);
        }
        return Collections.unmodifiableMap(map);
    }
}
