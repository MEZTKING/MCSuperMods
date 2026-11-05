package dev.mcsupermods.parity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;

/**
 * Behaviour parity over {@code fixtures/sample-mod} (namespace {@code msm_sample_mod}), written
 * against vanilla and Fabric API only, so the same tests run against the content jar (with
 * {@code msm_runtime} nested) and against the ejected Java project's jar (ADR 0033 D5).
 *
 * <p>B131 ships one test; B139 adds the full set (properties, events, items).
 */
public class SampleModParityTest {
    private static final Identifier RUBY_ORE = Identifier.fromNamespaceAndPath("msm_sample_mod", "ruby_ore");

    @GameTest
    public void rubyOreIsRegistered(GameTestHelper helper) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(RUBY_ORE), "block " + RUBY_ORE + " is not registered");
        Block block = BuiltInRegistries.BLOCK.getValue(RUBY_ORE);
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(RUBY_ORE), "block item " + RUBY_ORE + " is not registered");
        Item item = BuiltInRegistries.ITEM.getValue(RUBY_ORE);
        helper.assertTrue(item instanceof BlockItem blockItem && blockItem.getBlock() == block,
                "item " + RUBY_ORE + " is not the block item of the block: " + item);
        helper.succeed();
    }
}
