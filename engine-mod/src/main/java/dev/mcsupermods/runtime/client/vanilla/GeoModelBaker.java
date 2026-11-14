package dev.mcsupermods.runtime.client.vanilla;

import dev.mcsupermods.runtime.model.GeoMesh;
import dev.mcsupermods.runtime.model.GeoMesh.Bone;
import dev.mcsupermods.runtime.model.GeoMesh.BoxUv;
import dev.mcsupermods.runtime.model.GeoMesh.Cube;
import dev.mcsupermods.runtime.model.GeoMesh.Face;
import dev.mcsupermods.runtime.model.GeoMesh.FaceRect;
import dev.mcsupermods.runtime.model.GeoMesh.FaceUv;
import dev.mcsupermods.runtime.model.GeoMesh.Vec3;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.core.Direction;
import org.joml.Vector3fc;

/**
 * Builds vanilla {@link ModelPart}s from a {@link GeoMesh} (ADR 0072 D1). Client classes, but nothing is
 * drawn: the result is the unrendered tree the vanilla renderer (B295) poses and draws.
 *
 * <ul>
 * <li>The returned root has no cubes and no pose; root bones are its children.</li>
 * <li>One part per bone, named after the bone, at its pivot relative to the parent bone's pivot, with
 * its rest rotation (degrees to radians); the initial pose is that rest pose, so {@code resetPose} returns
 * to it.</li>
 * <li>A box-UV cube is a vanilla {@link ModelPart.Cube} built by its own constructor: vanilla's box layout
 * equals Bedrock's and GeckoLib's (sizes not floored, no texture inset). A box UV offset that is not a
 * whole number is laid out by this class instead, because the constructor takes whole-number offsets.</li>
 * <li>A per-face-UV cube is built by the constructor with only its drawn faces, then each polygon is
 * replaced by one with the same vertices (so the winding stays vanilla's) and the face's UVs; a vertex
 * takes the UV of the Blockbench face corner at its position, which also turns {@code uv_rotation}.</li>
 * <li>{@code inflate} grows the box ({@code CubeDeformation} semantics); {@code mirror} is the
 * constructor's flag for box UV and ignored for per-face UV, as in Bedrock.</li>
 * <li>A cube with its own rotation becomes a child part of its bone, named {@code <bone>#cube<n>} (n counts
 * the bone's cubes from 0), at the cube's pivot with the cube's rotation.</li>
 * </ul>
 *
 * <p>Vanilla's {@code ModelPart.createPartLookup()} (used by {@code AnimationDefinition.bake}) puts the
 * root under the name {@code root} first and keeps the first part of each name, so a bone called
 * {@code root} is not found through it; {@link Baked#bones()} maps every bone by its own name.
 */
public final class GeoModelBaker {
    private GeoModelBaker() {
    }

    /**
     * A baked model.
     *
     * @param root  the model root (no cubes, zero pose); pass it to an {@code EntityModel}
     * @param bones every bone's part by bone name
     */
    public record Baked(ModelPart root, Map<String, ModelPart> bones) {
    }

    /** Bakes a mesh. Never throws for a mesh {@code GeoMeshReader} produced. */
    public static Baked bake(GeoMesh mesh) {
        Map<String, Bone> byName = new LinkedHashMap<>();
        Map<String, List<Bone>> children = new LinkedHashMap<>();
        List<Bone> roots = new ArrayList<>();
        for (Bone bone : mesh.bones()) {
            byName.put(bone.name(), bone);
        }
        for (Bone bone : mesh.bones()) {
            if (bone.parent().isPresent() && byName.containsKey(bone.parent().get())) {
                children.computeIfAbsent(bone.parent().get(), k -> new ArrayList<>()).add(bone);
            } else {
                roots.add(bone);
            }
        }
        Map<String, ModelPart> parts = new LinkedHashMap<>();
        Map<String, ModelPart> rootChildren = new LinkedHashMap<>();
        for (Bone bone : roots) {
            rootChildren.put(bone.name(), bone(mesh, bone, Vec3.ZERO, children, parts));
        }
        ModelPart root = new ModelPart(List.of(), rootChildren);
        return new Baked(root, Collections.unmodifiableMap(parts));
    }

