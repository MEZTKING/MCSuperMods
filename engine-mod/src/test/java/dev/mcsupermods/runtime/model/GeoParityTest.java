package dev.mcsupermods.runtime.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.mcsupermods.runtime.client.vanilla.GeoModelBaker;
import dev.mcsupermods.runtime.model.GeoAnimationClip.BoneChannels;
import dev.mcsupermods.runtime.model.GeoAnimationClip.Keyframe;
import dev.mcsupermods.runtime.model.GeoMesh.Vec3;
import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import net.minecraft.client.model.geom.ModelPart;
import org.joml.Vector3f;
import org.junit.jupiter.api.Test;

/**
 * The cross-language geo golden (ADR 0072 D7): bakes {@code fixtures/geo-parity/} through
 * {@link GeoMeshReader} and {@link GeoModelBaker} into real vanilla {@code ModelPart}s (nothing is drawn),
 * walks them with vanilla's own {@code ModelPart.visit} under the living entity transform, and compares
 * every vertex with {@code expected-vertices.json}, which the app's preview baker writes
 * ({@code app/test/preview/geo-parity.test.ts}).
 *
 * <p>The living entity transform is read from {@code LivingEntityRenderer.submit} (26.3 and 26.4-snapshot-7,
 * {@code javap -c}): {@code scale(-1, -1, 1)}, the renderer's own {@code scale} (1 here), then
 * {@code translate(0, -1.501, 0)}. The body rotation ({@code 180 - yBodyRot} about y) comes before it and
 * is the same for GeckoLib, so it is left out. The golden is in Blockbench scene space (model pixels, x
 * mirrored), which is that world space times 16, except for vanilla's 0.001 block lift (1.501 rather than
 * 1.5), which is taken off here.
 *
 * <p>Two known differences are undone before comparing: the preview insets box UV faces by 1/64 pixel
 * against texture bleeding (vanilla and GeckoLib 5.5.7 do not), and the preview floors box UV sizes
 * (vanilla and GeckoLib do not; the fixtures use whole sizes for box UV).
 */
class GeoParityTest {
    private static final float TOLERANCE = 1e-4f;
    /** Vanilla's lift in model pixels: {@code (1.501 - 1.5) * 16}. */
    private static final float LIFT = 0.016f;

    static Path fixtures() {
        String property = System.getProperty("msm.geo.parity");
        return property != null ? Path.of(property) : Path.of("..", "fixtures", "geo-parity");
    }

    static GeoMesh mesh(String file) throws IOException {
        try (Reader reader = Files.newBufferedReader(fixtures().resolve(file))) {
            return GeoMeshReader.read(reader);
        }
    }

    static GeoAnimationReader.Result animations(String file) throws IOException {
        try (Reader reader = Files.newBufferedReader(fixtures().resolve(file))) {
            return GeoAnimationReader.read(reader);
        }
    }

    /** One drawn quad: four {@code x, y, z, u, v} in golden units. */
    record Quad(String label, float[][] vertices) {
    }

    @Test
    void bakedPartsMatchThePreviewBaker() throws IOException {
        JsonObject golden = JsonParser.parseString(Files.readString(fixtures().resolve("expected-vertices.json")))
                .getAsJsonObject();
        JsonArray models = golden.getAsJsonArray("models");
        assertEquals(3, models.size());
        for (JsonElement element : models) {
            JsonObject model = element.getAsJsonObject();
            String name = model.get("name").getAsString();
            GeoMesh mesh = mesh(model.get("geo").getAsString());
            assertEquals(List.of(), mesh.problems(), name);
            assertEquals(model.get("textureWidth").getAsFloat(), mesh.textureWidth(), name);
            assertEquals(model.get("textureHeight").getAsFloat(), mesh.textureHeight(), name);
            GeoModelBaker.Baked baked = GeoModelBaker.bake(mesh);
            if (model.has("animation")) {
                GeoAnimationReader.Result result = animations(model.get("animationFile").getAsString());
                GeoAnimationClip clip = result.clip(model.get("animation").getAsString());
                assertNotNull(clip, name);
                pose(baked, clip, model.get("time").getAsFloat());
            }
            compare(name, expected(model, mesh), actual(baked.root()));
        }
    }

    /** Applies a clip's linear sample at {@code time} the way vanilla's keyframe animations offset parts. */
    static void pose(GeoModelBaker.Baked baked, GeoAnimationClip clip, float time) {
        for (Map.Entry<String, BoneChannels> entry : clip.bones().entrySet()) {
            ModelPart part = baked.bones().get(entry.getKey());
            assertNotNull(part, entry.getKey());
            BoneChannels channels = entry.getValue();
            if (!channels.rotation().isEmpty()) {
                Vec3 r = sample(channels.rotation(), time);
                part.offsetRotation(new Vector3f((float) Math.toRadians(r.x()), (float) Math.toRadians(r.y()),
                        (float) Math.toRadians(r.z())));
            }
            if (!channels.position().isEmpty()) {
                Vec3 p = sample(channels.position(), time);
                part.offsetPos(new Vector3f(p.x(), p.y(), p.z()));
            }
            if (!channels.scale().isEmpty()) {
                Vec3 s = sample(channels.scale(), time);
                part.offsetScale(new Vector3f(s.x() - 1, s.y() - 1, s.z() - 1));
            }
        }
    }

