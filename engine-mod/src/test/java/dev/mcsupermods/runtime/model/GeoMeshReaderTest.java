package dev.mcsupermods.runtime.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.model.GeoMesh.Bone;
import dev.mcsupermods.runtime.model.GeoMesh.BoxUv;
import dev.mcsupermods.runtime.model.GeoMesh.Cube;
import dev.mcsupermods.runtime.model.GeoMesh.Face;
import dev.mcsupermods.runtime.model.GeoMesh.FaceRect;
import dev.mcsupermods.runtime.model.GeoMesh.FaceUv;
import dev.mcsupermods.runtime.model.GeoMesh.Vec3;
import java.io.IOException;
import java.io.StringReader;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** {@link GeoMeshReader}: Java model space, defaults and the problems the preview baker also reports. */
class GeoMeshReaderTest {
    private static GeoMesh read(String bones) {
        return GeoMeshReader.read(JsonParser.parseString("{\"format_version\": \"1.12.0\", \"minecraft:geometry\": "
                + "[{\"description\": {\"identifier\": \"geometry.t\", \"texture_width\": 32, \"texture_height\": 16}, "
                + "\"bones\": " + bones + "}]}"));
    }

    @Test
    void sampleBipedReadsWithoutProblems() throws IOException {
        GeoMesh mesh = GeoParityTest.mesh("biped.geo.json");
        assertEquals(List.of(), mesh.problems());
        assertEquals(64, mesh.textureWidth());
        assertEquals(List.of("body", "head", "right_arm", "left_arm", "right_leg", "left_leg"),
                mesh.bones().stream().map(Bone::name).toList());
        Bone head = mesh.bones().get(1);
        assertEquals(Optional.of("body"), head.parent());
        // Bedrock pivot (0, 24, 0) is the Java model origin; the 8-pixel head cube spans y 24..32 in Bedrock.
        assertEquals(new Vec3(0, 0, 0), head.pivot());
        assertEquals(new Vec3(-4, -8, -4), head.cubes().getFirst().min());
        assertEquals(new Vec3(-5, 2, 0), mesh.bones().get(2).pivot());
        assertEquals(new BoxUv(0, 0), head.cubes().getFirst().uv());
    }

    @Test
    void javaSpaceKeepsXAndZAndFlipsYAboutTheFeet() {
        GeoMesh mesh = read("[{\"name\": \"a\", \"pivot\": [1, 2, 3], \"rotation\": [10, -20, 30], \"cubes\": [{"
                + "\"origin\": [1, 4, -2], \"size\": [2, 3, 4], \"uv\": [0, 0], \"pivot\": [1, 5, 0], "
                + "\"rotation\": [0, 45, 0]}]}]");
        Bone bone = mesh.bones().getFirst();
        assertEquals(new Vec3(1, 22, 3), bone.pivot());
        assertEquals(new Vec3(10, -20, 30), bone.rotation());
        Cube cube = bone.cubes().getFirst();
        assertEquals(new Vec3(1, 17, -2), cube.min());
        assertEquals(new Vec3(2, 3, 4), cube.size());
        assertEquals(new Vec3(1, 19, 0), cube.pivot());
        assertTrue(cube.rotated());
        assertEquals(32, mesh.textureWidth());
        assertEquals(16, mesh.textureHeight());
    }

    @Test
    void boneMirrorAndInflateAreCubeDefaults() {
        GeoMesh mesh = read("[{\"name\": \"a\", \"mirror\": true, \"inflate\": 0.5, \"cubes\": ["
                + "{\"origin\": [0, 0, 0], \"size\": [1, 1, 1], \"uv\": [0, 0]},"
                + "{\"origin\": [0, 0, 0], \"size\": [1, 1, 1], \"uv\": [0, 0], \"mirror\": false, \"inflate\": 0}]}]");
        List<Cube> cubes = mesh.bones().getFirst().cubes();
        assertTrue(cubes.get(0).mirror());
        assertEquals(0.5f, cubes.get(0).inflate());
        assertFalse(cubes.get(1).mirror());
        assertEquals(0f, cubes.get(1).inflate());
        assertFalse(cubes.get(0).rotated());
    }

    @Test
    void perFaceUvDefaultsAndUpDownSwap() {
        GeoMesh mesh = read("[{\"name\": \"a\", \"cubes\": [{\"origin\": [0, 0, 0], \"size\": [3, 2, 5], \"uv\": {"
                + "\"north\": {\"uv\": [1, 2]}, \"east\": {\"uv\": [4, 0], \"uv_size\": [1, 1], \"uv_rotation\": 90},"
                + "\"up\": {\"uv\": [10, 10]}, \"down\": {\"uv_size\": [1, 1]}}}]}]");
        FaceUv uv = assertInstanceOf(FaceUv.class, mesh.bones().getFirst().cubes().getFirst().uv());
        assertEquals(new FaceRect(1, 2, 4, 4, 0), uv.faces().get(Face.NORTH));
        assertEquals(new FaceRect(4, 0, 5, 1, 90), uv.faces().get(Face.EAST));
        // up: corners of [10, 10, 13, 15] swapped
        assertEquals(new FaceRect(13, 15, 10, 10, 0), uv.faces().get(Face.UP));
        // a face entry without uv is not drawn
        assertFalse(uv.faces().containsKey(Face.DOWN));
        assertFalse(uv.faces().containsKey(Face.SOUTH));
    }

    @Test
    void problemsAsThePreviewReportsThem() {
        GeoMesh mesh = read("[{\"name\": \"a\", \"parent\": \"c\"}, {\"name\": \"b\", \"parent\": \"zz\"},"
                + "{\"name\": \"a\"}, {\"name\": \"c\", \"parent\": \"a\", \"cubes\": [{\"origin\": [0, 0, 0], "
                + "\"size\": [1, 1, 1]}]}]");
        assertEquals(List.of("Duplicate bone \"a\" skipped.", "Bone \"b\" has an unknown parent \"zz\".",
                "Bone \"a\" is part of a parent cycle; drawn as a root bone.",
                "A cube of bone \"c\" has no UV; skipped."), mesh.problems());
        assertEquals(List.of(Optional.empty(), Optional.empty(), Optional.of("a")),
                mesh.bones().stream().map(Bone::parent).toList());
        assertEquals(List.of(), mesh.bones().get(2).cubes());
    }

    @Test
    void brokenFilesNeverThrow() {
        GeoMesh empty = GeoMeshReader.read(JsonParser.parseString("{}"));
        assertEquals(List.of("The model has no geometry."), empty.problems());
        assertEquals(64, empty.textureWidth());
        GeoMesh broken = GeoMeshReader.read(new StringReader("{\"minecraft:geometry\": ["));
        assertEquals(1, broken.problems().size());
        assertTrue(broken.problems().getFirst().startsWith("The model is not valid JSON"));
        GeoMesh odd = read("[{\"name\": 3, \"pivot\": [\"x\", 1], \"cubes\": [{\"uv\": [\"1\", 2]}]}, 7]");
        Bone bone = odd.bones().getFirst();
        assertEquals("", bone.name());
        assertEquals(new Vec3(0, 23, 0), bone.pivot());
        assertEquals(new BoxUv(0, 2), bone.cubes().getFirst().uv());
    }
}