    private static ModelPart bone(GeoMesh mesh, Bone bone, Vec3 parentPivot, Map<String, List<Bone>> children,
            Map<String, ModelPart> parts) {
        List<ModelPart.Cube> cubes = new ArrayList<>();
        Map<String, ModelPart> childParts = new LinkedHashMap<>();
        int n = 0;
        for (Cube cube : bone.cubes()) {
            if (cube.rotated()) {
                ModelPart cubePart = new ModelPart(List.of(cube(mesh, cube, cube.pivot())), Map.of());
                pose(cubePart, cube.pivot(), bone.pivot(), cube.rotation());
                childParts.put(bone.name() + "#cube" + n, cubePart);
            } else {
                cubes.add(cube(mesh, cube, bone.pivot()));
            }
            n++;
        }
        for (Bone child : children.getOrDefault(bone.name(), List.of())) {
            childParts.put(child.name(), bone(mesh, child, bone.pivot(), children, parts));
        }
        ModelPart part = new ModelPart(cubes, childParts);
        pose(part, bone.pivot(), parentPivot, bone.rotation());
        parts.put(bone.name(), part);
        return part;
    }

    private static void pose(ModelPart part, Vec3 pivot, Vec3 parentPivot, Vec3 degrees) {
        PartPose pose = PartPose.offsetAndRotation(pivot.x() - parentPivot.x(), pivot.y() - parentPivot.y(),
                pivot.z() - parentPivot.z(), (float) Math.toRadians(degrees.x()), (float) Math.toRadians(degrees.y()),
                (float) Math.toRadians(degrees.z()));
        part.setInitialPose(pose);
        part.loadPose(pose);
    }

    /** One cube with its box relative to {@code origin} (the bone's or the cube's own pivot). */
    private static ModelPart.Cube cube(GeoMesh mesh, Cube cube, Vec3 origin) {
        float x = cube.min().x() - origin.x();
        float y = cube.min().y() - origin.y();
        float z = cube.min().z() - origin.z();
        Vec3 size = cube.size();
        float g = cube.inflate();
        float texW = mesh.textureWidth();
        float texH = mesh.textureHeight();
        if (cube.uv() instanceof BoxUv box && box.u() == Math.floor(box.u()) && box.v() == Math.floor(box.v())) {
            return new ModelPart.Cube((int) box.u(), (int) box.v(), x, y, z, size.x(), size.y(), size.z(), g, g, g,
                    cube.mirror(), texW, texH, EnumSet.allOf(Direction.class));
        }
        Map<Face, FaceRect> faces = switch (cube.uv()) {
            case BoxUv box -> boxRects(size, box.u(), box.v(), cube.mirror());
            case FaceUv faceUv -> faceUv.faces();
        };
        Set<Direction> visible = EnumSet.noneOf(Direction.class);
        for (Face face : faces.keySet()) {
            visible.add(direction(face));
        }
        ModelPart.Cube built = new ModelPart.Cube(0, 0, x, y, z, size.x(), size.y(), size.z(), g, g, g, false, texW,
                texH, visible);
        float[] lo = {x - g, y - g, z - g};
        float[] hi = {x + size.x() + g, y + size.y() + g, z + size.z() + g};
        for (Map.Entry<Face, FaceRect> entry : faces.entrySet()) {
            Vector3fc normal = direction(entry.getKey()).getUnitVec3f();
            for (int i = 0; i < built.polygons.length; i++) {
                ModelPart.Polygon polygon = built.polygons[i];
                if (polygon.normal().equals(normal)) {
                    built.polygons[i] = remap(polygon, corners(entry.getKey(), lo, hi), cornerUvs(entry.getValue()),
                            texW, texH);
                    break;
                }
            }
        }
        return built;
    }

    /**
     * The vanilla direction of the polygon that shows a Bedrock face. Java model space is Bedrock space
     * with x and y negated (about the feet), so east and west, and up and down, change places.
     */
    static Direction direction(Face face) {
        return switch (face) {
            case EAST -> Direction.WEST;
            case WEST -> Direction.EAST;
            case UP -> Direction.DOWN;
            case DOWN -> Direction.UP;
            case NORTH -> Direction.NORTH;
            case SOUTH -> Direction.SOUTH;
        };
    }

