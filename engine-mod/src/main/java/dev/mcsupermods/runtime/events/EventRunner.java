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
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
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
