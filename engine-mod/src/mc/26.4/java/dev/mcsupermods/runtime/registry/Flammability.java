package dev.mcsupermods.runtime.registry;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FireBlock;

/**
 * Version seam (ADR 0038 D2): fire odds for {@code msm:flammable} (ADR 0067 D3).
 * 26.4-snapshot-7: Fabric API 0.165.4+26.4 has no {@code fabric-content-registries-v0} (no
 * {@code FlammableBlockRegistry}; checked 2026-11-14 against the fabric-api pom), and vanilla's
 * {@code FireBlock.setFlammable(Block, int, int)} is private. The runtime calls it on {@code Blocks.FIRE} by its Mojang
 * name (the game is not obfuscated), in the same argument order as 26.3's Fabric registry ({@code burn_odds},
 * {@code ignite_odds}; planks 5, 20). A failure is thrown to the registrar, which reports it as a load error.
 */
final class Flammability {
    private static Method setFlammable;

    private Flammability() {}

    static void register(Block block, int burnOdds, int igniteOdds) {
        try {
            if (setFlammable == null) {
                Method m = FireBlock.class.getDeclaredMethod("setFlammable", Block.class, int.class, int.class);
                m.setAccessible(true);
                setFlammable = m;
            }
            setFlammable.invoke(Blocks.FIRE, block, burnOdds, igniteOdds);
        } catch (NoSuchMethodException | IllegalAccessException | InvocationTargetException | RuntimeException e) {
            throw new IllegalStateException("msm:flammable could not be registered (FireBlock.setFlammable: " + e + ")", e);
        }
    }
}