    /**
     * The four corners (top-left, top-right, bottom-left, bottom-right as seen from outside, Blockbench's
     * order) of a face of the box {@code lo..hi} in Java model space. Blockbench's minimum x and y are
     * Java's maximum x and y.
     */
    static float[][] corners(Face face, float[] lo, float[] hi) {
        float lx = lo[0];
        float ly = lo[1];
        float lz = lo[2];
        float hx = hi[0];
        float hy = hi[1];
        float hz = hi[2];
        return switch (face) {
            case EAST -> new float[][] {{lx, ly, hz}, {lx, ly, lz}, {lx, hy, hz}, {lx, hy, lz}};
            case WEST -> new float[][] {{hx, ly, lz}, {hx, ly, hz}, {hx, hy, lz}, {hx, hy, hz}};
            case UP -> new float[][] {{hx, ly, lz}, {lx, ly, lz}, {hx, ly, hz}, {lx, ly, hz}};
            case DOWN -> new float[][] {{hx, hy, hz}, {lx, hy, hz}, {hx, hy, lz}, {lx, hy, lz}};
            case SOUTH -> new float[][] {{hx, ly, hz}, {lx, ly, hz}, {hx, hy, hz}, {lx, hy, hz}};
            case NORTH -> new float[][] {{lx, ly, lz}, {hx, ly, lz}, {lx, hy, lz}, {hx, hy, lz}};
        };
    }

    /** Corner UVs (texture pixels) in corner order, turned by {@code uv_rotation} in 90 degree steps. */
    static float[][] cornerUvs(FaceRect rect) {
        float[][] arr = {{rect.u1(), rect.v1()}, {rect.u2(), rect.v1()}, {rect.u1(), rect.v2()},
                {rect.u2(), rect.v2()}};
        int rot = rect.rotation();
        while (rot > 0) {
            float[] a = arr[0];
            arr[0] = arr[2];
            arr[2] = arr[3];
            arr[3] = arr[1];
            arr[1] = a;
            rot -= 90;
        }
        return arr;
    }

    /** A polygon with the same vertices, each taking the UV of the nearest face corner. */
    private static ModelPart.Polygon remap(ModelPart.Polygon polygon, float[][] corners, float[][] uvs, float texW,
            float texH) {
        ModelPart.Vertex[] vertices = polygon.vertices();
        ModelPart.Vertex[] out = new ModelPart.Vertex[vertices.length];
        for (int i = 0; i < vertices.length; i++) {
            ModelPart.Vertex vertex = vertices[i];
            int best = 0;
            float bestDistance = Float.MAX_VALUE;
            for (int k = 0; k < corners.length; k++) {
                float dx = vertex.x() - corners[k][0];
                float dy = vertex.y() - corners[k][1];
                float dz = vertex.z() - corners[k][2];
                float distance = dx * dx + dy * dy + dz * dz;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = k;
                }
            }
            out[i] = vertex.remap(uvs[best][0] / texW, uvs[best][1] / texH);
        }
        return new ModelPart.Polygon(out, polygon.normal());
    }

    /**
     * Box UV rectangles (texture pixels) of a cube of {@code size} at offset {@code (u, v)}: the Bedrock and
     * vanilla layout, sizes not floored (as vanilla and GeckoLib); {@code mirror} flips each rectangle
     * horizontally and swaps east and west.
     */
    static Map<Face, FaceRect> boxRects(Vec3 size, float u, float v, boolean mirror) {
        float x = size.x();
        float y = size.y();
        float z = size.z();
        // face, from u, from v, size u, size v
        float[][] list = {
            {z + x, z, -x, -z}, // up
            {z + 2 * x, 0, -x, z}, // down
            {2 * z + x, z, x, y}, // south
            {z, z, x, y}, // north
            {0, z, z, y}, // east
            {z + x, z, z, y}, // west
        };
        Face[] order = {Face.UP, Face.DOWN, Face.SOUTH, Face.NORTH, Face.EAST, Face.WEST};
        if (mirror) {
            for (float[] entry : list) {
                entry[0] += entry[2];
                entry[2] *= -1;
            }
            float[] east = list[4];
            list[4] = list[5];
            list[5] = east;
        }
        Map<Face, FaceRect> out = new EnumMap<>(Face.class);
        for (int i = 0; i < order.length; i++) {
            float[] e = list[i];
            out.put(order[i], new FaceRect(e[0] + u, e[1] + v, e[0] + e[2] + u, e[1] + e[3] + v, 0));
        }
        return out;
    }
}
