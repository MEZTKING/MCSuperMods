package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.LoadReport;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.Block;

/**
 * Version seam (ADR 0105 D4 and its amendment after B503): the project's strip, flatten, till, wax, age and burn rules on
 * vanilla blocks ({@code msm:vanilla_block_rules}). Strip, flatten, till and wax go through the one use callback of
 * {@link BlockExtras} and burn through {@link Flammability} on both versions ({@link BlockExtras#applyRules}). 26.4:
 * {@code age} is not available (X12: vanilla's next-stage map is immutable and the last copper stage does not random-tick;
 * the reserve brief B546 would add a version-only Mixin), so each age rule logs one warning and is skipped. Called once
 * from {@code onInitialize}, after the registrar, so it also adds the own sounds' start-up warnings ({@link OwnSounds})
 * to the report.
 */
public final class VanillaPairs {
    private VanillaPairs() {}

    /** Applies the rules of the loaded definitions; returns the report with their problems and the own sounds' warnings. */
    public static LoadReport register(LoadReport report) {
        return BlockExtras.applyRules(report.withProblems(List.of(), OwnSounds.warnings()), VanillaPairs::age);
    }

    /** Whether {@code age} rules make vanilla blocks age (true on 26.3, false on 26.4). */
    public static boolean agesVanillaBlocks() {
        return false;
    }

    private static Optional<String> age(Block block, Block next, String source) {
        return Optional.of(source + ": age: " + BuiltInRegistries.BLOCK.getKey(block) + " -> " + BuiltInRegistries.BLOCK.getKey(next)
                + ": ageing vanilla blocks is not on this Minecraft version (26.4); the rule is skipped");
    }
}
