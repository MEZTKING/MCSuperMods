package dev.mcsupermods.runtime.registry;

import com.geckolib.animatable.GeoEntity;
import com.geckolib.animatable.instance.AnimatableInstanceCache;
import com.geckolib.animatable.manager.AnimatableManager;
import com.geckolib.animation.AnimationController;
import com.geckolib.animation.RawAnimation;
import com.geckolib.animation.object.PlayState;
import com.geckolib.util.GeckoLibUtil;
import dev.mcsupermods.runtime.loader.EntitySpikeDefinition;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.level.Level;

/**
 * {@link MsmEntity} with GeckoLib animations. Loaded only when GeckoLib is present
 * ({@link GeckolibEntities}); nothing outside the GeckoLib bridge refers to this class.
 */
public class MsmGeoEntity extends MsmEntity implements GeoEntity {
    /** Controller for idle and walk loops. */
    public static final String MAIN = "msm_main";
    /** Controller that plays animations on request ({@code triggerAnim}, {@code play_animation}). */
    public static final String TRIGGERED = "msm_triggered";

    private final AnimatableInstanceCache cache = GeckoLibUtil.createInstanceCache(this);

    public MsmGeoEntity(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
    }

    @Override
    public void registerControllers(AnimatableManager.ControllerRegistrar controllers) {
        EntitySpikeDefinition.AnimatedModel model = definition().animatedModel().orElseThrow();
        RawAnimation idle = RawAnimation.begin().thenLoop(model.idle());
        RawAnimation walk = RawAnimation.begin().thenLoop(model.walk());
        controllers.add(new AnimationController<MsmGeoEntity>(MAIN, 2,
                test -> test.setAndContinue(test.isMoving() ? walk : idle)));
        // Triggerable animations are registered by name; the handler itself plays nothing.
        controllers.add(new AnimationController<MsmGeoEntity>(TRIGGERED, 0, test -> PlayState.STOP)
                .triggerableAnim(model.attack(), RawAnimation.begin().thenPlay(model.attack()))
                .triggerableAnim(model.idle(), RawAnimation.begin().thenPlay(model.idle()))
                .triggerableAnim(model.walk(), RawAnimation.begin().thenPlay(model.walk())));
    }

    @Override
    public AnimatableInstanceCache getAnimatableInstanceCache() {
        return cache;
    }
}
