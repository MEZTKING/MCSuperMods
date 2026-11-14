package dev.mcsupermods.runtime.client.particle;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mcsupermods.runtime.client.particle.ParticleLook.Animation;
import dev.mcsupermods.runtime.client.particle.ParticleLook.Fade;
import dev.mcsupermods.runtime.client.particle.ParticleLook.Spec;
import java.lang.reflect.Proxy;
import java.util.List;
import net.fabricmc.fabric.api.client.particle.v1.FabricSpriteSet;
import net.minecraft.resources.Identifier;
import net.minecraft.util.RandomSource;
import org.junit.jupiter.api.Test;

/** The rules of {@link ParticleLook} (ADR 0080 D1, D4), checked by hand against numbers worked out from the ADR. */
class ParticleLookTest {
    private static final float EPS = 1e-6f;

    private static Spec spec(Animation animation, Integer frameTicks, Fade fade, Float alpha) {
        return Spec.resolve(animation, frameTicks, null, null, null, null, null, null, null, null, null, alpha, fade,
                null, null, null, null);
    }

    @Test
    void defaultsAreTheAdrs() {
        Spec d = Spec.DEFAULTS;
        assertEquals(Animation.AGE, d.animation());
        assertEquals(2, d.frameTicks());
        assertEquals(20, d.lifetimeMin());
        assertEquals(20, d.lifetimeMax());
        assertEquals(0.2f, d.size());
        assertEquals(0.2f, d.sizeEnd());
        assertEquals(0f, d.gravity());
        assertEquals(0.98f, d.friction());
        assertTrue(d.collision());
        assertEquals(0xFFFFFF, d.color());
        assertEquals(0xFFFFFF, d.colorEnd());
        assertEquals(1f, d.alpha());
        assertEquals(Fade.NONE, d.fade());
        assertFalse(d.emissive());
        assertFalse(d.translucent());
        assertEquals(0f, d.spin());
        assertFalse(d.alwaysShow());
    }

    @Test
    void endValuesDefaultToTheStartValues() {
        Spec s = Spec.resolve(null, null, 7, null, 1.5f, null, null, null, null, 0x123456, null, null, null, null, null,
                null, null);
        assertEquals(7, s.lifetimeMax());
        assertEquals(1.5f, s.sizeEnd());
        assertEquals(0x123456, s.colorEnd());
    }

    @Test
    void translucentDefaultFollowsAlphaAndFade() {
        assertFalse(spec(null, null, null, null).translucent());
        assertTrue(spec(null, null, null, 0.5f).translucent());
        assertTrue(spec(null, null, Fade.OUT, null).translucent());
        assertTrue(spec(null, null, Fade.IN_OUT, null).translucent());
        Spec forcedOff = Spec.resolve(null, null, null, null, null, null, null, null, null, null, null, 0.5f, null,
                null, false, null, null);
        assertFalse(ParticleLook.translucent(forcedOff));
    }

    @Test
    void outOfRangeSpecsAreRefused() {
        assertThrows(IllegalArgumentException.class, () -> Spec.resolve(null, null, 30, 10, null, null, null, null,
                null, null, null, null, null, null, null, null, null));
        assertThrows(IllegalArgumentException.class, () -> Spec.resolve(null, null, null, null, null, null, null,
                1.5f, null, null, null, null, null, null, null, null, null));
        assertThrows(IllegalArgumentException.class, () -> Spec.resolve(null, null, null, null, null, null, null,
                null, null, 0x1000000, null, null, null, null, null, null, null));
        assertThrows(IllegalArgumentException.class, () -> Spec.resolve(null, 0, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null));
    }

    @Test
    void namesRoundTrip() {
        for (Animation a : Animation.values()) {
            assertEquals(a, Animation.byName(a.serializedName()));
        }
        assertEquals(Fade.IN_OUT, Fade.byName("in_out"));
        assertNull(Animation.byName("bounce"));
        assertNull(Fade.byName("blink"));
    }

