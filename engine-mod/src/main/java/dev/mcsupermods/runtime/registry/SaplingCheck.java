package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.registry.types.MsmSaplingBlock;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.levelgen.feature.Feature;

/**
 * The start-up check of project saplings (ADR 0068 D4): a sapling's {@code TreeGrower} holds configured feature keys that
 * the server looks up only when the sapling grows, so a missing tree cannot be found at registration. Once the server has
 * started (every data pack loaded), each tree id of every project sapling ({@code tree}, {@code mega_tree},
 * {@code flower_tree}) that is not in the server's {@code worldgen/feature} registry gives one warning per sapling and id;
 * such a sapling does not grow, as vanilla's would not. Called from {@link MsmRegistrar#checkAfterStart}.
 */
public final class SaplingCheck {
    private SaplingCheck() {}

    /** The warnings (without the mod-id prefix), in block registry order. */
    public static List<String> check(MinecraftServer server) {
        Registry<Feature> features = server.registryAccess().lookupOrThrow(Registries.FEATURE);
        List<String> warnings = new ArrayList<>();
        for (Block block : BuiltInRegistries.BLOCK) {
            if (!(block instanceof MsmSaplingBlock sapling)) {
                continue;
            }
            Set<Identifier> trees = new LinkedHashSet<>();
            trees.add(sapling.saplingFields().tree());
            sapling.saplingFields().megaTree().ifPresent(trees::add);
            trees.add(sapling.saplingFields().flowerTree());
            for (Identifier tree : trees) {
                if (!features.containsKey(tree)) {
                    warnings.add("sapling " + sapling.driver().id() + ": tree feature " + tree + " is not in any loaded data pack");
                }
            }
        }
        return warnings;
    }
}
