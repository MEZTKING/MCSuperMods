package dev.mcsupermods.runtime.gametest.spike5;

import static dev.mcsupermods.runtime.gametest.spike5.B525Help.R;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.AbstractBedBlock;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.phys.Vec3;

/**
 * B525 spike (throwaway), X33: each candidate hook fired by the real path. Crafting through a crafting table's menu
 * (a click on the result and a shift-click) and the inventory's 2 by 2 grid; picking up from the ground (whole and
 * partial); eating bread to the end; sleeping in a bed at midnight and waking; advancements granted by their own
 * triggers (the spike's {@code consume_item}, {@code recipe_crafted}, {@code inventory_changed}, {@code slept_in_bed})
 * and by {@code /advancement}. Every hook writes to {@code B525Mod.EVENTS}; each test keeps the lines of its player.
 */
public class X33EventGameTest {
    static List<String> mine(int from, String name) {
        List<String> out = new ArrayList<>();
        List<String> all = List.copyOf(B525Mod.EVENTS);
        for (int i = from; i < all.size(); i++) {
            if (all.get(i).contains(name)) {
                out.add(all.get(i));
            }
        }
        return out;
    }

    static String grid(AbstractContainerMenu menu) {
        return "result " + B525Help.item(menu.getSlot(0).getItem()) + ", carried " + B525Help.item(menu.getCarried());
    }

