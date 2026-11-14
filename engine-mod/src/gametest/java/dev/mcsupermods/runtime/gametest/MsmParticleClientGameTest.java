package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.client.particle.MsmParticle;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.particle.Particle;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.Logger;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.Property;

/**
 * Client GameTest for drawn particles (ADR 0081 D6 (c), B356). It opens a singleplayer world on a real client (run by
 * {@code ./gradlew runClientGameTest [-Pmc=26.4]}, never by {@code build}) and, for every test particle type:
 *
 * <ul>
 *   <li>runs {@code /particle} on the server and waits until the client made that many {@link MsmParticle}s
 *       ({@link MsmParticle#created(Identifier)}), then saves one screenshot (kept as an artefact, never compared);
 *   <li>makes one particle through the client's particle engine and checks it is an {@link MsmParticle} with the
 *       definition's frame count, a lifetime within the definition's range and the layer of the definition, and that
 *       it is gone after its lifetime.
 * </ul>
 *
 * <p>A type whose description is missing ({@code msm_test:client_no_sprites}) makes no particle and logs exactly one
 * warning however often it is spawned (limit K10).
 *
 * <p>Headless (B356): Mesa's EGL ({@code libegl1}, {@code libegl-mesa0}) and
 * {@code SDL_VIDEO_FORCE_EGL=1 LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s "-screen 0 1280x720x24" ./gradlew
 * runClientGameTest}. Through GLX the client finds no window: it asks for an sRGB-capable framebuffer and Xvfb's GLX
 * offers none ("Couldn't find matching GLX visual"). Screenshots land in {@code build/run/clientGameTest/screenshots/}.
 */
public class MsmParticleClientGameTest implements FabricClientGameTest {
    /** One test particle: its id path, frame count, lifetime range and layer, all from its definition. */
    private record Case(String path, int frames, int lifetimeMin, int lifetimeMax, boolean translucent) {}

    private static final List<Case> CASES = List.of(
            // msm/msm_test/particle/spark.json: 8 vanilla generic frames, 16..24 ticks, fade out (translucent).
            new Case("spark", 8, 16, 24, true),
            // glimmer.json: 3 vanilla glitter frames, the default 20 ticks, opaque.
            new Case("glimmer", 3, 20, 20, false),
            // client_square.json: 2 test pictures (textures/particle/client_square_0..1.png), 60 ticks, opaque.
            new Case("client_square", 2, 60, 60, false));

    private static final int BURST = 40;

