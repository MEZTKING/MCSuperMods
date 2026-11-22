package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;
import static dev.mcsupermods.runtime.gametest.spike3.B503Mod.b;
import static dev.mcsupermods.runtime.gametest.spike3.X07WaterloggedContainerGameTest.be;

import dev.mcsupermods.runtime.registry.weathering.Weathering;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Container;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;

/**
 * B503 spike (throwaway), X13: a container that ages ({@code B503Blocks.AgingChest}, two stages with their own block
 * entity types): the runtime's {@code Weathering.replace}, a forced random tick, a copy route with
 * {@code UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS}, and vanilla's copper chest as the control.
 */
public class X13WeatheringContainerGameTest {
    static void fill(GameTestHelper helper, BlockPos rel) {
        Container c = (Container) helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        c.setItem(0, new ItemStack(Items.DIAMOND, 7));
        c.setItem(13, new ItemStack(Items.APPLE, 3));
    }

    static List<String> drops(GameTestHelper helper, BlockPos rel) {
        List<String> out = new ArrayList<>();
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(1.5))) {
            out.add(e.getItem().toString());
            e.discard();
        }
        return out;
    }

    static String randomTicks(GameTestHelper helper, BlockPos rel, Block from) {
        ServerLevel level = helper.getLevel();
        RandomSource random = RandomSource.create(13L);
        int k = 0;
        while (helper.getBlockState(rel).is(from) && k < 50000) {
            helper.getBlockState(rel).randomTick(level, helper.absolutePos(rel), random);
            k++;
        }
        return "ticks " + k + " -> " + B503Help.id(helper.getBlockState(rel).getBlock());
    }

    @GameTest(maxTicks = 40)
    public void x13AgingContainers(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        R.section("X13.replace", () -> {
            BlockPos at = new BlockPos(1, 1, 1);
            helper.setBlock(at, b("age_chest"));
            fill(helper, at);
            BlockState from = helper.getBlockState(at);
            Weathering.replace(level, helper.absolutePos(at), from, b("age_chest_exposed").defaultBlockState());
            m.put("replace.block", B503Help.id(helper.getBlockState(at).getBlock()));
            m.put("replace.entity", be(helper, at));
            m.put("replace.drops", drops(helper, at));
        });
        R.section("X13.randomTick", () -> {
            BlockPos at = new BlockPos(4, 1, 1);
            helper.setBlock(at, b("age_chest"));
            fill(helper, at);
            m.put("randomTick.change", randomTicks(helper, at, b("age_chest")));
            m.put("randomTick.entity", be(helper, at));
            m.put("randomTick.drops", drops(helper, at));
        });
        R.section("X13.copy", () -> {
            BlockPos at = new BlockPos(1, 1, 4);
            helper.setBlock(at, b("age_chest"));
            fill(helper, at);
            Container old = (Container) level.getBlockEntity(helper.absolutePos(at));
            List<ItemStack> items = new ArrayList<>();
            for (int i = 0; i < old.getContainerSize(); i++) {
                items.add(old.getItem(i).copy());
            }
            level.setBlock(helper.absolutePos(at), b("age_chest_exposed").defaultBlockState(),
                    Block.UPDATE_ALL | Block.UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS);
            m.put("copy.dropsBeforePaste", drops(helper, at));
            Container now = (Container) level.getBlockEntity(helper.absolutePos(at));
            m.put("copy.newEntityBeforePaste", be(helper, at));
            for (int i = 0; i < items.size() && i < now.getContainerSize(); i++) {
                now.setItem(i, items.get(i));
            }
            m.put("copy.entity", be(helper, at));
        });
        R.section("X13.vanillaCopperChest", () -> {
            BlockPos at = new BlockPos(4, 1, 4);
            Block chest = Blocks.COPPER_CHEST.weathering().unaffected();
            helper.setBlock(at, chest);
            fill(helper, at);
            m.put("vanilla.isRandomlyTicking", helper.getBlockState(at).isRandomlyTicking());
            m.put("vanilla.change", randomTicks(helper, at, chest));
            m.put("vanilla.entity", be(helper, at));
            m.put("vanilla.drops", drops(helper, at));
        });
        R.put("X13", m);
        helper.succeed();
    }
}
