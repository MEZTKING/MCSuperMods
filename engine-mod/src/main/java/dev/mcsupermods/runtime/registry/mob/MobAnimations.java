package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.minecraft.network.syncher.EntityDataAccessor;

/**
 * Triggered animations through synched data (ADR 0072 D2): {@code DATA_ANIM} holds an 8-bit counter in its low byte
 * and, above it, the animation's index in {@link #triggerable()}, the definition's triggerable animations
 * ({@link EntityDefinition#triggerableAnimations()}) in order, controller by controller. Every
 * {@code play_animation}, {@code attack} and script animation goes through {@link #play}; the vanilla renderer
 * (B295) starts the animation when the value changes, the GeckoLib bodies also call {@code triggerAnim}. A name that
 * is not triggerable leaves the value alone. One value per tick reaches the client (plan limit M3).
 */
public final class MobAnimations {
    /** One triggerable animation: the controller and the animation name. */
    public record Triggered(String controller, String animation) {}

    private final MsmMob mob;
    private final EntityDefinition definition;
    private List<Triggered> triggerable;

    MobAnimations(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** The definition's triggerable animations in {@code DATA_ANIM} index order; empty without a definition. */
    public List<Triggered> triggerable() {
        if (triggerable == null) {
            List<Triggered> out = new ArrayList<>();
            if (definition != null) {
                for (Map.Entry<String, Set<String>> entry : definition.triggerableAnimations().entrySet()) {
                    for (String name : entry.getValue()) {
                        out.add(new Triggered(entry.getKey(), name));
                    }
                }
            }
            triggerable = List.copyOf(out);
        }
        return triggerable;
    }

    /** Packs an index and a counter into a {@code DATA_ANIM} value. */
    public static int encode(int index, int counter) {
        return (index << 8) | (counter & 0xFF);
    }

    /** The animation index of a {@code DATA_ANIM} value. */
    public static int index(int value) {
        return value >>> 8;
    }

    /** The counter of a {@code DATA_ANIM} value. */
    public static int counter(int value) {
        return value & 0xFF;
    }

    /** Sets {@code DATA_ANIM} to the animation's index with the counter moved on by one. */
    public void play(String controller, String animation) {
        int index = triggerable().indexOf(new Triggered(controller, animation));
        if (index < 0) {
            return;
        }
        var data = mob.asMob().getEntityData();
        int previous = data.get(mob.animData());
        data.set(mob.animData(), encode(index, counter(previous) + 1));
    }

    /** On both sides after a synched value changes; the vanilla renderer's client state reacts here (B295). */
    public void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {}
}
