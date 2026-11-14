package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.registry.Leaves;
import dev.mcsupermods.runtime.registry.types.MsmSaplingBlock;
import net.minecraft.world.level.block.grower.TreeGrower;

/**
 * Version seam for the runtime GameTests (ADR 0038 D2, ADR 0068 D8): the seams {@code TreeGrowers} and {@code Leaves}.
 * 26.4-snapshot-7: a {@code TreeGrower} has no name (no name map, no Codec), so the check is only that the sapling has
 * its own grower; the leaves' "no ambient sound" is {@code Optional.empty()}.
 */
final class PlantSeamCheck {
    private PlantSeamCheck() {}

    /** A problem with the sapling's grower, or null. */
    static String growerProblem(MsmSaplingBlock sapling) {
        TreeGrower grower = sapling.treeGrower();
        return grower == null || grower == TreeGrower.OAK ? "the sapling has no grower of its own: " + grower : null;
    }

    /** A problem with the "no ambient sound" argument, or null. */
    static String leavesProblem() {
        return Leaves.NO_AMBIENT_SOUND.isEmpty() ? null : "Leaves.NO_AMBIENT_SOUND is " + Leaves.NO_AMBIENT_SOUND;
    }
}
