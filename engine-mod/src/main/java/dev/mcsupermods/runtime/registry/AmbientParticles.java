package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.events.ParticleSpecs;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.resources.Identifier;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;

/**
 * {@code msm:ambient_particles} (ADR 0080 D6): the particles a block shows on its own, drawn by the client from
 * {@code animateTick} (about once a tick for each block near the player, as a torch's flame). The spawn plan is a pure
 * function of the component, the block state, the position and a random source, so it is tested on the server with a
 * seeded random (limit K5); the drawing is the client's.
 *
 * <p>The rule, per call: nothing unless every {@code states} property has the given value; with {@code chance} below 1,
 * one {@code nextFloat()} below {@code chance} passes; then {@code count} particles, each drawing three
 * {@code nextDouble()} for x, y and z in that order and placed uniformly at the block's corner plus {@code offset}
 * plus or minus {@code spread} on each axis ({@code offset + (2 * r - 1) * spread}), starting with exactly
 * {@code velocity}. With the defaults one particle appears anywhere in the block, still.
 *
 * <p>Nothing here names a client class: on a dedicated server {@code animateTick} is never called, and
 * {@link #planFor} gives nothing for a server level.
 */
public final class AmbientParticles {
    private AmbientParticles() {}

    /** One particle of a plan: its position and its velocity in blocks per tick. */
    public record Spawn(double x, double y, double z, double xd, double yd, double zd) {}

    /** Whether {@code state} has every property of {@code states} with that value (by the property's own value names). */
    public static boolean matches(Map<String, String> states, BlockState state) {
        for (Map.Entry<String, String> e : states.entrySet()) {
            Property<?> property = state.getBlock().getStateDefinition().getProperty(e.getKey());
            if (property == null || !e.getValue().equals(valueName(state, property))) {
                return false;
            }
        }
        return true;
    }

    private static <T extends Comparable<T>> String valueName(BlockState state, Property<T> property) {
        return property.getName(state.getValue(property));
    }

    /** The particles one {@code animateTick} of the block at {@code pos} in {@code state} shows (the class rule). */
    public static List<Spawn> plan(BlockComponents.AmbientParticles spec, BlockState state, BlockPos pos, RandomSource random) {
        if (!matches(spec.states(), state)) {
            return List.of();
        }
        if (spec.chance() < 1 && random.nextFloat() >= spec.chance()) {
            return List.of();
        }
        List<Double> offset = spec.offset();
        List<Double> spread = spec.spread();
        List<Double> velocity = spec.velocity();
        List<Spawn> out = new ArrayList<>(spec.count());
        for (int n = 0; n < spec.count(); n++) {
            double x = pos.getX() + offset.get(0) + (2 * random.nextDouble() - 1) * spread.get(0);
            double y = pos.getY() + offset.get(1) + (2 * random.nextDouble() - 1) * spread.get(1);
            double z = pos.getZ() + offset.get(2) + (2 * random.nextDouble() - 1) * spread.get(2);
            out.add(new Spawn(x, y, z, velocity.get(0), velocity.get(1), velocity.get(2)));
        }
        return List.copyOf(out);
    }

    /** {@link #plan} on a client level; nothing on a server level (ambient particles are the client's own). */
    public static List<Spawn> planFor(BlockComponents.AmbientParticles spec, Level level, BlockState state, BlockPos pos,
            RandomSource random) {
        return level.isClientSide() ? plan(spec, state, pos, random) : List.of();
    }

    /**
     * Shows the plan on the client. The particle is decoded with the level's registries and cached
     * ({@link ParticleSpecs#resolve}); one that does not decode shows nothing and is logged once.
     */
    public static void animate(Identifier owner, BlockComponents.AmbientParticles spec, Level level, BlockState state, BlockPos pos,
            RandomSource random) {
        List<Spawn> plan = planFor(spec, level, state, pos, random);
        if (plan.isEmpty()) {
            return;
        }
        Optional<ParticleOptions> particle = ParticleSpecs.resolve(spec.particle(), level.registryAccess(), owner + ": msm:ambient_particles");
        if (particle.isEmpty()) {
            return;
        }
        for (Spawn s : plan) {
            level.addParticle(particle.get(), s.x(), s.y(), s.z(), s.xd(), s.yd(), s.zd());
        }
    }
}
