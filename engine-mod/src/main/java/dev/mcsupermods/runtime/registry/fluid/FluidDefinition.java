package dev.mcsupermods.runtime.registry.fluid;

import dev.mcsupermods.runtime.events.Events;
import java.util.Locale;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * A fluid definition v1 (ADR 0099 D1 and its amendment after B470, {@code ::msm::definition::Fluid}) with every default
 * resolved by {@link dev.mcsupermods.runtime.loader.FluidParser}: the numbers the fluid classes of both versions (the
 * {@code MsmFluid} seam) and {@link MsmLiquidBlock} read.
 *
 * @param behavesLike         which vanilla liquid entities treat it like: the fluid's own {@code entityInside} effects
 *                            (water puts fire out, lava sets on fire and hurts), the pickup sound and, on 26.4, drag,
 *                            fall distance and fog; the fluid tags themselves are data the lowering writes
 * @param flow                the flow numbers, defaults per {@code behavesLike}
 * @param light               the liquid block's light level, 0 to 15 (default 0, 15 for {@code lava})
 * @param tint                an RGB colour multiplied over the pictures on the client; empty for none
 * @param explosionResistance of the fluid and its liquid block (default 100, as water's)
 * @param onEntityInside      an event id declared in {@code events}, fired on the server while an entity is in the fluid,
 *                            at most every {@link #INSIDE_COOLDOWN_TICKS} ticks for the same entity
 * @param events              the fluid's events
 */
public record FluidDefinition(Behaviour behavesLike, Flow flow, int light, Optional<Integer> tint, float explosionResistance,
        Optional<Identifier> onEntityInside, Events events) {
    /** Explosion resistance without {@code explosion_resistance}: water's. */
    public static final float DEFAULT_EXPLOSION_RESISTANCE = 100.0f;
    /** Ticks between two {@code on_entity_inside} firings for the same entity (ADR 0099 D1, ADR 0061 D2). */
    public static final int INSIDE_COOLDOWN_TICKS = 10;

    /** {@code FluidBehaviour}. */
    public enum Behaviour {
        WATER, LAVA, NONE;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        /** The light level without {@code light}: 15 for lava, else 0 (ADR 0099 D1). */
        public int defaultLight() {
            return this == LAVA ? 15 : 0;
        }
    }

    /**
     * {@code FluidFlow} with its defaults resolved.
     *
     * @param tickDelay     ticks between two flow steps, 1 to 100
     * @param slopeDistance how far flowing fluid looks for a way down, 1 to 8
     * @param dropOff       levels lost per block of spreading, 1 to 4
     * @param infinite      whether two sources beside each other make a new source
     */
    public record Flow(int tickDelay, int slopeDistance, int dropOff, boolean infinite) {
        /** Water's numbers. */
        public static final Flow WATER = new Flow(5, 4, 1, true);
        /** Lava's numbers in the Overworld. */
        public static final Flow LAVA = new Flow(30, 2, 2, false);

        /** The defaults of {@code behaviour}: lava's for {@code lava}, water's otherwise ({@code none} takes water's). */
        public static Flow defaults(Behaviour behaviour) {
            return behaviour == Behaviour.LAVA ? LAVA : WATER;
        }
    }
}
