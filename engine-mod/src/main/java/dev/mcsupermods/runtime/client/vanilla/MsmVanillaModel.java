package dev.mcsupermods.runtime.client.vanilla;

import java.util.List;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.world.entity.AnimationState;

/**
 * The vanilla model of one runtime mob type (ADR 0072 D1, D2): the {@link GeoModelBaker} tree and the baked
 * animations of {@code msm:animated_model}.
 *
 * <p>Each frame, after the reset to the rest pose: the saddle bone is shown only while saddled; the main loop is
 * {@code sit} while sitting, else {@code fly} while flying, else {@code swim} while swimming (ADR 0071 D6), each only
 * when the definition names it; otherwise {@code walk} through vanilla's {@code applyWalk} (weighted by the walk
 * speed) and {@code idle} with the rest of the weight, so a standing mob plays idle fully and a walking mob walk
 * fully. Triggered animations ({@code attack}, {@code shoot}, {@code play_animation}) are applied on top through
 * their own {@link AnimationState}s. Vanilla adds every channel to the rest pose, as GeckoLib does.
 */
public class MsmVanillaModel extends EntityModel<MsmVanillaRenderState> {
    /** {@code applyWalk}'s position scale: 1 plays the walk loop at real time at full walking speed. */
    static final float WALK_POS_SCALE = 1.0f;
    /** {@code applyWalk}'s speed scale: the walk weight is {@code min(walkAnimationSpeed × this, 1)}. */
    static final float WALK_SPEED_SCALE = 2.5f;

    /**
     * The animations a model plays; any may be {@code null} when the definition does not name it or the file lacks it.
     *
     * @param idle      the idle loop
     * @param walk      the walk loop
     * @param sit       the sitting loop
     * @param fly       the flying loop
     * @param swim      the swimming loop
     * @param triggered the triggerable animations in {@code DATA_ANIM} index order ({@code null} for a name the file
     *                  lacks)
     */
    public record Animations(GeoAnimationBaker.Baked idle, GeoAnimationBaker.Baked walk, GeoAnimationBaker.Baked sit,
            GeoAnimationBaker.Baked fly, GeoAnimationBaker.Baked swim, List<GeoAnimationBaker.Baked> triggered) {
        /** No animations at all. */
        public static final Animations NONE = new Animations(null, null, null, null, null, List.of());
    }

    private final ModelPart saddle;
    private final Animations animations;

    /**
     * @param root       the baked model root ({@link GeoModelBaker.Baked#root()})
     * @param saddle     the {@code saddle_bone} part, or {@code null}
     * @param animations the baked animations
     */
    public MsmVanillaModel(ModelPart root, ModelPart saddle, Animations animations) {
        super(root);
        this.saddle = saddle;
        this.animations = animations;
    }

    /** A model that draws nothing, for missing or broken files. */
    public static MsmVanillaModel empty() {
        return new MsmVanillaModel(new ModelPart(List.of(), java.util.Map.of()), null, Animations.NONE);
    }

    public Animations animations() {
        return animations;
    }

    @Override
    public void setupAnim(MsmVanillaRenderState state) {
        super.setupAnim(state);
        if (saddle != null) {
            saddle.visible = state.saddled;
        }
        float age = state.ageInTicks;
        long millis = (long) (age * 50f);
        GeoAnimationBaker.Baked main = mainLoop(state);
        if (main != null) {
            main.animation().apply(millis, 1f);
        } else {
            float walkWeight = 0f;
            if (animations.walk() != null) {
                walkWeight = Math.min(state.walkAnimationSpeed * WALK_SPEED_SCALE, 1f);
                animations.walk().animation().applyWalk(state.walkAnimationPos, state.walkAnimationSpeed,
                        WALK_POS_SCALE, WALK_SPEED_SCALE);
            }
            if (animations.idle() != null && walkWeight < 1f) {
                animations.idle().animation().apply(millis, 1f - walkWeight);
            }
        }
        List<GeoAnimationBaker.Baked> triggered = animations.triggered();
        for (int i = 0; i < triggered.size() && i < state.triggered.length; i++) {
            GeoAnimationBaker.Baked clip = triggered.get(i);
            AnimationState animationState = state.triggered[i];
            if (clip != null && animationState != null && animationState.isStarted()
                    && !clip.ended(animationState.getTimeInMillis(age))) {
                clip.animation().apply(animationState, age);
            }
        }
    }

    /** The state loop that replaces idle and walk this frame (ADR 0071 D6 order), or {@code null}. */
    GeoAnimationBaker.Baked mainLoop(MsmVanillaRenderState state) {
        if (state.sitting && animations.sit() != null) {
            return animations.sit();
        }
        if (state.flying && animations.fly() != null) {
            return animations.fly();
        }
        if (state.swimming && animations.swim() != null) {
            return animations.swim();
        }
        return null;
    }
}
