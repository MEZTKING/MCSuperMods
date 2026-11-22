package dev.mcsupermods.runtime.gametest.spike5;

import static dev.mcsupermods.runtime.gametest.spike5.B525Help.R;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.phys.Vec3;

/**
 * B525 spike (throwaway), X26: project cauldrons filled and emptied by the player's bucket and bottle (the real use
 * path, {@code ServerPlayerGameMode.useItemOn}), vanilla's empty cauldron given a project bucket by the reflection
 * route (lava-like), by a {@code UseBlockCallback} (water-like) and not at all (the runtime's own bucket, the control),
 * the comparator signal and an entity on fire inside.
 */
public class X26CauldronGameTest {
    static String step(GameTestHelper helper, ServerPlayer player, BlockPos at, ItemStack stack) {
        String before = B525Help.name(helper.getBlockState(at));
        var result = B525Help.use(helper, player, at, Direction.UP, stack);
        return before + " + " + B525Help.item(stack.copy()) + " -> " + result + " => " + B525Help.name(helper.getBlockState(at)) + ", hand "
                + B525Help.item(player.getItemInHand(InteractionHand.MAIN_HAND)) + ", inventory has goo bottle "
                + player.getInventory().countItem(B525Mod.item("goo_bottle"));
    }

    @GameTest(maxTicks = 60)
    public void x26Cauldrons(GameTestHelper helper) {
        Map<String, Object> m = new TreeMap<>();
        BlockPos c = new BlockPos(2, 1, 2);
        BlockPos v = new BlockPos(5, 1, 2);
        try (B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(3, 1, 4), GameType.SURVIVAL, "Cook")) {
            ServerPlayer p = ears.player;
            R.section("X26.layered", () -> {
                List<String> steps = new ArrayList<>();
                helper.setBlock(c, B525Mod.block("goo_cauldron").defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 3));
                steps.add("comparator level 3: " + helper.getBlockState(c).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(c), Direction.NORTH));
                steps.add(step(helper, p, c, new ItemStack(Items.BUCKET)));
                B525Mod.cauldronRoute = false;
                steps.add("route off: " + step(helper, p, c, new ItemStack(B525Mod.item("mix_goo_bucket"))));
                helper.setBlock(c, Blocks.CAULDRON);
                B525Mod.cauldronRoute = true;
                steps.add("route on: " + step(helper, p, c, new ItemStack(B525Mod.item("mix_goo_bucket"))));
                steps.add(step(helper, p, c, new ItemStack(Items.GLASS_BOTTLE)));
                steps.add("comparator level 2: " + helper.getBlockState(c).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(c), Direction.NORTH));
                steps.add(step(helper, p, c, new ItemStack(Items.GLASS_BOTTLE)));
                steps.add(step(helper, p, c, new ItemStack(Items.GLASS_BOTTLE)));
                steps.add(step(helper, p, c, new ItemStack(B525Mod.item("goo_bottle"))));
                steps.add(step(helper, p, c, new ItemStack(B525Mod.item("goo_bottle"))));
                steps.add("vanilla water bucket: " + step(helper, p, c, new ItemStack(Items.WATER_BUCKET)));
                helper.setBlock(c, B525Mod.block("goo_cauldron").defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 2));
                steps.add("empty bucket at 2: " + step(helper, p, c, new ItemStack(Items.BUCKET)));
                steps.add("dye-able leather boots: " + step(helper, p, c, new ItemStack(Items.LEATHER_BOOTS)));
                m.put("layered", steps);
            });
            R.section("X26.full", () -> {
                List<String> steps = new ArrayList<>();
                helper.setBlock(v, Blocks.CAULDRON);
                steps.add("reflection route: " + step(helper, p, v, new ItemStack(B525Mod.item("mix_lava_bucket"))));
                steps.add("comparator: " + helper.getBlockState(v).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(v), Direction.NORTH));
                steps.add(step(helper, p, v, new ItemStack(Items.BUCKET)));
                helper.setBlock(v, Blocks.CAULDRON);
                B525Mod.cauldronRoute = false;
                ItemStack runtimeBucket = new ItemStack(BuiltInRegistries.ITEM.getValue(Identifier.fromNamespaceAndPath("msm_test", "fluid_water_bucket")));
                steps.add("control runtime water-like bucket, no route: " + step(helper, p, v, runtimeBucket));
                steps.add("above the cauldron after the control: " + B525Help.name(helper.getBlockState(v.above())));
                m.put("full", steps);
            });
            R.section("X26.sounds", () -> m.put("heard", ears.heard()));
        }
        // An entity on fire in a full project cauldron.
        BlockPos f = new BlockPos(2, 1, 5);
        helper.setBlock(f, B525Mod.block("goo_cauldron").defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 3));
        Zombie zombie = EntityTypes.ZOMBIE.create(helper.getLevel(), EntitySpawnReason.COMMAND);
        zombie.setNoAi(true);
        zombie.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(f).add(0, 0.3, 0)));
        zombie.igniteForSeconds(10);
        helper.getLevel().addFreshEntity(zombie);
        m.put("inside.onFireAtStart", zombie.isOnFire());
        helper.runAfterDelay(30, () -> {
            m.put("inside.onFireAfter30", zombie.isOnFire());
            m.put("inside.cauldronAfter30", B525Help.name(helper.getBlockState(f)));
            m.put("log", List.copyOf(B525Cauldrons.LOG));
            R.put("X26", m);
            zombie.discard();
            B525Mod.cauldronRoute = false;
            helper.succeed();
        });
    }
}
