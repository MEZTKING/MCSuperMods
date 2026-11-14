package dev.mcsupermods.runtime.registry;

import com.geckolib.animatable.GeoEntity;
import com.geckolib.animatable.manager.AnimatableManager;
import com.geckolib.animation.AnimationController;
import com.geckolib.animation.RawAnimation;
import com.geckolib.animation.object.PlayState;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.TamableAnimal;

/**
 * The GeckoLib controllers every geo body shares ({@link MsmGeoEntity}, {@link MsmGeoAnimal}, {@link MsmGeoMonster};
 * ADR 0070 D2) and the render facts the GeckoLib renderer reads ({@code client/MsmGeoModel}; ADR 0071 D3, D4, D6).
 * Loaded only when GeckoLib is present; the fact methods touch no GeckoLib type, so GameTests call them on the server.
 *
 * <p>Controllers: {@code msm_main} loops the animation {@link #loop} picks (ADR 0071 D6: {@code sit}, then
 * {@code swim} or {@code fly}, then {@code walk} or {@code idle}) with the definition's transition ticks;
 * {@code msm_triggered} plays animations on request and has the names of {@link #triggerable} registered as
 * triggerable ({@code idle}, {@code walk}, {@code attack}, {@code shoot} and the {@code play_animation} names). A
 * {@code play_animation} naming another controller gets a controller of that name (or adds to {@code msm_main}).
 */
public final class GeoControllers {
    /** Controller for the state loops. */
    static final String MAIN = EntityDefinition.MAIN_CONTROLLER;
    /** Controller that plays animations on request ({@code triggerAnim}, {@code play_animation}). */
    static final String TRIGGERED = EntityDefinition.TRIGGERED_CONTROLLER;

    private GeoControllers() {}

    /** Registers the controllers of {@code mob}'s definition. */
    static <T extends MsmMob & GeoEntity> void register(T mob, AnimatableManager.ControllerRegistrar controllers) {
        EntityDefinition def = mob.definition();
        EntityComponents.AnimatedModel model = def.components().animatedModel();
        Map<String, RawAnimation> loops = new HashMap<>();
        AnimationController<T> main = new AnimationController<>(MAIN, model.transitionTicks(), test -> {
            T self = test.animatable();
            Optional<String> name = loop(model, sitting(self), flying(self), swimming(self), test.isMoving());
            return name.map(n -> test.setAndContinue(loops.computeIfAbsent(n, k -> RawAnimation.begin().thenLoop(k))))
                    .orElse(PlayState.STOP);
        });
        Map<String, Set<String>> triggerable = triggerable(def);
        addTriggerable(main, triggerable.getOrDefault(MAIN, Set.of()));
        controllers.add(main);
        for (Map.Entry<String, Set<String>> entry : triggerable.entrySet()) {
            if (entry.getKey().equals(MAIN)) {
                continue;
            }
            // Triggerable animations are registered by name; the handler itself plays nothing.
            AnimationController<T> controller = new AnimationController<>(entry.getKey(), 0, test -> PlayState.STOP);
            addTriggerable(controller, entry.getValue());
            controllers.add(controller);
        }
    }

    private static void addTriggerable(AnimationController<?> controller, Set<String> names) {
        for (String name : names) {
            controller.triggerableAnim(name, RawAnimation.begin().thenPlay(name));
        }
    }

    /**
     * The triggerable animations by controller: {@link EntityDefinition#triggerableAnimations()} plus the
     * {@code shoot} name on {@code msm_triggered} (ADR 0071 D6), which {@code MobRanged} plays once per shot. Adding
     * a name the definition already lists changes nothing.
     */
    public static Map<String, Set<String>> triggerable(EntityDefinition def) {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        def.triggerableAnimations().forEach((controller, names) -> out.put(controller, new LinkedHashSet<>(names)));
        def.components().animatedModel().shoot()
                .ifPresent(name -> out.computeIfAbsent(TRIGGERED, k -> new LinkedHashSet<>()).add(name));
        return out;
    }

    /**
     * The main loop's animation (ADR 0071 D6): {@code sit} while sitting; while moving, {@code swim} in water and
     * {@code fly} in the air; then {@code walk} while moving and {@code idle} otherwise. A state without its
     * animation name falls through to the next rule; empty when nothing applies (the controller stops).
     */
    public static Optional<String> loop(EntityComponents.AnimatedModel model, boolean sitting, boolean flying,
            boolean swimming, boolean moving) {
        if (sitting && model.sit().isPresent()) {
            return model.sit();
        }
        if (moving && swimming && model.swim().isPresent()) {
            return model.swim();
        }
        if (moving && flying && model.fly().isPresent()) {
            return model.fly();
        }
        if (moving && model.walk().isPresent()) {
            return model.walk();
        }
        return model.idle();
    }

    /** Sitting: an {@code animal} body in its sitting pose (synched, so the client agrees). */
    public static boolean sitting(MsmMob mob) {
        return mob.asMob() instanceof TamableAnimal animal && animal.isInSittingPose();
    }

    /** In the air: a {@code fly} mode mob off the ground and out of water. */
    public static boolean flying(MsmMob mob) {
        Mob body = mob.asMob();
        return mob.driver().movement().mode() == EntityComponents.MovementMode.FLY && !body.onGround() && !body.isInWater();
    }

    /** In water, whatever the movement mode. */
    public static boolean swimming(MsmMob mob) {
        return mob.asMob().isInWater();
    }

    /**
     * The texture to draw (ADR 0071 D4): the current variant's, or {@code msm:animated_model.texture}. The variant index
     * is synched data, so both sides agree. The id is as written ({@code ns:entity/x}), not the file path.
     */
    public static Identifier texture(MsmMob mob) {
        return mob.driver().variants().texture().orElse(mob.definition().components().animatedModel().texture());
    }

    /** The bone to hide: {@code msm:rideable.saddle_bone} while the saddle slot is empty (ADR 0071 D3). */
    public static Optional<String> hiddenBone(MsmMob mob) {
        var riding = mob.driver().riding();
        return riding.saddleBone().filter(bone -> !riding.saddleBoneVisible());
    }

    /**
     * The extra model scale for babies: {@code getAgeScale()} ({@code msm:breedable.baby_scale} for a baby, else 1).
     * GeckoLib 5.5.7 scales by {@code LivingEntity.getScale()} (the {@code scale} attribute) only, never by the age
     * scale, so the renderer multiplies this in (plan limit M14).
     */
    public static float ageScale(MsmMob mob) {
        return mob.asMob().getAgeScale();
    }
}
