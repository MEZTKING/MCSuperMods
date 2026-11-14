package dev.mcsupermods.runtime.registry;

import com.geckolib.animatable.GeoEntity;
import com.geckolib.animatable.instance.AnimatableInstanceCache;
import com.geckolib.animatable.manager.AnimatableManager;
import com.geckolib.util.GeckoLibUtil;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.level.Level;

/**
 * {@link MsmEntity} with GeckoLib animations, controllers from {@link GeoControllers}. Loaded only when GeckoLib is present
 * ({@link GeckolibEntities}); nothing outside the GeckoLib bridge refers to this class.
 */
public class MsmGeoEntity extends MsmEntity implements GeoEntity {
    /** Controller for idle and walk loops. */
    public static final String MAIN = GeoControllers.MAIN;
    /** Controller that plays animations on request ({@code triggerAnim}, {@code play_animation}). */
    public static final String TRIGGERED = GeoControllers.TRIGGERED;

    private final AnimatableInstanceCache cache = GeckoLibUtil.createInstanceCache(this);

    public MsmGeoEntity(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
    }

    @Override
    public void registerControllers(AnimatableManager.ControllerRegistrar controllers) {
        GeoControllers.register(this, controllers);
    }

    /** Moves {@code DATA_ANIM} on ({@code MobAnimations}) and triggers the GeckoLib animation, synced to tracking clients by GeckoLib. */
    @Override
    public void playAnimation(String controller, String animation) {
        super.playAnimation(controller, animation);
        triggerAnim(controller, animation);
    }

    @Override
    public AnimatableInstanceCache getAnimatableInstanceCache() {
        return cache;
    }
}