    @Override
    public void runTest(ClientGameTestContext context) {
        WarningCounter warnings = WarningCounter.attach();
        try (TestSingleplayerContext world = context.worldBuilder().create()) {
            world.getServer().runCommand("time set noon");
            world.getServer().runCommand("weather clear");
            world.getServer().runCommand("execute as @a at @s run tp @s ~ ~ ~ 0 0");
            world.getConnection().waitForChunksRender();
            context.waitTicks(5);

            for (Case c : CASES) {
                burstAndScreenshot(context, world, c);
                oneParticle(context, c);
            }
            noSprites(context, world, warnings);
        } finally {
            warnings.detach();
        }
    }

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static SimpleParticleType type(String path) {
        if (!(BuiltInRegistries.PARTICLE_TYPE.getValue(id(path)) instanceof SimpleParticleType simple)) {
            throw new AssertionError(id(path) + " is not a registered option-less particle type");
        }
        return simple;
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    /** {@code /particle} on the server reaches the client's provider; one screenshot of the burst. */
    private static void burstAndScreenshot(ClientGameTestContext context, TestSingleplayerContext world, Case c) {
        Identifier id = id(c.path());
        int before = context.computeOnClient(mc -> MsmParticle.created(id));
        world.getServer().runCommand("execute as @a at @s anchored eyes run particle " + id
                + " ^ ^ ^3 0.6 0.6 0.6 0 " + BURST + " force");
        context.waitFor(mc -> MsmParticle.created(id) >= before + BURST, 100);
        context.waitTicks(2);
        Path shot = context.takeScreenshot("msm_particle_" + c.path());
        check(shot.toFile().isFile(), "no screenshot for " + id + " at " + shot);
    }

    /** One particle made through the client's engine: class, frames, lifetime, layer, removal. */
    private static void oneParticle(ClientGameTestContext context, Case c) {
        Identifier id = id(c.path());
        SimpleParticleType type = type(c.path());
        Particle made = context.computeOnClient(mc -> {
            Vec3 eye = mc.player.getEyePosition();
            return mc.particleEngine.createParticle(type, eye.x, eye.y, eye.z + 3, 0, 0, 0);
        });
        check(made instanceof MsmParticle, id + " made " + made + ", not an MsmParticle");
        MsmParticle particle = (MsmParticle) made;
        check(particle.id().equals(id), id + " particle has id " + particle.id());
        check(particle.spriteCount() == c.frames(), id + " has " + particle.spriteCount() + " frames, not " + c.frames());
        int lifetime = context.computeOnClient(mc -> particle.getLifetime());
        check(lifetime >= c.lifetimeMin() && lifetime <= c.lifetimeMax(),
                id + " lifetime " + lifetime + " outside " + c.lifetimeMin() + ".." + c.lifetimeMax());
        check(particle.translucentLayer() == c.translucent(),
                id + " translucent layer " + particle.translucentLayer() + ", expected " + c.translucent());
        check(context.computeOnClient(mc -> particle.isAlive()), id + " died at once");
        context.waitTicks(lifetime + 3);
        check(!context.computeOnClient(mc -> particle.isAlive()), id + " still alive after its lifetime " + lifetime);
    }

    /** A type without a description: no particle, no crash, one warning however often it is spawned. */
    private static void noSprites(ClientGameTestContext context, TestSingleplayerContext world, WarningCounter warnings) {
        Identifier id = id("client_no_sprites");
        SimpleParticleType type = type("client_no_sprites");
        for (int i = 0; i < 3; i++) {
            world.getServer().runCommand("execute as @a at @s anchored eyes run particle " + id + " ^ ^ ^3 0 0 0 0 5 force");
        }
        world.getConnection().waitForClientboundPackets();
        context.waitTicks(5);
        Particle made = context.computeOnClient((Minecraft mc) -> {
            Vec3 eye = mc.player.getEyePosition();
            return mc.particleEngine.createParticle(type, eye.x, eye.y, eye.z + 3, 0, 0, 0);
        });
        check(made == null, id + " made " + made + " without sprites");
        check(MsmParticle.created(id) == 0, id + " made " + MsmParticle.created(id) + " particles without sprites");
        List<String> lines = warnings.matching("particle " + id + " has no sprites");
        check(lines.size() == 1, id + ": expected one warning, got " + lines);
    }

    /** Counts the runtime's warnings while the test runs (the provider warns through {@code MsmRuntime.LOGGER}). */
    private static final class WarningCounter extends AbstractAppender {
        private final List<String> messages = new CopyOnWriteArrayList<>();
        private final Logger root;

        private WarningCounter(Logger root) {
            super("msm-particle-client-gametest", null, null, true, Property.EMPTY_ARRAY);
            this.root = root;
        }

        static WarningCounter attach() {
            Logger root = (Logger) LogManager.getRootLogger();
            WarningCounter counter = new WarningCounter(root);
            counter.start();
            root.addAppender(counter);
            return counter;
        }

        void detach() {
            root.removeAppender(this);
            stop();
        }

        @Override
        public void append(LogEvent event) {
            if (event.getLevel() == Level.WARN) {
                messages.add(event.getMessage().getFormattedMessage());
            }
        }

        List<String> matching(String text) {
            return messages.stream().filter(m -> m.contains(text)).toList();
        }
    }
}
