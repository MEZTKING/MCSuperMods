package dev.mcsupermods.runtime.client.vanilla;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.model.GeoAnimationClip;
import dev.mcsupermods.runtime.model.GeoAnimationReader;
import dev.mcsupermods.runtime.model.GeoMeshReader;
import java.util.List;
import java.util.Map;
import net.minecraft.client.animation.AnimationChannel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.Keyframe;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;
import org.junit.jupiter.api.Test;

/**
 * {@link GeoAnimationBaker}: Bedrock keyframes (as {@code GeoAnimationReader} reads them) to vanilla keyframe
 * animation: times, degrees to radians, sign rules, scale offsets, pre and post, catmullrom, loop modes, and binding to
 * {@link GeoModelBaker} bones including one named {@code root}.
 */
class GeoAnimationBakerTest {
    private static final float EPS = 1e-5f;

    private static GeoAnimationClip clip(String name, String body) {
        GeoAnimationReader.Result result = GeoAnimationReader.read(JsonParser.parseString(
                "{\"format_version\": \"1.8.0\", \"animations\": {\"" + name + "\": " + body + "}}"));
        return result.clip(name);
    }

    private static GeoModelBaker.Baked model() {
        return GeoModelBaker.bake(GeoMeshReader.read(JsonParser.parseString("""
                {"format_version": "1.12.0", "minecraft:geometry": [{
                  "description": {"identifier": "geometry.t", "texture_width": 64, "texture_height": 64},
                  "bones": [
                    {"name": "root", "pivot": [0, 0, 0], "cubes": [{"origin": [-1, 0, -1], "size": [2, 2, 2], "uv": [0, 0]}]},
                    {"name": "leg", "parent": "root", "pivot": [0, 6, 0], "rotation": [10, 0, 0]}
                  ]}]}
                """)));
    }

    private static void assertVec(float x, float y, float z, org.joml.Vector3fc actual) {
        assertEquals(x, actual.x(), EPS, "x");
        assertEquals(y, actual.y(), EPS, "y");
        assertEquals(z, actual.z(), EPS, "z");
    }

    private static List<AnimationChannel> channels(AnimationDefinition definition, String bone) {
        return definition.boneAnimations().get(bone);
    }

    @Test
    void rotationDegreesBecomeRadiansWithTheFileSigns() {
        GeoAnimationClip clip = clip("a", "{\"loop\": true, \"bones\": {\"leg\": {\"rotation\": {\"0\": [0, 0, 0], \"0.5\": [90, -45, 30]}}}}");
        AnimationDefinition definition = GeoAnimationBaker.definition(clip, b -> b);
        List<AnimationChannel> leg = channels(definition, "leg");
        assertEquals(1, leg.size());
        assertSame(AnimationChannel.Targets.ROTATION, leg.getFirst().target());
        Keyframe[] k = leg.getFirst().keyframes();
        assertEquals(2, k.length);
        assertEquals(0f, k[0].timestamp());
        assertEquals(0.5f, k[1].timestamp());
        assertVec(Mth.HALF_PI, (float) Math.toRadians(-45), (float) Math.toRadians(30), k[1].postTarget());
        assertSame(AnimationChannel.Interpolations.LINEAR, k[1].interpolation());
        assertTrue(definition.looping());
        assertEquals(0.5f, definition.lengthInSeconds());
    }

    @Test
    void positionsKeepTheReadersNegatedYAndNoSecondPosVec() {
        // Bedrock position y 2 (up) is -2 in Java model space after the reader; the baker keeps it.
        GeoAnimationClip clip = clip("a", "{\"bones\": {\"leg\": {\"position\": {\"0\": [1, 2, 3]}}}}");
        Keyframe k = channels(GeoAnimationBaker.definition(clip, b -> b), "leg").getFirst().keyframes()[0];
        assertVec(1, -2, 3, k.postTarget());
    }

    @Test
    void scalesBecomeOffsetsFromOne() {
        GeoAnimationClip clip = clip("a", "{\"bones\": {\"leg\": {\"scale\": {\"0\": [1, 1, 1], \"1\": [2, 0.5, 1.5]}}}}");
        AnimationChannel channel = channels(GeoAnimationBaker.definition(clip, b -> b), "leg").getFirst();
        assertSame(AnimationChannel.Targets.SCALE, channel.target());
        assertVec(0, 0, 0, channel.keyframes()[0].postTarget());
        assertVec(1, -0.5f, 0.5f, channel.keyframes()[1].postTarget());
    }

    @Test
    void preAndPostAndCatmullrom() {
        GeoAnimationClip clip = clip("a", """
                {"bones": {"leg": {"rotation": {
                  "0": {"post": [0, 0, 0], "lerp_mode": "catmullrom"},
                  "1": {"pre": [10, 0, 0], "post": [20, 0, 0], "lerp_mode": "catmullrom"},
                  "2": [40, 0, 0]
                }}}}
                """);
        Keyframe[] k = channels(GeoAnimationBaker.definition(clip, b -> b), "leg").getFirst().keyframes();
        assertEquals(3, k.length);
        assertVec((float) Math.toRadians(10), 0, 0, k[1].preTarget());
        assertVec((float) Math.toRadians(20), 0, 0, k[1].postTarget());
        assertSame(AnimationChannel.Interpolations.CATMULLROM, k[0].interpolation());
        assertSame(AnimationChannel.Interpolations.CATMULLROM, k[1].interpolation());
        assertSame(AnimationChannel.Interpolations.LINEAR, k[2].interpolation());
    }

