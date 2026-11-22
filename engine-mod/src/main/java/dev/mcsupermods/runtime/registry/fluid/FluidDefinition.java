package dev.mcsupermods.runtime.registry.fluid;

import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.Events;
import java.util.List;
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
 * @param mixing              what forms where this fluid meets another (ADR 0108 D1, B527's format; {@link FluidMixing}
 *                            acts on it), in file order; empty means vanilla's behaviour per version
 * @param cauldron            the cauldron companion {@code <ns>:<path>_cauldron} (ADR 0108 D2); empty means none
 * @param bottle              the bottle companion {@code <ns>:<path>_bottle} (ADR 0108 D3); empty means none
 */
public record FluidDefinition(Behaviour behavesLike, Flow flow, int light, Optional<Integer> tint, float explosionResistance,
        Optional<Identifier> onEntityInside, Events events, List<Mixing> mixing, Optional<Cauldron> cauldron, Optional<Bottle> bottle) {
    /** Seconds a bottle takes to drink (ADR 0108 D3 as amended: a potion's 1.6, B525). */
    public static final float BOTTLE_DRINK_SECONDS = 1.6f;
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

    /**
     * {@code FluidMixing} (ADR 0108 D1 as amended): when this fluid meets {@code withTag} (any fluid in vanilla's water or
     * lava tag) or exactly {@code withFluid}, its touched source becomes {@code source} and its touched flowing fluid
     * {@code flowing}; at least one of them (the parser drops a rule with neither). Fluid rules are checked before tag
     * rules.
     *
     * @param withTag   {@code WATER} or {@code LAVA} for the {@code water} and {@code lava} keywords; empty with a fluid id
     * @param withFluid the other fluid's id; empty with a keyword
     */
    public record Mixing(Optional<Behaviour> withTag, Optional<Identifier> withFluid, Optional<Identifier> source,
            Optional<Identifier> flowing) {}

    /**
     * {@code FluidCauldron} (ADR 0108 D2): {@code levels} fills in three levels as water's (default false, full only as
     * lava's; always false for a lava-like fluid, which the parser warns about).
     */
    public record Cauldron(boolean levels) {}

    /**
     * {@code FluidBottle} (ADR 0108 D3): drunk in {@link #BOTTLE_DRINK_SECONDS}, leaving a glass bottle.
     *
     * @param food    hunger restored; empty means none (drinkable at any time)
     * @param effects mob effects given when drunk
     * @param onDrink an event id declared in {@code events}, fired when drunk (self the drinker)
     */
    public record Bottle(Optional<ItemComponents.Food> food, List<ItemComponents.ConsumeEffect> effects, Optional<Identifier> onDrink) {}
}
