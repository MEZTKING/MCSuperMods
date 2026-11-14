package dev.mcsupermods.runtime.model;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * A Bedrock geometry (format 1.12.0, the file GeckoLib reads from {@code assets/<ns>/geckolib/models/})
 * in Java model space, as {@link GeoMeshReader} reads it (ADR 0072 D1). Pure data: no client classes.
 *
 * <p>Java model space is the space of vanilla {@code ModelPart}s: model pixels (16 per block), y pointing
 * down, the model's feet at y 24. A Bedrock point {@code (x, y, z)} is {@code (x, 24 - y, z)} here and a
 * Bedrock size keeps its value. A Bedrock rotation keeps its numbers: Blockbench and GeckoLib draw
 * Bedrock space with x mirrored and negate x and y rotations, and vanilla's {@code scale(-1, -1, 1)} of
 * a living entity turns Java model space into that same mirrored space, which negates x and y rotations
 * again (the two negations cancel). Rotations stay in degrees; the baker turns them into radians.
 *
 * @param textureWidth  {@code description.texture_width} (at least 1, default 64)
 * @param textureHeight {@code description.texture_height} (at least 1, default 64)
 * @param bones         bones in file order, duplicates dropped; parents always resolve or are empty
 * @param problems      what the reader could not take as written, one sentence each
 */
public record GeoMesh(float textureWidth, float textureHeight, List<Bone> bones, List<String> problems) {
    public GeoMesh {
        bones = List.copyOf(bones);
        problems = List.copyOf(problems);
    }

    /** A vector of three floats. */
    public record Vec3(float x, float y, float z) {
        public static final Vec3 ZERO = new Vec3(0, 0, 0);

        public boolean isZero() {
            return x == 0 && y == 0 && z == 0;
        }
    }

    /**
     * One bone.
     *
     * @param name     the bone's name, unique in the mesh
     * @param parent   the parent bone's name; empty for a root bone (also for an unknown parent or a cycle)
     * @param pivot    the pivot in Java model space (absolute, not relative to the parent)
     * @param rotation the rest rotation in degrees, Java signs (equal to the file's numbers)
     * @param cubes    the bone's cubes in file order (cubes without UV are dropped)
     */
    public record Bone(String name, Optional<String> parent, Vec3 pivot, Vec3 rotation, List<Cube> cubes) {
        public Bone {
            cubes = List.copyOf(cubes);
        }
    }

    /**
     * One cube. Its box spans {@code min} to {@code min + size}, grown by {@code inflate} on every side.
     *
     * @param min      the corner with the smallest coordinates in Java model space, before inflate
     * @param size     the size in model pixels, as written
     * @param inflate  growth on every side (the cube's own, else the bone's, else 0); UVs do not change
     * @param mirror   the box UV mirror flag (the cube's own, else the bone's); per-face UV ignores it
     * @param pivot    the cube's own pivot in Java model space; used only when {@code rotation} is not zero
     * @param rotation the cube's own rotation in degrees, Java signs; zero for none
     * @param uv       the cube's UV mapping
     */
    public record Cube(Vec3 min, Vec3 size, float inflate, boolean mirror, Vec3 pivot, Vec3 rotation, Uv uv) {
        public boolean rotated() {
            return !rotation.isZero();
        }
    }

    /** A cube's UV mapping: box UV at an offset, or one rectangle per face. */
    public sealed interface Uv permits BoxUv, FaceUv {
    }

    /**
     * Box UV: the vanilla and Bedrock layout from offset {@code (u, v)} in texture pixels.
     *
     * @param u horizontal offset
     * @param v vertical offset
     */
    public record BoxUv(float u, float v) implements Uv {
    }

    /**
     * Per-face UV: faces without an entry are not drawn.
     *
     * @param faces the drawn faces by the file's face name
     */
    public record FaceUv(Map<Face, FaceRect> faces) implements Uv {
        public FaceUv {
            faces = Map.copyOf(faces);
        }
    }

    /** The six faces by the file's names (Bedrock directions). */
    public enum Face {
        NORTH("north"), SOUTH("south"), EAST("east"), WEST("west"), UP("up"), DOWN("down");

        private final String key;

        Face(String key) {
            this.key = key;
        }

        /** The face's key in the file. */
        public String key() {
            return key;
        }
    }

    /**
     * A per-face UV rectangle in texture pixels, corner 1 to corner 2 as Blockbench reads it: for
     * {@code up} and {@code down} the corners of {@code [u, v, u + w, v + h]} are already swapped.
     *
     * @param u1       u of the top-left corner
     * @param v1       v of the top-left corner
     * @param u2       u of the bottom-right corner
     * @param v2       v of the bottom-right corner
     * @param rotation {@code uv_rotation} in degrees (0, 90, 180 or 270)
     */
    public record FaceRect(float u1, float v1, float u2, float v2, int rotation) {
    }
}
