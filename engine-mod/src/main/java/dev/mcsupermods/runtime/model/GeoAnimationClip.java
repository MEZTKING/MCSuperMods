package dev.mcsupermods.runtime.model;

import dev.mcsupermods.runtime.model.GeoMesh.Vec3;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One animation of a Bedrock animation file (format 1.8.0) in Java model space, as
 * {@link GeoAnimationReader} reads it (ADR 0072 D1). Pure data: no client classes.
 *
 * <p>Values follow {@link GeoMesh}'s space: rotations in degrees with the file's numbers (Java and
 * Bedrock rotation signs agree, see {@link GeoMesh}); positions in model pixels with y negated (Java
 * model space points y down); scales as factors, as written. Turning these into a vanilla
 * {@code AnimationDefinition} (radians, scale offsets of {@code factor - 1}) is the renderer's work (B295).
 *
 * @param name    the animation's key in the file
 * @param loop    the loop mode
 * @param length  {@code animation_length} in seconds, else the time of the last keyframe
 * @param bones   channels by bone name, in file order
 * @param molang  true when a value was a Molang expression (read as 0)
 */
public record GeoAnimationClip(String name, Loop loop, float length, Map<String, BoneChannels> bones,
        boolean molang) {
    public GeoAnimationClip {
        bones = Collections.unmodifiableMap(new LinkedHashMap<>(bones));
    }

    /** True when a keyframe uses {@code catmullrom}. */
    public boolean catmullrom() {
        return bones.values().stream().anyMatch(BoneChannels::catmullrom);
    }

    /** The Bedrock loop modes. */
    public enum Loop {
        /** {@code loop: false} or absent: plays once, then the rest pose shows. */
        PLAY_ONCE,
        /** {@code loop: true}. */
        LOOP,
        /** {@code loop: "hold_on_last_frame"}: plays once and keeps the last pose. */
        HOLD_ON_LAST_FRAME
    }

    /** Keyframe interpolation towards the next keyframe. */
    public enum Interpolation {
        LINEAR, CATMULLROM
    }

    /**
     * The channels of one bone; a channel is empty when the file has none.
     *
     * @param rotation rotation keyframes (degrees, Java signs)
     * @param position position keyframes (model pixels, y negated)
     * @param scale    scale keyframes (factors)
     */
    public record BoneChannels(List<Keyframe> rotation, List<Keyframe> position, List<Keyframe> scale) {
        public BoneChannels {
            rotation = List.copyOf(rotation);
            position = List.copyOf(position);
            scale = List.copyOf(scale);
        }

        /** True when a keyframe of any channel uses {@code catmullrom}. */
        public boolean catmullrom() {
            return List.of(rotation, position, scale).stream().flatMap(List::stream)
                    .anyMatch(k -> k.interpolation() == Interpolation.CATMULLROM);
        }
    }

    /**
     * One keyframe: the value approaching it ({@code pre}) and leaving it ({@code post}). A constant
     * channel (a vector instead of a time map) is one keyframe at time 0. Keyframes are sorted by time.
     *
     * @param time          seconds
     * @param pre           the value arriving at this keyframe
     * @param post          the value leaving this keyframe
     * @param interpolation the {@code lerp_mode} of this keyframe
     */
    public record Keyframe(float time, Vec3 pre, Vec3 post, Interpolation interpolation) {
    }
}
