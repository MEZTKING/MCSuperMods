package dev.mcsupermods.runtime.scripting;

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

/**
 * The event objects of ADR 0032 D2 and ADR 0065 D8: one data class per event, a {@link ScriptType} per event type over
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

    /** The events scripts can handle, by name, in the order of ADR 0032 D2 and then ADR 0065 D8. */
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
            new Spec(ENTITY_DAMAGED_EVENT, ENTITY_DAMAGED, false, "ServerLivingEntityEvents.AFTER_DAMAGE")));

    private static Map<String, Spec> table(List<Spec> specs) {
        Map<String, Spec> map = new LinkedHashMap<>();
        for (Spec s : specs) {
            map.put(s.name(), s);
        }
        return Collections.unmodifiableMap(map);
    }
}