    @GameTest(maxTicks = 40)
    public void x33Crafting(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        BlockPos table = new BlockPos(2, 1, 2);
        helper.setBlock(table, Blocks.CRAFTING_TABLE);
        try (B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "Crafter")) {
            ServerPlayer p = ears.player;
            int from = B525Mod.EVENTS.size();
            R.section("X33.crafting", () -> {
                B525Help.use(helper, p, table, Direction.UP, ItemStack.EMPTY);
                AbstractContainerMenu menu = p.containerMenu;
                m.put("menu", menu.getClass().getSimpleName());
                menu.getSlot(1).set(new ItemStack(Items.OAK_LOG, 1));
                m.put("afterPut", grid(menu));
                menu.clicked(0, 0, ContainerInput.PICKUP, p);
                m.put("afterPickup", grid(menu));
                m.put("events.pickup", mine(from, "Crafter"));
                int f2 = B525Mod.EVENTS.size();
                menu.setCarried(ItemStack.EMPTY);
                menu.getSlot(1).set(new ItemStack(Items.OAK_LOG, 3));
                menu.clicked(0, 0, ContainerInput.QUICK_MOVE, p);
                m.put("afterShiftClick", grid(menu) + ", planks in inventory " + p.getInventory().countItem(Items.OAK_PLANKS));
                m.put("events.shiftClick", mine(f2, "Crafter"));
                p.closeContainer();
                int f3 = B525Mod.EVENTS.size();
                AbstractContainerMenu inv = p.inventoryMenu;
                inv.getSlot(1).set(new ItemStack(Items.OAK_LOG, 1));
                inv.clicked(0, 0, ContainerInput.PICKUP, p);
                m.put("inventoryGrid", grid(inv));
                m.put("events.inventoryGrid", mine(f3, "Crafter"));
                inv.setCarried(ItemStack.EMPTY);
                // A furnace's result slot (smelting counts as crafted in vanilla's statistics).
                BlockPos furnace = new BlockPos(4, 1, 2);
                helper.setBlock(furnace, Blocks.FURNACE);
                var be = (net.minecraft.world.level.block.entity.AbstractFurnaceBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(furnace));
                be.setItem(2, new ItemStack(Items.IRON_INGOT, 3));
                int f4 = B525Mod.EVENTS.size();
                B525Help.use(helper, p, furnace, Direction.UP, ItemStack.EMPTY);
                m.put("furnaceMenu", p.containerMenu.getClass().getSimpleName());
                p.containerMenu.clicked(2, 0, ContainerInput.PICKUP, p);
                m.put("furnaceCarried", B525Help.item(p.containerMenu.getCarried()));
                m.put("events.furnace", mine(f4, "Crafter"));
                p.containerMenu.setCarried(ItemStack.EMPTY);
                p.closeContainer();
                m.put("tags", List.copyOf(p.entityTags()));
                m.put("advancementDone", p.getAdvancements().getOrStartProgress(
                        helper.getLevel().getServer().getAdvancements().get(B525Mod.id("spike/crafted"))).isDone());
            });
        }
        R.put("X33.crafting", m);
        helper.succeed();
    }

    @GameTest(maxTicks = 60)
    public void x33PickingUp(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "Picker");
        ServerPlayer p = ears.player;
        int from = B525Mod.EVENTS.size();
        Vec3 at = helper.absoluteVec(new Vec3(2.5, 1.0, 2.5));
        ItemEntity whole = new ItemEntity(helper.getLevel(), at.x, at.y, at.z, new ItemStack(Items.EMERALD, 5));
        whole.setNoPickUpDelay();
        whole.setDeltaMovement(Vec3.ZERO);
        helper.getLevel().addFreshEntity(whole);
        for (int t = 1; t <= 10; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(12, () -> R.section("X33.pickup", () -> {
            m.put("whole.inventory", p.getInventory().countItem(Items.EMERALD));
            m.put("whole.entityGone", whole.isRemoved());
            m.put("whole.events", mine(from, "Picker"));
            // Partial: every slot full of stone but one holding 61 diamonds; five diamonds on the ground.
            for (int i = 0; i < 36; i++) {
                p.getInventory().setItem(i, new ItemStack(Items.STONE, 64));
            }
            p.getInventory().setItem(0, new ItemStack(Items.DIAMOND, 61));
        }));
        int[] f2 = new int[1];
        ItemEntity[] part = new ItemEntity[1];
        helper.runAfterDelay(13, () -> {
            f2[0] = B525Mod.EVENTS.size();
            part[0] = new ItemEntity(helper.getLevel(), at.x, at.y, at.z, new ItemStack(Items.DIAMOND, 5));
            part[0].setNoPickUpDelay();
            part[0].setDeltaMovement(Vec3.ZERO);
            helper.getLevel().addFreshEntity(part[0]);
        });
        for (int t = 14; t <= 24; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(26, () -> {
            R.section("X33.pickup", () -> {
                m.put("partial.inventoryDiamonds", p.getInventory().countItem(Items.DIAMOND));
                m.put("partial.leftOnGround", part[0].isRemoved() ? "removed" : B525Help.item(part[0].getItem()));
                m.put("partial.events", mine(f2[0], "Picker"));
                m.put("advancementPickedDone", p.getAdvancements().getOrStartProgress(
                        helper.getLevel().getServer().getAdvancements().get(B525Mod.id("spike/picked"))).isDone());
                part[0].discard();
            });
            R.put("X33.pickup", m);
            ears.close();
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 120)
    public void x33Eating(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "Eater");
        ServerPlayer p = ears.player;
        p.getFoodData().setFoodLevel(6);
        int from = B525Mod.EVENTS.size();
        List<String> done = new ArrayList<>();
        Runnable eat = () -> {
            var r = B525Help.useItem(helper, p, new ItemStack(Items.BREAD, 2));
            done.add("use " + r + " using " + p.isUsingItem() + " remaining " + p.getUseItemRemainingTicks());
        };
        helper.runAfterDelay(1, eat);
        for (int t = 2; t <= 45; t++) {
            int tt = t;
            helper.runAfterDelay(t, () -> {
                boolean was = p.isUsingItem();
                p.doTick();
                if (was && !p.isUsingItem()) {
                    done.add("first bread finished at tick " + tt + ", hand " + B525Help.item(p.getItemInHand(InteractionHand.MAIN_HAND))
                            + ", food " + p.getFoodData().getFoodLevel() + ", tags " + p.entityTags());
                }
            });
        }
        helper.runAfterDelay(46, () -> {
            // Second bread from the same stack: the reward function revoked the advancement, so it can fire again.
            var r = B525Help.useItem(helper, p, p.getItemInHand(InteractionHand.MAIN_HAND));
            done.add("second use " + r);
            p.removeTag("b525_ate_reward");
        });
        for (int t = 47; t <= 90; t++) {
            int tt = t;
            helper.runAfterDelay(t, () -> {
                boolean was = p.isUsingItem();
                p.doTick();
                if (was && !p.isUsingItem()) {
                    done.add("second bread finished at tick " + tt + ", hand " + B525Help.item(p.getItemInHand(InteractionHand.MAIN_HAND))
                            + ", tags " + p.entityTags());
                }
            });
        }
        // Interrupted: start eating and stop after 10 ticks (no event expected).
        helper.runAfterDelay(92, () -> {
            p.getFoodData().setFoodLevel(6);
            B525Help.useItem(helper, p, new ItemStack(Items.COOKED_BEEF));
        });
        for (int t = 93; t <= 102; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(103, () -> {
            p.releaseUsingItem();
            done.add("interrupted: using " + p.isUsingItem() + ", beef left " + B525Help.item(p.getItemInHand(InteractionHand.MAIN_HAND)));
        });
        helper.runAfterDelay(106, () -> {
            R.section("X33.eating", () -> {
                m.put("steps", done);
                m.put("events", mine(from, "Eater"));
            });
            R.put("X33.eating", m);
            ears.close();
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 300)
    public void x33Sleeping(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        MinecraftServer server = helper.getLevel().getServer();
        CommandSourceStack console = server.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
        BlockPos foot = new BlockPos(2, 1, 2);
        BlockPos head = foot.south();
        BlockState footState = Blocks.BED.red().defaultBlockState().setValue(AbstractBedBlock.FACING, Direction.SOUTH).setValue(AbstractBedBlock.PART, BedPart.FOOT);
        helper.setBlock(foot, footState);
        helper.setBlock(head, footState.setValue(AbstractBedBlock.PART, BedPart.HEAD));
        B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(1, 1, 2), GameType.SURVIVAL, "Sleeper");
        ServerPlayer p = ears.player;
        int from = B525Mod.EVENTS.size();
        server.getCommands().performPrefixedCommand(console, "time set midnight");
        List<String> steps = new ArrayList<>();
        helper.runAfterDelay(2, () -> {
            var r = B525Help.use(helper, p, head, Direction.UP, ItemStack.EMPTY);
            steps.add("use bed " + r + ", sleeping " + p.isSleeping() + ", players in level " + helper.getLevel().players().size());
        });
        int[] woke = {-1};
        for (int t = 3; t <= 260; t++) {
            int tt = t;
            helper.runAfterDelay(t, () -> {
                if (woke[0] < 0) {
                    p.doTick();
                    if (!p.isSleeping()) {
                        woke[0] = tt;
                        steps.add("woke by itself at tick " + tt + " sleepTimer " + p.getSleepTimer());
                    }
                }
            });
        }
        helper.runAfterDelay(262, () -> {
            if (woke[0] < 0) {
                steps.add("still sleeping at 262 (sleepTimer " + p.getSleepTimer() + ", long enough " + p.isSleepingLongEnough()
                        + "); stopSleepInBed(false, true), the leave-bed button");
                p.stopSleepInBed(false, true);
            }
        });
        helper.runAfterDelay(265, () -> {
            R.section("X33.sleeping", () -> {
                m.put("steps", steps);
                m.put("events", mine(from, "Sleeper"));
                m.put("advancementSleptDone", p.getAdvancements().getOrStartProgress(server.getAdvancements().get(B525Mod.id("spike/slept"))).isDone());
            });
            server.getCommands().performPrefixedCommand(console, "time set noon");
            R.put("X33.sleeping", m);
            ears.close();
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 20)
    public void x33AdvancementByCommand(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        MinecraftServer server = helper.getLevel().getServer();
        try (B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "Granted")) {
            int from = B525Mod.EVENTS.size();
            CommandSourceStack source = ears.player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
            server.getCommands().performPrefixedCommand(source, "advancement grant @s only msm_b525:spike/picked");
            server.getCommands().performPrefixedCommand(source, "advancement grant @s only msm_b525:spike/picked");
            server.getCommands().performPrefixedCommand(source, "advancement grant @s only minecraft:story/mine_stone");
            m.put("events", mine(from, "Granted"));
        }
        R.put("X33.advancementByCommand", m);
        helper.succeed();
    }
}
