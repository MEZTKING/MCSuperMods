package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.LoadReport;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.registry.OxidizableBlocksRegistry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.WeatheringCopper;

/**
 * Version seam (ADR 0105 D4 and its amendment after B503): the project's strip, flatten, till, wax, age and burn rules on
 * vanilla blocks ({@code msm:vanilla_block_rules}). Strip, flatten, till and wax go through the one use callback of
 * {@link BlockExtras} and burn through {@link Flammability} on both versions ({@link BlockExtras#applyRules}). 26.3:
 * {@code age} through Fabric's {@link OxidizableBlocksRegistry#registerNextStage} (X12: vanilla's oxidised copper then
 * random-ticks into the next block); only a block that already ages as copper does ({@link WeatheringCopper}) takes one.
 * Called once from {@code onInitialize}, after the registrar, so it also adds the own sounds' start-up warnings
 * ({@link OwnSounds}) to the report.
 */
public final class VanillaPairs {
    private VanillaPairs() {}

    /** Applies the rules of the loaded definitions; returns the report with their problems and the own sounds' warnings. */
    public static LoadReport register(LoadReport report) {
        return BlockExtras.applyRules(report.withProblems(List.of(), OwnSounds.warnings()), VanillaPairs::age);
    }

    /** Whether {@code age} rules make vanilla blocks age (true on 26.3, false on 26.4). */
    public static boolean agesVanillaBlocks() {
        return true;
    }

    private static Optional<String> age(Block block, Block next, String source) {
        if (!(block instanceof WeatheringCopper)) {
            return Optional.of(source + ": age: " + BuiltInRegistries.BLOCK.getKey(block)
                    + " does not age as copper does, so it cannot take a next stage; the rule is skipped");
        }
        try {
            OxidizableBlocksRegistry.registerNextStage(block, next);
        } catch (RuntimeException e) {
            return Optional.of(source + ": age: " + BuiltInRegistries.BLOCK.getKey(block) + " -> " + BuiltInRegistries.BLOCK.getKey(next)
                    + " could not be registered (" + e.getMessage() + "); the rule is skipped");
        }
        return Optional.empty();
    }
}
