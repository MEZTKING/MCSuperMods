package dev.mcsupermods.runtime.registry.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/**
 * The portal index (ADR 0077 D5) without a game: its closed saved form (the attachment {@code msm_runtime:portals} is
 * saved through this Codec, so a round trip stands in for a save and load), replacing overlapping entries, and the
 * order and radius of {@link PortalIndex#candidates}.
 */
class PortalIndexTest {
    private static final Identifier SKY = Identifier.fromNamespaceAndPath("msm_test", "sky_portal");
    private static final Identifier EMBER = Identifier.fromNamespaceAndPath("msm_test", "ember_portal");

    private static PortalIndex.Entry entry(Identifier block, int x, int y, int z, Direction.Axis axis, int width, int height) {
        return new PortalIndex.Entry(block, new BlockPos(x, y, z), axis, width, height);
    }

    private static final PortalIndex INDEX = new PortalIndex(List.of(
            entry(SKY, 100, 64, 0, Direction.Axis.X, 2, 3),
            entry(SKY, 0, 70, 0, Direction.Axis.Z, 4, 5),
            entry(EMBER, -3, 10, 7, Direction.Axis.X, 21, 21)));

    private static DataResult<PortalIndex> decode(String json) {
        return PortalIndex.CODEC.parse(JsonOps.INSTANCE, JsonParser.parseString(json));
    }

    private static String error(String json) {
        return decode(json).error().orElseThrow(() -> new AssertionError("decoded: " + json)).message();
    }

    @Test
    void roundTripsThroughNbtAndJson() {
        Tag nbt = PortalIndex.CODEC.encodeStart(NbtOps.INSTANCE, INDEX).getOrThrow();
        assertEquals(INDEX, PortalIndex.CODEC.parse(NbtOps.INSTANCE, nbt).getOrThrow());
        JsonElement json = PortalIndex.CODEC.encodeStart(JsonOps.INSTANCE, INDEX).getOrThrow();
        assertEquals(INDEX, PortalIndex.CODEC.parse(JsonOps.INSTANCE, json).getOrThrow());
        assertEquals("{\"block\":\"msm_test:ember_portal\",\"min\":[-3,10,7],\"axis\":\"x\",\"width\":21,\"height\":21}",
                json.getAsJsonArray().get(0).toString());
    }

    @Test
    void entriesAreSortedSoTheSavedFormIsStable() {
        PortalIndex reversed = new PortalIndex(INDEX.entries().reversed());
        assertEquals(INDEX, reversed);
        assertEquals(List.of(EMBER, SKY, SKY), INDEX.entries().stream().map(PortalIndex.Entry::block).toList());
        assertEquals(0, INDEX.entries().get(1).min().getX());
    }

    @Test
    void savedFormIsClosed() {
        assertTrue(error("[{\"block\":\"a:b\",\"min\":[0,0,0],\"axis\":\"x\",\"width\":2,\"height\":3,\"radius\":4}]")
                .contains("radius: unknown field"));
        assertTrue(error("[{\"block\":\"a:b\",\"min\":[0,0,0],\"axis\":\"y\",\"width\":2,\"height\":3}]").contains("axis"));
        assertTrue(error("[{\"block\":\"a:b\",\"min\":[0,0,0],\"axis\":\"z\",\"width\":1,\"height\":3}]").contains("width"));
        assertTrue(error("[{\"block\":\"a:b\",\"min\":[0,0,0],\"axis\":\"z\",\"width\":2,\"height\":22}]").contains("height"));
        assertTrue(error("[{\"block\":\"a:b\",\"axis\":\"z\",\"width\":2,\"height\":3}]").contains("min"));
        assertEquals(PortalIndex.EMPTY, decode("[]").getOrThrow());
    }

    @Test
    void withReplacesAnOverlappingEntryOfTheSameBlockOnly() {
        PortalIndex.Entry relit = entry(SKY, 0, 72, 1, Direction.Axis.Z, 2, 3);
        PortalIndex index = INDEX.with(relit);
        assertEquals(3, index.entries().size());
        assertTrue(index.entries().contains(relit));
        assertFalse(index.entries().contains(INDEX.entries().get(1)));

        PortalIndex.Entry otherBlock = entry(EMBER, 0, 72, 1, Direction.Axis.Z, 2, 3);
        assertEquals(4, INDEX.with(otherBlock).entries().size());
        PortalIndex.Entry beside = entry(SKY, 0, 75, 0, Direction.Axis.Z, 2, 3);
        assertEquals(4, INDEX.with(beside).entries().size());
        assertEquals(INDEX, INDEX.with(INDEX.entries().getFirst()));
    }

    @Test
    void withoutAndAt() {
        PortalIndex.Entry wide = INDEX.entries().get(1);
        assertEquals(2, INDEX.without(wide).entries().size());
        assertEquals(INDEX, INDEX.without(entry(SKY, 9, 9, 9, Direction.Axis.X, 2, 3)));
        assertEquals(wide, INDEX.at(SKY, new BlockPos(0, 74, 3)).orElseThrow());
        assertTrue(INDEX.at(SKY, new BlockPos(0, 75, 3)).isEmpty());
        assertTrue(INDEX.at(SKY, new BlockPos(1, 70, 0)).isEmpty());
        assertTrue(INDEX.at(EMBER, new BlockPos(0, 74, 3)).isEmpty());
    }

    @Test
    void candidatesAreClosestFirstWithinASquareRadius() {
        BlockPos target = new BlockPos(50, 64, 0);
        // Both are 50 blocks away in x; the x-axis portal at x 100 has no height difference, so it comes first.
        assertEquals(List.of(INDEX.entries().get(2), INDEX.entries().get(1)), INDEX.candidates(SKY, target, 50, p -> true));
        assertEquals(List.of(), INDEX.candidates(SKY, target, 49, p -> true));
        // Distance counts from the closest inside block: x 101 is one block from the 2-wide portal at 100.
        assertEquals(List.of(INDEX.entries().get(2)), INDEX.candidates(SKY, new BlockPos(102, 0, 0), 1, p -> true));
        // Any height; the square radius reads x and z only.
        assertEquals(List.of(INDEX.entries().get(1)), INDEX.candidates(SKY, new BlockPos(16, 300, 19), 16, p -> true));
        assertEquals(List.of(INDEX.entries().get(1)), INDEX.candidates(SKY, target, 50, p -> p.getX() < 60));
        assertEquals(List.of(INDEX.entries().getFirst()), INDEX.candidates(EMBER, new BlockPos(0, 0, 0), 16, p -> true));
    }

    @Test
    void entryRectangleAndClosestBlock() {
        PortalIndex.Entry wide = INDEX.entries().get(1);
        PortalFrame.Rectangle rectangle = wide.rectangle();
        assertEquals(new BlockPos(0, 74, 3), rectangle.max());
        assertEquals(20, rectangle.positions().size());
        assertEquals(new BlockPos(0, 74, 3), wide.closestTo(new BlockPos(9, 99, 9)));
        assertEquals(wide, PortalIndex.Entry.of(SKY, rectangle));
        assertEquals(4, rectangle.foundRectangle().axis1Size);
    }
}
