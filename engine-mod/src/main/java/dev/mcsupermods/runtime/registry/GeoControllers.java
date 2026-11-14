package dev.mcsupermods.runtime.registry;

import com.geckolib.animatable.GeoEntity;
import com.geckolib.animatable.manager.AnimatableManager;
import com.geckolib.animation.AnimationController;
import com.geckolib.animation.RawAnimation;
import com.geckolib.animation.object.PlayState;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import java.util.Map;
import java.util.Set;

/**
 * The GeckoLib controllers every geo body shares ({@link MsmGeoEntity}, {@link MsmGeoAnimal}, {@link MsmGeoMonster};
 * ADR 0070 D2). Loaded only when GeckoLib is present.
 *
 * <p>Controllers: {@code msm_main} loops {@code walk} while moving and {@code idle} otherwise, with the definition's
 * transition ticks; {@code msm_triggered} plays animations on request and has every {@code idle}, {@code walk} and
 * {@code attack} name plus the {@code play_animation} names registered as triggerable. A {@code play_animation}
 * naming another controller gets a controller of that name (or adds to {@code msm_main}).
 */
final class GeoControllers {
    /** Controller for idle and walk loops. */
    static final String MAIN = EntityDefinition.MAIN_CONTROLLER;
    /** Controller that plays animations on request ({@code triggerAnim}, {@code play_animation}). */
    static final String TRIGGERED = EntityDefinition.TRIGGERED_CONTROLLER;

    private GeoControllers() {}

    /** Registers the controllers of {@code mob}'s definition. */
    static <T extends MsmMob & GeoEntity> void register(T mob, AnimatableManager.ControllerRegistrar controllers) {
        EntityDefinition def = mob.definition();
        EntityComponents.AnimatedModel model = def.components().animatedModel();
        RawAnimation idle = model.idle().map(n -> RawAnimation.begin().thenLoop(n)).orElse(null);
        RawAnimation walk = model.walk().map(n -> RawAnimation.begin().thenLoop(n)).orElse(null);
        Map<String, Set<String>> triggerable = def.triggerableAnimations();
        AnimationController<T> main = new AnimationController<>(MAIN, model.transitionTicks(), test -> {
            RawAnimation loop = test.isMoving() && walk != null ? walk : idle;
            return loop == null ? PlayState.STOP : test.setAndContinue(loop);
        });
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
}
