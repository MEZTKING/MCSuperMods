package dev.mcsupermods.runtime.registry;

import net.fabricmc.fabric.api.registry.FlammableBlockRegistry;
import net.minecraft.world.level.block.Block;

/**
 * Version seam (ADR 0038 D2): fire odds for {@code msm:flammable} (ADR 0067 D3).
 * 26.3: Fabric's {@link FlammableBlockRegistry} ({@code fabric-content-registries-v0}). Its {@code add(block, burn,
 * spread)} takes the numbers in the order of vanilla's {@code FireBlock.setFlammable} (planks 5, 20), which are the
 * format's {@code burn_odds} and {@code ignite_odds}.
 */
final class Flammability {
    private Flammability() {}

    static void register(Block block, int burnOdds, int igniteOdds) {
        FlammableBlockRegistry.getDefaultInstance().add(block, burnOdds, igniteOdds);
    }
}
