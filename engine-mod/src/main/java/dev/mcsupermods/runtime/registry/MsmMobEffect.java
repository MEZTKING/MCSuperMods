package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.EffectComponents;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.EffectDefinition;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.entity.event.v1.effect.ServerMobEffectEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;

/**
 * Driver class for {@code msm/<ns>/effect/*.json} definitions (ADR 0055 D3). Category, colour, particle, sound and
 * attribute modifiers are set by {@link MsmRegistrar}; this class fires the definition's events:
 * <ul>
 *   <li>{@code msm:on_start} from {@link #onEffectAdded}, on the server only: vanilla calls it when the entity did not
 *       have the effect yet ({@code onEffectStarted} runs on every {@code addEffect}, also when the effect is only
 *       refreshed, so it would fire more than once);</li>
 *   <li>{@code msm:on_tick} from {@link #applyEffectTick} every {@code interval} ticks of the remaining duration
 *       ({@link EffectComponents.OnTick#interval});</li>
 *   <li>{@code msm:on_end} from Fabric API's {@code ServerMobEffectEvents.AFTER_REMOVE}, which fires from
 *       {@code LivingEntity.onEffectsRemoved}: on {@code removeEffect}, {@code removeAllEffects} (milk, totems,
 *       commands) and on natural expiry ({@code tickEffects} calls {@code onEffectsRemoved} for an effect that ran out;
 *       read in the 26.3 jar and checked by {@code MsmEffectGameTest.onEndFiresOnExpiry}).</li>
 * </ul>
 * The event context is {@link EventContext#forEffect}: the holder is {@code self} and {@code other}.
 *
 * <p>{@code msm:on_tick} and {@code msm:on_end} are queued and run at the end of the server tick: vanilla calls both
 * while {@code tickEffects} iterates the holder's effect {@code HashMap}, so an action that adds or removes an effect
 * there ({@code apply_effect}, a script's {@code removeEffect}, a {@code /effect} function, a totem saving the holder
 * from {@code damage}) would throw {@code ConcurrentModificationException}. {@code msm:on_start} runs at once
 * ({@code addEffect} has finished changing the map by then).
 */
public class MsmMobEffect extends MobEffect {
    private final Identifier id;
    private final EffectDefinition definition;

    MsmMobEffect(Identifier id, EffectDefinition definition, MobEffectCategory category) {
        super(category, definition.color());
        this.id = id;
        this.definition = definition;
    }

    MsmMobEffect(Identifier id, EffectDefinition definition, MobEffectCategory category, ParticleOptions particle) {
        super(category, definition.color(), particle);
        this.id = id;
        this.definition = definition;
    }

    public Identifier id() {
        return id;
    }

    public EffectDefinition definition() {
        return definition;
    }

    /** {@code duration % interval == 0}; never without {@code msm:on_tick}. */
    @Override
    public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
        Optional<EffectComponents.OnTick> onTick = definition.components().onTick();
        return onTick.isPresent() && duration % onTick.get().interval(amplifier) == 0;
    }

    /** Queues {@code msm:on_tick} for the end of the tick; the effect stays (returns {@code true}). */
    @Override
    public boolean applyEffectTick(ServerLevel level, LivingEntity entity, int amplifier) {
        definition.components().onTick().ifPresent(t -> queue(level, entity, t.event(), true));
        return true;
    }

    /** Plays the sound on adding (vanilla), then fires {@code msm:on_start}; called only when the effect is new. */
    @Override
    public void onEffectAdded(LivingEntity entity, int amplifier) {
        super.onEffectAdded(entity, amplifier);
        if (entity.level() instanceof ServerLevel level) {
            definition.components().onStart().ifPresent(s -> fire(level, entity, s.event()));
        }
    }

    private void fire(ServerLevel level, LivingEntity holder, Identifier event) {
        EventRunner.fire(id, definition.events(), event, EventContext.forEffect(level, holder));
    }

    /** An event waiting for the end of the server tick; {@code whileAlive} skips it once the holder is removed. */
    private record Pending(MsmMobEffect effect, ServerLevel level, LivingEntity holder, Identifier event, boolean whileAlive) {}

    private static final List<Pending> PENDING = new ArrayList<>();

    private void queue(ServerLevel level, LivingEntity holder, Identifier event, boolean whileAlive) {
        PENDING.add(new Pending(this, level, holder, event, whileAlive));
    }

    /** Runs the queued events, including any that they queue in turn (each tick of those is a later tick). */
    private static void flush() {
        if (PENDING.isEmpty()) {
            return;
        }
        List<Pending> due = new ArrayList<>(PENDING);
        PENDING.clear();
        for (Pending p : due) {
            if (p.whileAlive() && p.holder().isRemoved()) {
                continue;
            }
            p.effect().fire(p.level(), p.holder(), p.event());
        }
    }

    /** Installs the {@code msm:on_end} hook and the end-of-tick queue once (from {@code MsmRegistrar.registerAll}). */
    static void registerHooks() {
        ServerMobEffectEvents.AFTER_REMOVE.register((instance, entity, context) -> {
            if (instance.getEffect().value() instanceof MsmMobEffect effect && entity.level() instanceof ServerLevel level) {
                effect.definition.components().onEnd().ifPresent(e -> effect.queue(level, entity, e.event(), false));
            }
        });
        ServerTickEvents.END_SERVER_TICK.register(server -> flush());
        // A stopping server must not leave events for the next one (integrated server restarts).
        net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents.SERVER_STOPPED.register(server -> PENDING.clear());
    }
}
