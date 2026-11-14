package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonPrimitive;
import com.mojang.serialization.JsonOps;
import dev.mcsupermods.runtime.registry.Leaves;
import dev.mcsupermods.runtime.registry.types.MsmSaplingBlock;
import java.util.Optional;
import net.minecraft.world.level.block.grower.TreeGrower;

/**
 * Version seam for the runtime GameTests (ADR 0038 D2, ADR 0068 D8): the seams {@code TreeGrowers} and {@code Leaves}.
 * 26.3: a project sapling's grower is in {@code TreeGrower}'s name map under the sapling's id (so {@code TreeGrower.CODEC}
 * resolves it and no vanilla name is taken), and the leaves' "no ambient sound" is
 * {@code AmbientLeavesBlockSoundPlayer.noAmbientSound()}.
 */
final class PlantSeamCheck {
    private PlantSeamCheck() {}

    /** A problem with the sapling's grower, or null. */
    static String growerProblem(MsmSaplingBlock sapling) {
        String name = sapling.driver().id().toString();
        Optional<TreeGrower> byName = TreeGrower.CODEC.parse(JsonOps.INSTANCE, new JsonPrimitive(name)).result();
        if (byName.isEmpty() || byName.get() != sapling.treeGrower()) {
            return "TreeGrower.CODEC resolves '" + name + "' to " + byName + ", not the sapling's grower";
        }
        Optional<TreeGrower> oak = TreeGrower.CODEC.parse(JsonOps.INSTANCE, new JsonPrimitive("oak")).result();
        if (oak.isEmpty() || oak.get() != TreeGrower.OAK) {
            return "the vanilla grower 'oak' was replaced: " + oak;
        }
        return null;
    }

    /** A problem with the "no ambient sound" argument, or null. */
    static String leavesProblem() {
        return Leaves.NO_AMBIENT_SOUND == null ? "Leaves.NO_AMBIENT_SOUND is null" : null;
    }
}
