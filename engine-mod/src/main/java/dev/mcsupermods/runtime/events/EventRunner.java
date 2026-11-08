package dev.mcsupermods.runtime.events;

import com.mojang.brigadier.exceptions.CommandSyntaxException;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.commands.functions.CommandFunction;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/** Runs events on the logical server (ADR 0025 D4). */
public final class EventRunner {
    /** {@code trigger_event} chains nest at most this deep; the fired event is depth 1. */
    public static final int MAX_DEPTH = 16;

    private static final Map<String, Optional<BlockState>> STATES = new ConcurrentHashMap<>();
    private static volatile EventListener listener;
    private static final List<EventListener> LISTENERS = new CopyOnWriteArrayList<>();

    private EventRunner() {}

    /** Installs an observer (GameTests, diagnostics); null removes it. */
    public static void setListener(EventListener l) {
        listener = l;
    }

    /**
     * Adds an observer next to the one of {@link #setListener}, for observers that live across ticks
     * (entity GameTests) while other code sets and clears the single listener.
     */
    public static void addListener(EventListener l) {
        LISTENERS.add(l);
    }

    public static void removeListener(EventListener l) {
        LISTENERS.remove(l);
    }

    /** Fires {@code eventId} of a definition. */
    public static void fire(Identifier owner, Events events, Identifier eventId, EventContext ctx) {
        run(owner, events, eventId, ctx, 1);
    }

    private static void run(Identifier owner, Events events, Identifier eventId, EventContext ctx, int depth) {
        if (depth > MAX_DEPTH) {
            MsmRuntime.LOGGER.error("[{}] {}: event chain deeper than {} stopped before {}", MsmRuntime.MOD_ID, owner, MAX_DEPTH, eventId);
            return;
        }
        Optional<EventDefinition> event = events.get(eventId);
        if (event.isEmpty()) {
            MsmRuntime.LOGGER.error("[{}] {}: unknown or dropped event {}", MsmRuntime.MOD_ID, owner, eventId);
            return;
        }
        EventListener l = listener;
        if (l != null) {
            l.onEvent(owner, eventId, depth, ctx);
        }
        for (EventListener extra : LISTENERS) {
            extra.onEvent(owner, eventId, depth, ctx);
        }
        for (Action action : event.get().actions()) {
            if (l != null) {
                l.onAction(owner, eventId, action, ctx);
            }
            for (EventListener extra : LISTENERS) {
                extra.onAction(owner, eventId, action, ctx);
            }
            switch (action) {
                case Action.RunFunction a -> runFunction(owner, a, ctx);
                case Action.SpawnParticle a -> spawnParticle(owner, a, ctx);
                case Action.SetBlockState a -> setBlockState(owner, a, ctx);
                case Action.GiveItem a -> giveItem(owner, a, ctx);
                case Action.PlaySound a -> playSound(owner, a, ctx);
                case Action.TriggerEvent a -> run(owner, events, a.event(), ctx, depth + 1);
                case Action.PlayAnimation a -> {
                    // Only entity definitions keep play_animation (dropped at load elsewhere).
                    if (ctx.entity() instanceof AnimationTarget target) {
                        target.playAnimation(a.controller(), a.animation());
                    }
                }
                case Action.RunScript a -> ScriptHost.runAction(owner, eventId, a.handler(), ctx);
                case Action.ApplyEffect a -> applyEffect(owner, a, ctx);
                case Action.Launch a -> launch(a, ctx);
            }
        }
    }

    private static void runFunction(Identifier owner, Action.RunFunction a, EventContext ctx) {
        MinecraftServer server = ctx.level().getServer();
        Optional<CommandFunction<CommandSourceStack>> function = server.getFunctions().get(a.function());
        if (function.isEmpty()) {
            MsmRuntime.LOGGER.error("[{}] {}: unknown function {}", MsmRuntime.MOD_ID, owner, a.function());
            return;
        }
        CommandSourceStack source = server.createCommandSourceStack()
                .withLevel(ctx.level())
                .withPosition(ctx.origin())
                .withPermission(LevelBasedPermissionSet.GAMEMASTER) // permission level 2, as for function tags
                .withSuppressedOutput();
        if (ctx.player() != null) {
            source = source.withEntity(ctx.player()).withRotation(ctx.player().getRotationVector());
        }
        server.getFunctions().execute(function.get(), source);
    }

    private static void spawnParticle(Identifier owner, Action.SpawnParticle a, EventContext ctx) {
        ParticleType<?> type = BuiltInRegistries.PARTICLE_TYPE.getValue(a.particle());
        if (!(type instanceof SimpleParticleType simple) || !BuiltInRegistries.PARTICLE_TYPE.containsKey(a.particle())) {
            MsmRuntime.LOGGER.error("[{}] {}: {} is not a particle type without options", MsmRuntime.MOD_ID, owner, a.particle());
            return;
        }
        Vec3 o = ctx.origin();
        ctx.level().sendParticles(simple, o.x, o.y, o.z, a.count(), a.spread(), a.spread(), a.spread(), a.speed());
    }