    @Test
    void aChannelStartingLaterHoldsItsFirstPreFromZero() {
        GeoAnimationClip clip = clip("a", "{\"bones\": {\"leg\": {\"rotation\": {\"0.25\": {\"pre\": [30, 0, 0], \"post\": [60, 0, 0]}}}}}");
        Keyframe[] k = channels(GeoAnimationBaker.definition(clip, b -> b), "leg").getFirst().keyframes();
        assertEquals(2, k.length);
        assertEquals(0f, k[0].timestamp());
        assertVec((float) Math.toRadians(30), 0, 0, k[0].preTarget());
        assertVec((float) Math.toRadians(30), 0, 0, k[0].postTarget());
        assertEquals(0.25f, k[1].timestamp());
    }

    @Test
    void loopModes() {
        assertFalse(GeoAnimationBaker.definition(clip("a", "{\"loop\": false, \"animation_length\": 1, \"bones\": {}}"), b -> b).looping());
        assertFalse(GeoAnimationBaker.definition(clip("a", "{\"loop\": \"hold_on_last_frame\", \"animation_length\": 1, \"bones\": {}}"), b -> b).looping());
        // A looping animation of length 0 would take the time modulo 0; it plays as not looping.
        assertFalse(GeoAnimationBaker.definition(clip("a", "{\"loop\": true, \"bones\": {}}"), b -> b).looping());
    }

    @Test
    void bakesAgainstABoneNamedRootAndReportsMissingBones() {
        GeoModelBaker.Baked model = model();
        GeoAnimationClip clip = clip("a", """
                {"loop": true, "animation_length": 1, "bones": {
                  "root": {"rotation": {"0": [0, 0, 0], "1": [90, 0, 0]}},
                  "leg": {"position": [0, 3, 0]},
                  "wing": {"rotation": [5, 0, 0]}
                }}
                """);
        GeoAnimationBaker.Baked baked = GeoAnimationBaker.bake(clip, model.bones());
        assertEquals(List.of("wing"), baked.missing());
        ModelPart root = model.bones().get("root");
        ModelPart leg = model.bones().get("leg");
        float legRestY = leg.y;
        float legRestXRot = leg.xRot;
        baked.animation().apply(500L, 1f);
        // Halfway between 0 and 90 degrees, added to the rest rotation 0.
        assertEquals(Mth.HALF_PI / 2, root.xRot, EPS);
        // Position offsets add to the rest pose; y up in the file is -y in Java model space.
        assertEquals(legRestY - 3, leg.y, EPS);
        assertEquals(legRestXRot, leg.xRot, EPS);
        model.root().getAllParts().forEach(ModelPart::resetPose);
        assertEquals(0f, root.xRot, EPS);
        // Looping: 1.5 s plays as 0.5 s.
        baked.animation().apply(1500L, 0.5f);
        assertEquals(Mth.HALF_PI / 4, root.xRot, EPS);
    }

    @Test
    void catmullromAppliesVanillasSpline() {
        GeoModelBaker.Baked model = model();
        GeoAnimationClip clip = clip("a", """
                {"bones": {"root": {"rotation": {
                  "0": {"post": [0, 0, 0], "lerp_mode": "catmullrom"},
                  "1": {"post": [30, 0, 0], "lerp_mode": "catmullrom"},
                  "2": {"post": [90, 0, 0], "lerp_mode": "catmullrom"}
                }}}}
                """);
        GeoAnimationBaker.Baked baked = GeoAnimationBaker.bake(clip, model.bones());
        baked.animation().apply(500L, 1f);
        float expected = Mth.catmullrom(0.5f, 0f, 0f, (float) Math.toRadians(30), (float) Math.toRadians(90));
        assertEquals(expected, model.bones().get("root").xRot, EPS);
    }

    @Test
    void playOnceEndsHoldOnLastFrameDoesNot() {
        Map<String, ModelPart> bones = model().bones();
        GeoAnimationBaker.Baked once = GeoAnimationBaker.bake(clip("a", "{\"animation_length\": 0.5, \"bones\": {\"root\": {\"rotation\": [10, 0, 0]}}}"), bones);
        assertFalse(once.ended(500L));
        assertTrue(once.ended(501L));
        GeoAnimationBaker.Baked hold = GeoAnimationBaker.bake(clip("a", "{\"loop\": \"hold_on_last_frame\", \"animation_length\": 0.5, \"bones\": {\"root\": {\"rotation\": [10, 0, 0]}}}"), bones);
        assertFalse(hold.ended(10_000L));
        GeoAnimationBaker.Baked loop = GeoAnimationBaker.bake(clip("a", "{\"loop\": true, \"animation_length\": 0.5, \"bones\": {\"root\": {\"rotation\": [10, 0, 0]}}}"), bones);
        assertFalse(loop.ended(10_000L));
    }
}
