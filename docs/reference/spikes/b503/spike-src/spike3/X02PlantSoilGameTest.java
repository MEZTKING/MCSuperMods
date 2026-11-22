package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;
import static dev.mcsupermods.runtime.gametest.spike3.B503Mod.b;

import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.MultifaceBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

/**
 * B503 spike (throwaway), X2: whether the survival checks read tags (a project soil in the {@code supports_*} tags) or
 * fixed blocks, and what "water next to it" accepts for sugar cane (water, a waterlogged slab, a project fluid in
 * {@code #minecraft:water}, frosted ice, a project block in {@code supports_sugar_cane_adjacently}).
 */
public class X02PlantSoilGameTest {
    static final String TALL = X01PlantClassesGameTest.TALL;

    /** {@code plant} at {@code (x, 2, z)} on {@code soil}, with {@code beside} east of the soil; canSurvive. */
    static boolean survives(GameTestHelper helper, int x, int z, BlockState soil, BlockState beside, BlockState plant) {
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                helper.setBlock(new BlockPos(x + dx, 1, z + dz), Blocks.AIR);
                helper.setBlock(new BlockPos(x + dx, 2, z + dz), Blocks.AIR);
            }
        }
        helper.setBlock(new BlockPos(x, 1, z), soil);
        if (beside != null) {
            helper.setBlock(new BlockPos(x + 1, 1, z), beside);
        }
        return plant.canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(x, 2, z)));
    }

    static BlockState fluid() {
        Block f = BuiltInRegistries.BLOCK.getValue(Identifier.fromNamespaceAndPath("msm_test", "fluid_water"));
        return f.defaultBlockState();
    }

    @GameTest(structure = TALL, maxTicks = 40)
    public void x2Soils(GameTestHelper helper) {
        BlockState water = Blocks.WATER.defaultBlockState();
        BlockState tagged = b("soil_tagged").defaultBlockState();
        BlockState plain = b("soil_plain").defaultBlockState();
        BlockState sand = Blocks.SAND.defaultBlockState();
        Map<String, Object> cane = new LinkedHashMap<>();
        BlockState c = b("cane_naked").defaultBlockState();
        cane.put("sand+water", survives(helper, 2, 2, sand, water, c));
        cane.put("sand+nothing", survives(helper, 2, 2, sand, null, c));
        cane.put("soilTagged+water", survives(helper, 2, 2, tagged, water, c));
        cane.put("soilPlain+water", survives(helper, 2, 2, plain, water, c));
        cane.put("dirt+water", survives(helper, 2, 2, Blocks.DIRT.defaultBlockState(), water, c));
        cane.put("sand+waterloggedSlab", survives(helper, 2, 2, sand,
                Blocks.STONE_SLAB.defaultBlockState().setValue(SlabBlock.WATERLOGGED, true), c));
        cane.put("sand+projectWaterFluid(msm_test:fluid_water)", survives(helper, 2, 2, sand, fluid(), c));
        cane.put("sand+frostedIce", survives(helper, 2, 2, sand, Blocks.FROSTED_ICE.defaultBlockState(), c));
        cane.put("sand+wetTagged(supports_sugar_cane_adjacently)", survives(helper, 2, 2, sand, b("wet_tagged").defaultBlockState(), c));
        cane.put("ownCane(below)", survives(helper, 2, 2, c, null, c));
        cane.put("vanillaSugarCane(below)", survives(helper, 2, 2, Blocks.SUGAR_CANE.defaultBlockState(), null, c));
        cane.put("vanillaCane.onSoilTagged+water", survives(helper, 2, 2, tagged, water, Blocks.SUGAR_CANE.defaultBlockState()));
        cane.put("vanillaCane.onOwnCane", survives(helper, 2, 2, c, null, Blocks.SUGAR_CANE.defaultBlockState()));
        R.put("X2.cane", cane);

        Map<String, Object> cactus = new LinkedHashMap<>();
        BlockState k = b("cactus_naked").defaultBlockState();
        cactus.put("sand", survives(helper, 6, 2, sand, null, k));
        cactus.put("soilTagged", survives(helper, 6, 2, tagged, null, k));
        cactus.put("soilPlain", survives(helper, 6, 2, plain, null, k));
        cactus.put("ownCactus(below)", survives(helper, 6, 2, k, null, k));
        cactus.put("vanillaCactus(below)", survives(helper, 6, 2, Blocks.CACTUS.defaultBlockState(), null, k));
        // A solid block beside the cactus itself (at plant height).
        helper.setBlock(new BlockPos(6, 1, 2), sand);
        helper.setBlock(new BlockPos(7, 2, 2), Blocks.STONE);
        cactus.put("sand+stoneBeside", k.canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(6, 2, 2))));
        helper.setBlock(new BlockPos(7, 2, 2), Blocks.AIR);
        R.put("X2.cactus", cactus);

        Map<String, Object> bamboo = new LinkedHashMap<>();
        BlockState st = b("bamboo_naked").defaultBlockState();
        BlockState sh = b("shoot_naked").defaultBlockState();
        bamboo.put("stalk.dirt", survives(helper, 10, 2, Blocks.DIRT.defaultBlockState(), null, st));
        bamboo.put("stalk.soilTagged", survives(helper, 10, 2, tagged, null, st));
        bamboo.put("stalk.soilPlain", survives(helper, 10, 2, plain, null, st));
        bamboo.put("stalk.onOwnShoot", survives(helper, 10, 2, sh, null, st));
        bamboo.put("stalk.onOwnStalk", survives(helper, 10, 2, st, null, st));
        bamboo.put("stalk.onVanillaBamboo", survives(helper, 10, 2, Blocks.BAMBOO.defaultBlockState(), null, st));
        bamboo.put("shoot.dirt", survives(helper, 10, 2, Blocks.DIRT.defaultBlockState(), null, sh));
        bamboo.put("shoot.soilTagged", survives(helper, 10, 2, tagged, null, sh));
        bamboo.put("shoot.soilPlain", survives(helper, 10, 2, plain, null, sh));
        bamboo.put("vanillaBamboo.onOwnStalk", survives(helper, 10, 2, st, null, Blocks.BAMBOO.defaultBlockState()));
        R.put("X2.bamboo", bamboo);

        Map<String, Object> leaf = new LinkedHashMap<>();
        BlockState big = b("big_leaf_naked").defaultBlockState();
        BlockState small = b("small_leaf_naked").defaultBlockState().setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.LOWER);
        leaf.put("big.clay", survives(helper, 2, 7, Blocks.CLAY.defaultBlockState(), null, big));
        leaf.put("big.soilTagged", survives(helper, 2, 7, tagged, null, big));
        leaf.put("big.soilPlain", survives(helper, 2, 7, plain, null, big));
        leaf.put("big.onOwnStem", survives(helper, 2, 7, b("leaf_stem_naked").defaultBlockState(), null, big));
        leaf.put("small.clay", survives(helper, 2, 7, Blocks.CLAY.defaultBlockState(), null, small));
        leaf.put("small.soilTagged", survives(helper, 2, 7, tagged, null, small));
        leaf.put("small.soilPlain", survives(helper, 2, 7, plain, null, small));
        leaf.put("small.dirt", survives(helper, 2, 7, Blocks.DIRT.defaultBlockState(), null, small));
        R.put("X2.dripleaf", leaf);

        Map<String, Object> heads = new LinkedHashMap<>();
        // Kelp: in water on a plain project block; vines hang from a plain project block / stand on one.
        helper.setBlock(new BlockPos(8, 1, 8), plain);
        helper.setBlock(new BlockPos(8, 2, 8), Blocks.WATER);
        heads.put("kelp.onSoilPlainInWater", b("kelp").defaultBlockState().canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(8, 2, 8))));
        helper.setBlock(new BlockPos(8, 2, 8), Blocks.AIR);
        heads.put("kelp.onSoilPlainInAir", b("kelp").defaultBlockState().canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(8, 2, 8))));
        helper.setBlock(new BlockPos(10, 6, 8), plain);
        heads.put("weeping.underSoilPlain", b("weeping").defaultBlockState().canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(10, 5, 8))));
        heads.put("cave.underSoilPlain", b("cave").defaultBlockState().canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(10, 5, 8))));
        helper.setBlock(new BlockPos(12, 1, 8), plain);
        heads.put("twisting.onSoilPlain", b("twisting").defaultBlockState().canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(12, 2, 8))));
        helper.setBlock(new BlockPos(12, 1, 8), Blocks.AIR);
        heads.put("twisting.onAir", b("twisting").defaultBlockState().canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(12, 2, 8))));
        helper.setBlock(new BlockPos(14, 3, 8), plain);
        BlockState lich = b("lichen_naked").defaultBlockState().setValue(MultifaceBlock.getFaceProperty(Direction.EAST), true);
        heads.put("lichen.onSoilPlainFace", lich.canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(13, 3, 8))));
        R.put("X2.heads", heads);
        helper.succeed();
    }
}