    private static void setBlockState(Identifier owner, Action.SetBlockState a, EventContext ctx) {
        Optional<BlockState> state = parseState(a.state());
        if (state.isEmpty()) {
            MsmRuntime.LOGGER.error("[{}] {}: invalid block state '{}'", MsmRuntime.MOD_ID, owner, a.state());
            return;
        }
        BlockPos target = ctx.base().offset(a.dx(), a.dy(), a.dz());
        ctx.level().setBlockAndUpdate(target, state.get());
    }

    /** Parses a block state string once; blocks of other definitions exist by the time events run. */
    public static Optional<BlockState> parseState(String state) {
        return STATES.computeIfAbsent(state, s -> {
            try {
                return Optional.of(BlockStateParser.parseForBlock(BuiltInRegistries.BLOCK, s, false).blockState());
            } catch (CommandSyntaxException e) {
                return Optional.empty();
            }
        });
    }

    private static void giveItem(Identifier owner, Action.GiveItem a, EventContext ctx) {
        if (ctx.player() == null) {
            return;
        }
        Optional<Item> item = BuiltInRegistries.ITEM.getOptional(a.item());
        if (item.isEmpty()) {
            MsmRuntime.LOGGER.error("[{}] {}: unknown item {}", MsmRuntime.MOD_ID, owner, a.item());
            return;
        }
        int left = a.count();
        int max = item.get().getDefaultMaxStackSize();
        while (left > 0) {
            ItemStack stack = new ItemStack(item.get(), Math.min(left, max));
            left -= stack.getCount();
            if (!ctx.player().addItem(stack) && !stack.isEmpty()) {
                Block.popResource(ctx.level(), ctx.player().blockPosition(), stack);
            }
        }
    }

    /**
     * {@code apply_effect}: {@code self} is the event's player, or the entity of an entity definition when there is
     * no player; {@code other} is {@link EventContext#other()}. Without a living target nothing happens.
     */
    private static void applyEffect(Identifier owner, Action.ApplyEffect a, EventContext ctx) {
        Optional<Holder.Reference<MobEffect>> effect = BuiltInRegistries.MOB_EFFECT.get(a.effect());
        if (effect.isEmpty()) {
            MsmRuntime.LOGGER.error("[{}] {}: unknown mob effect {}", MsmRuntime.MOD_ID, owner, a.effect());
            return;
        }
        LivingEntity target = switch (a.target()) {
            case SELF -> ctx.player() != null ? ctx.player() : ctx.entity() instanceof LivingEntity living ? living : null;
            case OTHER -> ctx.other();
        };
        if (target != null) {
            target.addEffect(new MobEffectInstance(effect.get(), a.ticks(), a.amplifier()));
        }
    }

    /**
     * {@code launch} (ADR 0052): the same target rule as {@code apply_effect}; the push follows the target's look
     * direction, flattened for {@code horizontal}, or goes straight up.
     */
    private static void launch(Action.Launch a, EventContext ctx) {
        net.minecraft.world.entity.Entity target = switch (a.target()) {
            case SELF -> ctx.player() != null ? ctx.player() : ctx.entity();
            case OTHER -> ctx.other();
        };
        if (target == null) return;
        Vec3 look = target.getLookAngle();
        Vec3 direction = switch (a.direction()) {
            case LOOK -> look;
            case HORIZONTAL -> {
                Vec3 flat = new Vec3(look.x, 0, look.z);
                yield flat.lengthSqr() < 1.0E-6 ? Vec3.ZERO : flat.normalize();
            }
            case UP -> new Vec3(0, 1, 0);
        };
        Vec3 push = direction.scale(a.strength()).add(0, a.up(), 0);
        if (a.add()) {
            Motion.add(target, push.x, push.y, push.z);
        } else {
            Motion.set(target, push.x, push.y, push.z);
        }
    }

    private static void playSound(Identifier owner, Action.PlaySound a, EventContext ctx) {
        Optional<SoundEvent> sound = BuiltInRegistries.SOUND_EVENT.getOptional(a.sound());
        if (sound.isEmpty()) {
            MsmRuntime.LOGGER.error("[{}] {}: unknown sound {}", MsmRuntime.MOD_ID, owner, a.sound());
            return;
        }
        Vec3 o = ctx.origin();
        SoundSource source = ctx.entity() != null ? SoundSource.NEUTRAL : SoundSource.BLOCKS;
        ctx.level().playSound(null, o.x, o.y, o.z, sound.get(), source, a.volume(), a.pitch());
    }
}
