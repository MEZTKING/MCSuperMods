package dev.mcsupermods.runtime.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.model.GeoAnimationClip.BoneChannels;
import dev.mcsupermods.runtime.model.GeoAnimationClip.Interpolation;
import dev.mcsupermods.runtime.model.GeoAnimationClip.Keyframe;
import dev.mcsupermods.runtime.model.GeoAnimationClip.Loop;
import dev.mcsupermods.runtime.model.GeoMesh.Vec3;
import java.io.IOException;
import java.io.StringReader;
import java.util.List;
import org.junit.jupiter.api.Test;

/** {@link GeoAnimationReader}: keyframe forms, loop modes, Molang and Java model space signs. */
class GeoAnimationReaderTest {
    private static GeoAnimationReader.Result read(String animations) {
        return GeoAnimationReader.read(JsonParser.parseString("{\"format_version\": \"1.8.0\", \"animations\": "
                + animations + "}"));
    }

    @Test
    void fixtureClips() throws IOException {
        GeoAnimationReader.Result result = GeoParityTest.animations("features.animation.json");
        assertEquals(List.of("pose_check", "features", "once"),
                result.clips().stream().map(GeoAnimationClip::name).toList());
        assertEquals(List.of("Animation \"features\" uses Molang; those values are read as 0."), result.problems());

        GeoAnimationClip pose = result.clip("pose_check");
        assertEquals(Loop.LOOP, pose.loop());
        assertEquals(1f, pose.length());
        assertFalse(pose.molang());
        assertFalse(pose.catmullrom());
        // A constant vector channel is one keyframe at 0.
        assertEquals(List.of(new Keyframe(0, new Vec3(0, 15, -10), new Vec3(0, 15, -10), Interpolation.LINEAR)),
                pose.bones().get("wing").rotation());
        // Positions point y down in Java model space.
        assertEquals(new Vec3(2, -4, -6), pose.bones().get("base").position().get(1).post());
        assertEquals(new Vec3(1.5f, 0.5f, 2), pose.bones().get("tip").scale().get(1).post());

        GeoAnimationClip features = result.clip("features");
        assertEquals(Loop.HOLD_ON_LAST_FRAME, features.loop());
        assertEquals(2f, features.length());
        assertTrue(features.molang());
        assertTrue(features.catmullrom());
        List<Keyframe> neck = features.bones().get("neck").rotation();
        assertEquals(3, neck.size());
        // A post-only keyframe uses post for pre too.
        assertEquals(new Keyframe(0, new Vec3(0, 0, 0), new Vec3(0, 0, 0), Interpolation.CATMULLROM), neck.get(0));
        assertEquals(new Keyframe(1, new Vec3(10, 0, 0), new Vec3(20, 0, 0), Interpolation.CATMULLROM), neck.get(1));
        // Molang reads as 0; a string that is a plain number is a number.
        assertEquals(new Keyframe(2, new Vec3(0, 1.5f, 0), new Vec3(0, 1.5f, 0), Interpolation.LINEAR), neck.get(2));
        // Keyframes sorted by time; one number is all three axes (then y negated for a position).
        List<Keyframe> base = features.bones().get("base").position();
        assertEquals(List.of(0f, 0.5f), base.stream().map(Keyframe::time).toList());
        assertEquals(new Vec3(0, -1, 0), base.get(0).post());
        assertEquals(new Vec3(2, -2, 2), base.get(1).post());

        GeoAnimationClip once = result.clip("once");
        assertEquals(Loop.PLAY_ONCE, once.loop());
        // No animation_length: the last keyframe's time.
        assertEquals(1f, once.length());
        assertEquals(new Vec3(1.25f, 1.25f, 1.25f), once.bones().get("wing").scale().get(1).post());
        assertEquals(List.of(), once.bones().get("wing").rotation());
    }

    @Test
    void oddValuesAreSkippedNotThrown() {
        GeoAnimationReader.Result result = read("{\"a\": {\"loop\": \"yes\", \"animation_length\": -1, \"bones\": {"
                + "\"b\": {\"rotation\": {\"x\": [1, 2, 3], \"0.5\": [1, 2, 3], \"1\": {\"pre\": true}, \"2\": null},"
                + " \"position\": true}, \"c\": 4}}, \"d\": 5}");
        assertEquals(List.of(), result.problems());
        GeoAnimationClip a = result.clip("a");
        assertNotNull(a);
        assertEquals(Loop.PLAY_ONCE, a.loop());
        assertEquals(0.5f, a.length());
        BoneChannels b = a.bones().get("b");
        assertEquals(List.of(0.5f), b.rotation().stream().map(Keyframe::time).toList());
        assertEquals(List.of(), b.position());
        assertEquals(List.of("b"), List.copyOf(a.bones().keySet()));
        assertEquals(1, result.clips().size());
    }

    @Test
    void brokenFilesNeverThrow() {
        assertEquals(List.of("The animation file has no animations."),
                GeoAnimationReader.read(JsonParser.parseString("[]")).problems());
        GeoAnimationReader.Result broken = GeoAnimationReader.read(new StringReader("{\"animations\": {"));
        assertTrue(broken.problems().getFirst().startsWith("The animation file is not valid JSON"));
        assertEquals(List.of(), broken.clips());
    }
}