    /** Linear sampling, held outside the keyframes (the preview's {@code evaluateChannel}). */
    static Vec3 sample(List<Keyframe> channel, float t) {
        Keyframe first = channel.getFirst();
        if (channel.size() == 1 || t <= first.time()) {
            return t < first.time() ? first.pre() : first.post();
        }
        for (int i = 1; i < channel.size(); i++) {
            Keyframe next = channel.get(i);
            if (t < next.time()) {
                Keyframe previous = channel.get(i - 1);
                float span = next.time() - previous.time();
                float f = span <= 0 ? 1 : (t - previous.time()) / span;
                Vec3 a = previous.post();
                Vec3 b = next.pre();
                return new Vec3(a.x() + (b.x() - a.x()) * f, a.y() + (b.y() - a.y()) * f, a.z() + (b.z() - a.z()) * f);
            }
        }
        return channel.getLast().post();
    }

    /** The golden's quads, with the preview's box UV inset undone. */
    static List<Quad> expected(JsonObject model, GeoMesh mesh) {
        List<Quad> out = new ArrayList<>();
        for (JsonElement element : model.getAsJsonArray("faces")) {
            JsonObject face = element.getAsJsonObject();
            JsonArray vertices = face.getAsJsonArray("vertices");
            float[][] quad = new float[4][];
            for (int i = 0; i < 4; i++) {
                JsonArray v = vertices.get(i).getAsJsonArray();
                quad[i] = new float[] {v.get(0).getAsFloat(), v.get(1).getAsFloat(), v.get(2).getAsFloat(),
                    v.get(3).getAsFloat(), v.get(4).getAsFloat()};
            }
            if (face.get("box").getAsBoolean()) {
                undoInset(quad, 3, 1 / 64f / mesh.textureWidth());
                undoInset(quad, 4, 1 / 64f / mesh.textureHeight());
            }
            out.add(new Quad(face.get("bone").getAsString() + " cube " + face.get("cube").getAsInt() + " "
                    + face.get("face").getAsString(), quad));
        }
        return out;
    }

    /** Moves each corner's coordinate {@code k} away from the face's centre by {@code margin}. */
    private static void undoInset(float[][] quad, int k, float margin) {
        float centre = 0;
        for (float[] v : quad) {
            centre += v[k] / 4;
        }
        for (float[] v : quad) {
            v[k] += v[k] < centre ? -margin : margin;
        }
    }

    /** Every polygon of the baked tree, through vanilla's own traversal and the living entity transform. */
    static List<Quad> actual(ModelPart root) {
        PoseStack stack = new PoseStack();
        stack.scale(-1.0f, -1.0f, 1.0f);
        stack.translate(0.0f, -1.501f, 0.0f);
        List<Quad> out = new ArrayList<>();
        root.visit(stack, (pose, path, index, cube) -> {
            for (ModelPart.Polygon polygon : cube.polygons) {
                ModelPart.Vertex[] vertices = polygon.vertices();
                float[][] quad = new float[vertices.length][];
                for (int i = 0; i < vertices.length; i++) {
                    ModelPart.Vertex v = vertices[i];
                    Vector3f p = pose.pose().transformPosition(v.worldX(), v.worldY(), v.worldZ(), new Vector3f());
                    quad[i] = new float[] {p.x * 16, p.y * 16 - LIFT, p.z * 16, v.u(), v.v()};
                }
                out.add(new Quad(path + " #" + index, quad));
            }
        });
        return out;
    }

    /** Every expected quad matches one baked polygon (corners in any order), and nothing is left over. */
    static void compare(String model, List<Quad> expected, List<Quad> actual) {
        assertEquals(expected.size(), actual.size(), model + ": number of drawn faces");
        List<Quad> left = new ArrayList<>(actual);
        for (Quad quad : expected) {
            Quad match = left.stream().filter(a -> sameCorners(quad.vertices(), a.vertices())).findFirst().orElse(null);
            if (match == null) {
                fail(model + ": no baked polygon matches " + quad.label() + " " + describe(quad.vertices())
                        + "; nearest by position: " + nearest(quad, left));
            }
            left.remove(match);
        }
        assertTrue(left.isEmpty());
    }

    static boolean sameCorners(float[][] expected, float[][] actual) {
        if (expected.length != actual.length) {
            return false;
        }
        boolean[] used = new boolean[actual.length];
        for (float[] e : expected) {
            boolean found = false;
            for (int i = 0; i < actual.length && !found; i++) {
                if (!used[i] && close(e, actual[i], 5)) {
                    used[i] = true;
                    found = true;
                }
            }
            if (!found) {
                return false;
            }
        }
        return true;
    }

    private static boolean close(float[] a, float[] b, int n) {
        for (int k = 0; k < n; k++) {
            if (Math.abs(a[k] - b[k]) > TOLERANCE) {
                return false;
            }
        }
        return true;
    }

    private static String nearest(Quad quad, List<Quad> candidates) {
        return candidates.stream()
                .filter(c -> {
                    float[][] positions = new float[c.vertices().length][];
                    for (int i = 0; i < positions.length; i++) {
                        positions[i] = c.vertices()[i];
                    }
                    for (float[] e : quad.vertices()) {
                        boolean any = false;
                        for (float[] a : positions) {
                            any |= close(e, a, 3);
                        }
                        if (!any) {
                            return false;
                        }
                    }
                    return true;
                })
                .map(c -> c.label() + " " + describe(c.vertices()))
                .findFirst().orElse("none at these positions");
    }

    private static String describe(float[][] quad) {
        StringBuilder out = new StringBuilder("[");
        for (float[] v : quad) {
            out.append(String.format(java.util.Locale.ROOT, "(%.4f %.4f %.4f | %.5f %.5f)", v[0], v[1], v[2], v[3], v[4]));
        }
        return out.append(']').toString();
    }
}
