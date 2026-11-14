package dev.mcsupermods.runtime.client.vanilla;

import dev.mcsupermods.runtime.model.GeoAnimationClip;
import dev.mcsupermods.runtime.model.GeoAnimationClip.BoneChannels;
import dev.mcsupermods.runtime.model.GeoAnimationClip.Keyframe;
import dev.mcsupermods.runtime.model.GeoAnimationClip.Loop;
import dev.mcsupermods.runtime.model.GeoMesh.Vec3;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import net.minecraft.client.animation.AnimationChannel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.KeyframeAnimation;
import net.minecraft.client.model.geom.ModelPart;
import org.joml.Vector3f;

/**
 * Turns a {@link GeoAnimationClip} (Java model space, degrees, scale factors) into vanilla keyframe animation
 * (ADR 0072 D1, D2). Client classes, nothing drawn: covered by JUnit.
 *
 * <ul>
 * <li>Rotations: degrees to radians, signs as read (the reader already gives Java signs; vanilla's
 * {@code KeyframeAnimations.degreeVec} is the same conversion).</li>
 * <li>Positions: model pixels as read. The reader already negated y, so vanilla's {@code posVec} (which negates y)
 * is <b>not</b> applied again.</li>
 * <li>Scales: the offset {@code factor - 1} (vanilla's {@code scaleVec}), because vanilla adds channel values to
 * the part's scale of 1.</li>
 * <li>{@code pre} and {@code post} map to vanilla's {@code preTarget} and {@code postTarget}; vanilla interpolates
 * from a keyframe's post to the next keyframe's pre, as Bedrock does. {@code lerp_mode} maps to
 * {@code LINEAR}/{@code CATMULLROM}; vanilla takes the mode of the keyframe it moves towards.</li>
 * <li>Before its first keyframe a Bedrock channel holds the first keyframe's {@code pre}; vanilla would show its
 * {@code post}, so a channel whose first keyframe is later than 0 gets a constant keyframe at 0 with that value.</li>
 * <li>Vanilla bakes through {@code ModelPart.createPartLookup()}, which reserves the name {@code root} and throws for
 * an unknown name. {@link #bake} therefore binds the channels to the bones of {@link GeoModelBaker.Baked#bones()}
 * under private keys on a lookup root of its own, so a bone named {@code root} animates and an unknown bone is only
 * reported.</li>
 * </ul>
 */
public final class GeoAnimationBaker {
    /** Prefix of the private bone keys; {@code #} never starts a bone name the baker binds (cube parts use {@code bone#cube}). */
    private static final String KEY_PREFIX = "#msm";

    private GeoAnimationBaker() {
    }

    /**
     * A baked animation.
     *
     * @param name      the clip's name
     * @param animation the vanilla animation bound to the model's parts; never {@code null}
     * @param loop      the clip's loop mode (vanilla only knows looping or not: play-once ends where the caller stops it)
     * @param length    the length in seconds (at least 0)
     * @param missing   bones the clip names that the model does not have (their channels are left out)
     */
    public record Baked(String name, KeyframeAnimation animation, Loop loop, float length, List<String> missing) {
        public Baked {
            missing = List.copyOf(missing);
        }

        /** True when a play-once animation has ended after {@code millis} and the rest pose shows. */
        public boolean ended(long millis) {
            return loop == Loop.PLAY_ONCE && millis > (long) (length * 1000f);
        }
    }

    /** The vanilla animation definition of a clip, its channels keyed by bone name through {@code key}. */
    public static AnimationDefinition definition(GeoAnimationClip clip, Function<String, String> key) {
        Map<String, List<AnimationChannel>> bones = new LinkedHashMap<>();
        for (Map.Entry<String, BoneChannels> entry : clip.bones().entrySet()) {
            String k = key.apply(entry.getKey());
            if (k == null) {
                continue;
            }
            List<AnimationChannel> channels = channels(entry.getValue());
            if (!channels.isEmpty()) {
                bones.put(k, channels);
            }
        }
        float length = Math.max(0f, clip.length());
        // A looping definition takes the elapsed time modulo its length; a length of 0 would give NaN.
        boolean looping = clip.loop() == Loop.LOOP && length > 0f;
        return new AnimationDefinition(length, looping, bones);
    }

