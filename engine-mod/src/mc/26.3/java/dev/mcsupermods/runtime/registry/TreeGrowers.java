package dev.mcsupermods.runtime.registry;

import java.util.Optional;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.random.WeightedList;
import net.minecraft.world.level.block.grower.TreeGrower;
import net.minecraft.world.level.levelgen.feature.Feature;

/**
 * Version seam (ADR 0038 D2, ADR 0068 D4, D8): the {@link TreeGrower} of a project sapling, holding configured feature
 * keys only (the server looks them up when the sapling grows).
 * 26.3: the constructor takes a name and puts the grower into a static name map used by {@code TreeGrower.CODEC}; the
 * name is the sapling's id ({@code <ns>:<path>}), so no vanilla grower ({@code oak}, {@code spruce}, ...) is replaced
 * (checked with {@code javap}, 2026-11-14).
 */
public final class TreeGrowers {
    private TreeGrowers() {}

    /**
     * @param sapling the sapling's id, the grower's name on 26.3
     * @param tree the tree grown normally; also the shortest tree type, used by vanilla to check room above
     * @param megaTree the 2x2 tree; empty for none
     * @param flowerTree the tree grown when flowers are near
     */
    public static TreeGrower create(String sapling, ResourceKey<Feature> tree, Optional<ResourceKey<Feature>> megaTree,
            ResourceKey<Feature> flowerTree) {
        return new TreeGrower(sapling, WeightedList.of(tree), megaTree.map(WeightedList::of).orElseGet(WeightedList::of),
                WeightedList.of(flowerTree), tree);
    }
}