    @Test
    void lifetimeCoversTheRangeEvenly() {
        assertEquals(20, ParticleLook.lifetime(20, 20, 0.7));
        assertEquals(10, ParticleLook.lifetime(10, 30, 0));
        assertEquals(20, ParticleLook.lifetime(10, 30, 0.5)); // 10 + floor(0.5 × 21)
        assertEquals(30, ParticleLook.lifetime(10, 30, 0.999999));
        assertEquals(30, ParticleLook.lifetime(10, 30, 1.0)); // clamped
    }

    @Test
    void ageFramesShareTheLifeEqually() {
        Spec s = spec(Animation.AGE, null, null, null);
        // 4 frames over 20 ticks: 5 ticks each; the age reaching the lifetime stays on the last frame.
        assertEquals(0, ParticleLook.frame(s, 0, 20, 4, 0));
        assertEquals(0, ParticleLook.frame(s, 4, 20, 4, 0));
        assertEquals(1, ParticleLook.frame(s, 5, 20, 4, 0));
        assertEquals(3, ParticleLook.frame(s, 19, 20, 4, 0));
        assertEquals(3, ParticleLook.frame(s, 20, 20, 4, 0));
        assertEquals(0, ParticleLook.frame(s, 10, 20, 1, 0));
    }

    @Test
    void loopAndRandomFrames() {
        Spec loop = spec(Animation.LOOP, 3, null, null);
        assertEquals(0, ParticleLook.frame(loop, 2, 30, 3, 0));
        assertEquals(1, ParticleLook.frame(loop, 3, 30, 3, 0));
        assertEquals(2, ParticleLook.frame(loop, 8, 30, 3, 0));
        assertEquals(0, ParticleLook.frame(loop, 9, 30, 3, 0));
        Spec random = spec(Animation.RANDOM, null, null, null);
        assertEquals(3, ParticleLook.frame(random, 0, 16, 5, 3));
        assertEquals(3, ParticleLook.frame(random, 16, 16, 5, 3));
    }

    @Test
    void sizeRunsFromSizeToSizeEnd() {
        Spec s = Spec.resolve(null, null, null, null, 0.5f, 0f, null, null, null, null, null, null, null, null, null,
                null, null);
        assertEquals(0.5f, ParticleLook.size(s, 0, 20, 0f), EPS);
        assertEquals(0.25f, ParticleLook.size(s, 10, 20, 0f), EPS);
        assertEquals(0.2375f, ParticleLook.size(s, 10, 20, 0.5f), EPS); // t = 10.5 / 20
        assertEquals(0f, ParticleLook.size(s, 20, 20, 0.5f), EPS); // clamped at the end
    }

    @Test
    void colourAndFades() {
        Spec colour = Spec.resolve(null, null, 10, null, null, null, null, null, null, 0xFF8000, 0x0040FF, null,
                null, null, null, null, null);
        ParticleLook.Rgba start = ParticleLook.rgba(colour, 0, 10);
        assertEquals(1f, start.r(), EPS);
        assertEquals(128 / 255f, start.g(), EPS);
        assertEquals(0f, start.b(), EPS);
        ParticleLook.Rgba middle = ParticleLook.rgba(colour, 5, 10);
        assertEquals(0.5f, middle.r(), EPS);
        assertEquals((128 + 64) / 2f / 255f, middle.g(), EPS);
        assertEquals(0.5f, middle.b(), EPS);
        assertEquals(1f, middle.a(), EPS);

        Spec out = spec(null, null, Fade.OUT, 0.8f);
        assertEquals(0.8f, ParticleLook.rgba(out, 0, 20).a(), EPS);
        assertEquals(0.4f, ParticleLook.rgba(out, 10, 20).a(), EPS);
        assertEquals(0f, ParticleLook.rgba(out, 20, 20).a(), EPS);

        Spec inOut = spec(null, null, Fade.IN_OUT, null);
        assertEquals(0f, ParticleLook.rgba(inOut, 0, 40).a(), EPS);
        assertEquals(0.5f, ParticleLook.rgba(inOut, 5, 40).a(), EPS); // t = 0.125
        assertEquals(1f, ParticleLook.rgba(inOut, 20, 40).a(), EPS);
        assertEquals(0.5f, ParticleLook.rgba(inOut, 35, 40).a(), EPS);
        assertEquals(0f, ParticleLook.rgba(inOut, 40, 40).a(), EPS);
    }

