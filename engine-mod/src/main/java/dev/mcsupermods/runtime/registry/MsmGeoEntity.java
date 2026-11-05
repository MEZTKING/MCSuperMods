package dev.mcsupermods.runtime.registry;

import com.geckolib.animatable.GeoEntity;
import com.geckolib.animatable.instance.AnimatableInstanceCache;
import com.geckolib.animatable.manager.AnimatableManager;
import com.geckolib.animation.AnimationController;
import com.geckolib.animation.RawAnimation;
import com.geckolib.animation.object.PlayState;
import com.geckolib.util.GeckoLibUtil;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import java.util.Map;
import java.util.Set;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.level.Level;

/**
 * {@link MsmEntity} with GeckoLib animations. Loaded only when GeckoLib is present
 * ({@link GeckolibEntities}); nothing outside the GeckoLib bridge refers to this class.
 *
 * <p>Controllers: {@code msm_main} loops {@code walk} while moving and {@code idle} otherwise, with
 * the definition's transition ticks; {@code msm_triggered} plays animations on request and has every
 * {@code idle}, {@code walk} and {@code attack} name plus the {@code play_animation} names registered
 * as triggerable. A {@code play_animation} naming another controller gets a controller of that name
 * (or adds to {@code msm_main}).
 */
public class MsmGeoEntity extends MsmEntity implements GeoEntity {
    /** Controller for idle and walk loops. */
    public static final String MAIN = EntityDefinition.MAIN_CONTROLLER;
    /** Controller that plays animations on request ({@code triggerAnim}, {@code play_animation}). */
    public static final String TRIGGERED = EntityDefinition.TRIGGERED_CONTROLLER;

    private final AnimatableInstanceCache cache = GeckoLibUtil.createInstanceCache(this);

    public MsmGeoEntity(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
    }

    @Override
    public void registerControllers(AnimatableManager.ControllerRegistrar controllers) {
        EntityDefinition def = definition();
        EntityComponents.AnimatedModel model = def.components().animatedModel();
        RawAnimation idle = model.idle().map(n -> RawAnimation.begin().thenLoop(n)).orElse(null);
        RawAnimation walk = model.walk().map(n -> RawAnimation.begin().thenLoop(n)).orElse(null);
        Map<String, Set<String>> triggerable = def.triggerableAnimations();
        AnimationController<MsmGeoEntity> main = new AnimationController<>(MAIN, model.transitionTicks(), test -> {
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
            AnimationController<MsmGeoEntity> controller = new AnimationController<>(entry.getKey(), 0, test -> PlayState.STOP);
            addTriggerable(controller, entry.getValue());
            controllers.add(controller);
        }
    }

    private static void addTriggerable(AnimationController<MsmGeoEntity> controller, Set<String> names) {
        for (String name : names) {
            controller.triggerableAnim(name, RawAnimation.begin().thenPlay(name));
        }
    }

    /** Triggers a GeckoLib animation; synced to tracking clients by GeckoLib. */
    @Override
    public void playAnimation(String controller, String animation) {
        triggerAnim(controller, animation);
    }

    @Override
    public AnimatableInstanceCache getAnimatableInstanceCache() {
        return cache;
    }
}
