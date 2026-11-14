package dev.mcsupermods.runtime.client.particle;

import dev.mcsupermods.runtime.MsmRuntime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.fabric.api.client.particle.v1.FabricSpriteSet;
import net.fabricmc.fabric.api.client.particle.v1.ParticleProviderRegistry;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.resources.Identifier;
import net.minecraft.util.RandomSource;

/**
 * The provider of one project particle type (ADR 0080 D4): makes an {@link MsmParticle} with the type's
 * {@link ParticleLook.Spec} and the frames Fabric loaded for it from the particle description (the sprite set is read
 * at each spawn, so a resource reload is seen). It never throws: a type with no frames (no description, or every
 * picture missing) or a particle that cannot be made gives {@code null}, which vanilla skips, and one warning per type
 * (limit K10). {@code MsmRuntimeClient} registers {@link #pending} for every project type through Fabric's
 * {@link ParticleProviderRegistry}.
 */
public final class MsmParticleProvider implements ParticleProvider<SimpleParticleType> {
    private static final Set<Identifier> WARNED = ConcurrentHashMap.newKeySet();

    private final Identifier id;
    private final ParticleLook.Spec spec;
    private final FabricSpriteSet sprites;

    public MsmParticleProvider(Identifier id, ParticleLook.Spec spec, FabricSpriteSet sprites) {
        this.id = id;
        this.spec = spec;
        this.sprites = sprites;
    }

    /** The pending provider to register for type {@code id}: Fabric hands it the type's sprite set. */
    public static ParticleProviderRegistry.PendingParticleProvider<SimpleParticleType> pending(
            Identifier id, ParticleLook.Spec spec) {
        return sprites -> new MsmParticleProvider(id, spec, sprites);
    }

    @Override
    public Particle createParticle(
            SimpleParticleType type,
            ClientLevel level,
            double x,
            double y,
            double z,
            double xd,
            double yd,
            double zd,
            RandomSource random) {
        try {
            List<TextureAtlasSprite> frames = sprites == null ? null : sprites.getSprites();
            if (frames == null || frames.isEmpty()) {
                warnOnce("has no sprites (add its pictures and the description assets/"
                        + id.getNamespace() + "/particles/" + id.getPath() + ".json)");
                return null;
            }
            return new MsmParticle(level, x, y, z, xd, yd, zd, id, spec, frames, random);
        } catch (RuntimeException e) {
            warnOnce("could not be made: " + e);
            return null;
        }
    }

    private void warnOnce(String problem) {
        if (WARNED.add(id)) {
            MsmRuntime.LOGGER.warn("[{}] particle {} {}; it is not drawn", MsmRuntime.MOD_ID, id, problem);
        }
    }

    /** Whether type {@code id} has already logged its warning (for tests). */
    static boolean warned(Identifier id) {
        return WARNED.contains(id);
    }
}