    /** The vanilla channels of one bone: rotation, position, scale, each only when it has keyframes. */
    static List<AnimationChannel> channels(BoneChannels bone) {
        List<AnimationChannel> out = new ArrayList<>();
        if (!bone.rotation().isEmpty()) {
            out.add(new AnimationChannel(AnimationChannel.Targets.ROTATION, keyframes(bone.rotation(), Space.ROTATION)));
        }
        if (!bone.position().isEmpty()) {
            out.add(new AnimationChannel(AnimationChannel.Targets.POSITION, keyframes(bone.position(), Space.POSITION)));
        }
        if (!bone.scale().isEmpty()) {
            out.add(new AnimationChannel(AnimationChannel.Targets.SCALE, keyframes(bone.scale(), Space.SCALE)));
        }
        return out;
    }

    /** How a channel's values become vanilla's. */
    enum Space {
        /** Degrees to radians. */
        ROTATION,
        /** Model pixels, y already negated by the reader. */
        POSITION,
        /** Factor to offset from 1. */
        SCALE;

        Vector3f convert(Vec3 v) {
            return switch (this) {
                case ROTATION -> new Vector3f((float) Math.toRadians(v.x()), (float) Math.toRadians(v.y()),
                        (float) Math.toRadians(v.z()));
                case POSITION -> new Vector3f(v.x(), v.y(), v.z());
                case SCALE -> new Vector3f(v.x() - 1f, v.y() - 1f, v.z() - 1f);
            };
        }
    }

    /** Vanilla keyframes of one channel, sorted as read, with the leading hold keyframe when needed. */
    static net.minecraft.client.animation.Keyframe[] keyframes(List<Keyframe> keyframes, Space space) {
        List<net.minecraft.client.animation.Keyframe> out = new ArrayList<>();
        Keyframe first = keyframes.getFirst();
        if (first.time() > 0f) {
            Vector3f hold = space.convert(first.pre());
            out.add(new net.minecraft.client.animation.Keyframe(0f, hold, hold, AnimationChannel.Interpolations.LINEAR));
        }
        for (Keyframe k : keyframes) {
            out.add(new net.minecraft.client.animation.Keyframe(k.time(), space.convert(k.pre()), space.convert(k.post()),
                    switch (k.interpolation()) {
                        case LINEAR -> AnimationChannel.Interpolations.LINEAR;
                        case CATMULLROM -> AnimationChannel.Interpolations.CATMULLROM;
                    }));
        }
        return out.toArray(net.minecraft.client.animation.Keyframe[]::new);
    }

    /**
     * Bakes a clip against a model's bones ({@link GeoModelBaker.Baked#bones()}). Never throws for a clip
     * {@code GeoAnimationReader} produced; bones the model lacks are listed in {@link Baked#missing()}.
     */
    public static Baked bake(GeoAnimationClip clip, Map<String, ModelPart> bones) {
        Map<String, String> keys = new LinkedHashMap<>();
        Map<String, ModelPart> lookup = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        for (String bone : clip.bones().keySet()) {
            ModelPart part = bones.get(bone);
            if (part == null) {
                missing.add(bone);
                continue;
            }
            String key = KEY_PREFIX + keys.size();
            keys.put(bone, key);
            lookup.put(key, part);
        }
        AnimationDefinition definition = definition(clip, keys::get);
        // A lookup root of our own: its children are the animated bones under private keys. A ModelPart has no parent
        // link, so the parts stay children of the real model as well; nothing draws this root.
        KeyframeAnimation animation = definition.bake(new ModelPart(List.of(), lookup));
        return new Baked(clip.name(), animation, clip.loop(), Math.max(0f, clip.length()), missing);
    }
}