    @Test
    void rollIsSpinTimesAgeInRadians() {
        Spec s = Spec.resolve(null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, -45f, null);
        assertEquals(0f, ParticleLook.roll(s, 0), EPS);
        assertEquals((float) (-Math.PI / 4), ParticleLook.roll(s, 1), EPS);
        assertEquals((float) (-Math.PI), ParticleLook.roll(s, 4), EPS);
    }

    @Test
    void stepAppliesGravityThenMovesThenFriction() {
        Spec s = Spec.resolve(null, null, null, null, null, null, 1f, 0.5f, false, null, null, null, null, null, null,
                null, null);
        ParticleLook.State one = ParticleLook.step(new ParticleLook.State(0, 64, 0, 0.4, 0.2, 0), s);
        // yd = 0.2 - 0.04 = 0.16; moved by (0.4, 0.16, 0); then halved.
        assertEquals(0.4, one.x(), 1e-12);
        assertEquals(64.16, one.y(), 1e-12);
        assertEquals(0.2, one.xd(), 1e-12);
        assertEquals(0.08, one.yd(), 1e-12);
        ParticleLook.State two = ParticleLook.step(one, s);
        assertEquals(0.6, two.x(), 1e-12);
        assertEquals(64.16 + 0.04, two.y(), 1e-12); // yd = 0.08 - 0.04
        assertEquals(0.02, two.yd(), 1e-12);
    }

    @Test
    void noFrictionKeepsTheSpeed() {
        Spec s = Spec.resolve(null, null, null, null, null, null, null, 1f, false, null, null, null, null, null, null,
                null, null);
        ParticleLook.State state = new ParticleLook.State(0, 0, 0, 0.1, 0, -0.1);
        for (int i = 0; i < 20; i++) {
            state = ParticleLook.step(state, s);
        }
        assertEquals(2.0, state.x(), 1e-12);
        assertEquals(-2.0, state.z(), 1e-12);
        assertEquals(0.1, state.xd(), 1e-12);
    }

    @Test
    void providerWithoutSpritesMakesNothingAndWarnsOnce() {
        Identifier id = Identifier.fromNamespaceAndPath("msm_test", "no_pictures");
        MsmParticleProvider provider = new MsmParticleProvider(id, Spec.DEFAULTS, emptySprites());
        assertFalse(MsmParticleProvider.warned(id));
        assertNull(provider.createParticle(null, null, 0, 0, 0, 0, 0, 0, RandomSource.create(1)));
        assertTrue(MsmParticleProvider.warned(id));
        assertNull(provider.createParticle(null, null, 0, 0, 0, 0, 0, 0, RandomSource.create(1)));
        assertEquals(0, MsmParticle.created(id));
        Identifier missing = Identifier.fromNamespaceAndPath("msm_test", "no_set");
        assertNull(new MsmParticleProvider(missing, Spec.DEFAULTS, null)
                .createParticle(null, null, 0, 0, 0, 0, 0, 0, RandomSource.create(1)));
    }

    /**
     * A sprite set before (or without) any pictures. A proxy rather than a class, because {@code SpriteSet} gains an
     * abstract {@code size()} on 26.4-snapshot-7 that the runtime never implements or calls.
     */
    private static FabricSpriteSet emptySprites() {
        return (FabricSpriteSet) Proxy.newProxyInstance(FabricSpriteSet.class.getClassLoader(),
                new Class<?>[] {FabricSpriteSet.class}, (proxy, method, args) -> switch (method.getName()) {
                    case "getSprites" -> List.of();
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == args[0];
                    case "toString" -> "empty sprites";
                    default -> method.getReturnType() == int.class ? 0 : null;
                });
    }
}
