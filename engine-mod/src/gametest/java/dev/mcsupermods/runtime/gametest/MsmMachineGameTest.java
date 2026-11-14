package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.container.MsmContainerBlock;
import dev.mcsupermods.runtime.registry.machine.MsmFurnaceMenu;
import dev.mcsupermods.runtime.registry.machine.MsmMachineBlockEntity;
import dev.mcsupermods.runtime.registry.machine.MsmMachineResultSlot;
import dev.mcsupermods.runtime.registry.types.MsmSlabBlock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.AbstractFurnaceMenu;
import net.minecraft.world.inventory.BlastFurnaceMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.FurnaceMenu;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.inventory.SmokerMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HopperBlock;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.HopperBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Machines (ADR 0075 D1, D3–D6, B316) on {@code msm/msm_test/block/machine_*.json} and the recipes under
 * {@code data/msm_test/recipe/machine/}: registration and the load-time rules, the {@code lit} property and its light,
 * fuel, {@code redstone} and {@code always} power, recipe time, {@code count} and {@code speed}, a full output, hopper
 * faces, comparator modes, experience, breaking, {@code on_start}/{@code on_finish} and the furnace menus.
 *
 * <p>Machines: {@code machine_grinder} (fuel, its own recipes, 40 ticks), {@code machine_mixer} (always, its own and the
 * grinder's recipes, comparator progress, events, light 3/15), {@code machine_fast} (always, the grinder's recipes,
 * speed 2), {@code machine_sealed} (always, no hoppers, no comparator), {@code machine_press} (redstone, smoker menu),
 * {@code machine_blaster} (blasting, blast furnace menu); {@code machine_both} and {@code machine_slab} are broken on
 * purpose.
 */
public class MsmMachineGameTest {
    private static final BlockPos AT = new BlockPos(2, 2, 2);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    static MsmMachineBlockEntity place(GameTestHelper helper, BlockPos rel, String path) {
        helper.setBlock(rel, block(path));
        BlockEntity be = helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        helper.assertTrue(be instanceof MsmMachineBlockEntity, path + " has no machine block entity: " + be);
        return (MsmMachineBlockEntity) be;
    }

    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(AT.getX() + 0.5, AT.getY(), AT.getZ() + 2.5)));
        return player;
    }

    /** A right-click on the top of the block at {@code rel} with the main hand, as the network handler does. */
    private static void use(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND), InteractionHand.MAIN_HAND, hit);
    }

    private static boolean lit(GameTestHelper helper, BlockPos rel) {
        return helper.getBlockState(rel).getValue(MsmBlock.LIT);
    }

    private static int count(MsmMachineBlockEntity be, int slot, Item item) {
        ItemStack stack = be.getItem(slot);
        return stack.is(item) ? stack.getCount() : 0;
    }

    private static int dropped(GameTestHelper helper, BlockPos rel, Item item) {
        int n = 0;
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(2))) {
            if (e.getItem().is(item)) {
                n += e.getItem().getCount();
            }
        }
        return n;
    }

    private static int orbs(GameTestHelper helper, Vec3 at) {
        return helper.getLevel().getEntitiesOfClass(ExperienceOrb.class, new AABB(at, at).inflate(3)).stream()
                .mapToInt(ExperienceOrb::getValue).sum();
    }

    /** Records the firings of {@code msm_test} machine events at one block; other tests run at the same time. */
    private static final class Recorder implements EventListener, AutoCloseable {
        private final List<String> firings = Collections.synchronizedList(new ArrayList<>());
        private final BlockPos at;

        Recorder(BlockPos at) {
            this.at = at;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.getNamespace().equals("msm_test") && depth == 1 && at.equals(ctx.block())) {
                firings.add(event.getPath() + (ctx.player() == null && ctx.other() == null ? "" : " (with an actor)"));
            }
        }

        List<String> all() {
            synchronized (firings) {
                return List.copyOf(firings);
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    // Loading (ADR 0075 D1, D2)

    @GameTest
    public void machinesRegisterBlockEntityAndRecipeTypes(GameTestHelper helper) {
        for (String path : List.of("machine_grinder", "machine_smelter", "machine_blaster", "machine_press", "machine_mixer",
                "machine_fast", "machine_sealed", "machine_both")) {
            Block b = block(path);
            helper.assertTrue(b instanceof MsmContainerBlock, path + " is not an MsmContainerBlock: " + b);
            helper.assertTrue(BuiltInRegistries.BLOCK_ENTITY_TYPE.containsKey(id(path)), path + ": no block entity type with its id");
            helper.assertTrue(BuiltInRegistries.RECIPE_TYPE.containsKey(id(path)), path + ": no recipe type with its id");
            helper.assertTrue(BuiltInRegistries.RECIPE_SERIALIZER.containsKey(id(path)), path + ": no recipe serializer with its id");
            helper.assertValueEqual(BuiltInRegistries.RECIPE_TYPE.getValue(id(path)).toString(), id(path).toString(), path + " recipe type name");
            helper.assertTrue(b.defaultBlockState().hasProperty(MsmBlock.LIT), path + " has no lit property");
            helper.assertFalse(b.defaultBlockState().getValue(MsmBlock.LIT), path + " starts lit");
            helper.assertFalse(b.defaultBlockState().hasProperty(MsmBlock.OPEN), path + " has an open property");
        }
        helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("/machine_") && !e.contains("machine_both.json")
                && !e.contains("machine_slab.json")), "machine errors: " + MsmRuntime.report().errors());
        helper.succeed();
    }

    @GameTest
    public void machineWithAContainerDropsTheContainer(GameTestHelper helper) {
        long count = MsmRuntime.report().errors().stream().filter(e -> e.contains("machine_both.json")).count();
        helper.assertValueEqual(count, 1L, "errors for machine_both");
        helper.assertTrue(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("machine_both.json")
                && e.contains("msm:machine and msm:container are not allowed together")), "no error: " + MsmRuntime.report().errors());
        MsmMachineBlockEntity be = place(helper, AT, "machine_both");
        helper.assertValueEqual(be.getContainerSize(), 3, "slots of machine_both");
        helper.assertFalse(block("machine_both").defaultBlockState().hasProperty(MsmBlock.OPEN), "machine_both has an open property");
        helper.succeed();
    }

    @GameTest
    public void machineOnASlabIsDroppedWithOneError(GameTestHelper helper) {
        Block slab = block("machine_slab");
        helper.assertTrue(slab instanceof MsmSlabBlock, "machine_slab not registered as a slab: " + slab);
        helper.assertFalse(slab.defaultBlockState().hasBlockEntity(), "the slab has a block entity");
        helper.assertFalse(BuiltInRegistries.RECIPE_TYPE.containsKey(id("machine_slab")), "the slab has a recipe type");
        long count = MsmRuntime.report().errors().stream().filter(e -> e.contains("machine_slab.json")).count();
        helper.assertValueEqual(count, 1L, "errors for machine_slab");
        helper.assertTrue(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("machine_slab.json")
                && e.contains("msm:machine is not allowed on type 'slab'")), "no error for the slab: " + MsmRuntime.report().errors());
        helper.succeed();
    }

    // The lit property and its light (ADR 0075 D1)

    @GameTest
    public void litPropertyRotatesAndMirrors(GameTestHelper helper) {
        BlockState state = block("machine_grinder").defaultBlockState().setValue(MsmBlock.HORIZONTAL_FACING, Direction.NORTH)
                .setValue(MsmBlock.LIT, true);
        BlockState turned = state.rotate(Rotation.CLOCKWISE_90);
        helper.assertValueEqual(turned.getValue(MsmBlock.HORIZONTAL_FACING), Direction.EAST, "facing after rotating");
        helper.assertTrue(turned.getValue(MsmBlock.LIT), "lit lost by rotating");
        BlockState mirrored = state.mirror(Mirror.LEFT_RIGHT);
        helper.assertValueEqual(mirrored.getValue(MsmBlock.HORIZONTAL_FACING), Direction.SOUTH, "facing after mirroring");
        helper.assertTrue(mirrored.getValue(MsmBlock.LIT), "lit lost by mirroring");
        helper.succeed();
    }

    @GameTest
    public void lightFollowsLit(GameTestHelper helper) {
        BlockState grinder = block("machine_grinder").defaultBlockState();
        helper.assertValueEqual(grinder.getLightEmission(), 0, "grinder light idle");
        helper.assertValueEqual(grinder.setValue(MsmBlock.LIT, true).getLightEmission(), 13, "grinder light lit (default lit_light)");
        BlockState mixer = block("machine_mixer").defaultBlockState();
        helper.assertValueEqual(mixer.getLightEmission(), 3, "mixer light idle (msm:light_emitter)");
        helper.assertValueEqual(mixer.setValue(MsmBlock.LIT, true).getLightEmission(), 15, "mixer light lit (lit_light)");
        helper.succeed();
    }

    // Fuel (ADR 0075 D1, D3)

    @GameTest(maxTicks = 80)
    public void fuelMachineMakesItsResultAfterItsTime(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_grinder");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.COBBLESTONE));
        be.setItem(MsmMachineBlockEntity.FUEL, new ItemStack(Items.COAL));
        helper.runAfterDelay(30, () -> {
            helper.assertTrue(lit(helper, AT), "not lit while working");
            helper.assertTrue(be.working(), "not working");
            helper.assertValueEqual(be.totalTime(), 40, "total time (default_time)");
            helper.assertTrue(be.getItem(MsmMachineBlockEntity.OUTPUT).isEmpty(), "output before 40 ticks: " + be.getItem(2));
            helper.assertTrue(be.getItem(MsmMachineBlockEntity.FUEL).isEmpty(), "the coal was not burned");
        });
        helper.runAfterDelay(50, () -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.GRAVEL), 1, "gravel made");
            helper.assertTrue(be.getItem(MsmMachineBlockEntity.INPUT).isEmpty(), "cobblestone left");
            helper.assertFalse(be.working(), "working with nothing to do");
            helper.assertTrue(lit(helper, AT), "the coal still burns: lit");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 160)
    public void litTurnsOffWhenTheFuelBurnsOut(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_grinder");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.COBBLESTONE));
        be.setItem(MsmMachineBlockEntity.FUEL, new ItemStack(Items.STICK)); // 100 ticks
        helper.runAfterDelay(10, () -> helper.assertTrue(lit(helper, AT), "not lit while working"));
        helper.runAfterDelay(130, () -> {
            helper.assertFalse(lit(helper, AT), "still lit after the stick burned out");
            helper.assertValueEqual(be.litTime(), 0, "fuel ticks left");
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.GRAVEL), 1, "gravel made");
            helper.succeed();
        });
    }

    // Recipes: count and speed (ADR 0075 D1, D2)

    @GameTest(maxTicks = 100)
    public void countTwoUsesTwoInputs(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_mixer"); // takes the grinder's recipes too
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.ANDESITE, 3));
        helper.runAfterDelay(70, () -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.DIORITE), 1, "diorite made from two andesite");
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.INPUT, Items.ANDESITE), 1, "andesite left (one is not enough)");
            helper.assertFalse(be.working(), "working on one andesite");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 60)
    public void speedTwoHalvesTheTime(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_fast");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.COBBLESTONE));
        helper.runAfterDelay(12, () -> {
            helper.assertValueEqual(be.totalTime(), 20, "total time at speed 2 (40 / 2)");
            helper.assertTrue(be.getItem(MsmMachineBlockEntity.OUTPUT).isEmpty(), "output before 20 ticks");
        });
        helper.runAfterDelay(30, () -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.GRAVEL), 1, "gravel made at speed 2");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 80)
    public void fullOutputStopsTheMachine(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_fast");
        be.setItem(MsmMachineBlockEntity.OUTPUT, new ItemStack(Items.GRAVEL, 64));
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.COBBLESTONE));
        helper.runAfterDelay(50, () -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.INPUT, Items.COBBLESTONE), 1, "cobblestone used with a full output");
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.GRAVEL), 64, "output");
            helper.assertValueEqual(be.progress(), 0, "progress with a full output");
            helper.assertFalse(lit(helper, AT), "lit with a full output");
            helper.succeed();
        });
    }

    // Power (ADR 0075 D1)

    @GameTest(maxTicks = 120)
    public void redstoneMachineWaitsForPower(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_press");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.CLAY_BALL));
        helper.runAfterDelay(30, () -> {
            helper.assertValueEqual(be.progress(), 0, "progress without power");
            helper.assertFalse(lit(helper, AT), "lit without power");
            helper.assertTrue(be.getItem(MsmMachineBlockEntity.OUTPUT).isEmpty(), "output without power");
            helper.setBlock(AT.east(), Blocks.REDSTONE_BLOCK);
        });
        helper.runAfterDelay(40, () -> helper.assertTrue(lit(helper, AT), "not lit while powered and working"));
        helper.runAfterDelay(60, () -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.BRICK), 2, "bricks made once powered");
            helper.assertFalse(lit(helper, AT), "lit with nothing to do");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 60)
    public void alwaysMachineNeedsNoFuel(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_mixer");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.RED_SAND));
        helper.runAfterDelay(8, () -> helper.assertTrue(lit(helper, AT), "not lit while working"));
        helper.runAfterDelay(30, () -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.GLASS), 1, "glass made without fuel");
            helper.assertTrue(be.getItem(MsmMachineBlockEntity.FUEL).isEmpty(), "fuel slot");
            helper.assertFalse(lit(helper, AT), "lit with nothing to do");
            helper.succeed();
        });
    }

    @GameTest
    public void fuelSlotTakesFuelOnlyWithFuelPower(GameTestHelper helper) {
        MsmMachineBlockEntity grinder = place(helper, AT, "machine_grinder");
        helper.assertTrue(grinder.canPlaceItem(MsmMachineBlockEntity.FUEL, new ItemStack(Items.COAL)), "fuel machine refused coal");
        helper.assertTrue(grinder.canPlaceItem(MsmMachineBlockEntity.FUEL, new ItemStack(Items.BUCKET)), "fuel machine refused a bucket");
        helper.assertFalse(grinder.canPlaceItem(MsmMachineBlockEntity.FUEL, new ItemStack(Items.COBBLESTONE)), "fuel slot took stone");
        helper.assertFalse(grinder.canPlaceItem(MsmMachineBlockEntity.OUTPUT, new ItemStack(Items.GRAVEL)), "output slot took gravel");
        MsmMachineBlockEntity press = place(helper, AT.east(2), "machine_press");
        helper.assertFalse(press.isFuel(new ItemStack(Items.COAL)), "a redstone machine takes fuel");
        helper.assertFalse(press.canPlaceItem(MsmMachineBlockEntity.FUEL, new ItemStack(Items.COAL)), "a redstone machine's fuel slot took coal");
        helper.succeed();
    }

    // Hoppers (ADR 0075 D5)

    @GameTest(maxTicks = 120)
    public void hoppersReachTheFurnaceFaces(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmMachineBlockEntity be = place(helper, AT, "machine_grinder");
        be.setItem(MsmMachineBlockEntity.OUTPUT, new ItemStack(Items.GRAVEL, 3));
        helper.setBlock(AT.above(), Blocks.HOPPER); // facing down: into the top
        helper.setBlock(AT.east(), Blocks.HOPPER.defaultBlockState().setValue(HopperBlock.FACING, Direction.WEST)); // into a side
        helper.setBlock(AT.below(), Blocks.HOPPER); // pulls from the bottom
        HopperBlockEntity above = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.above()));
        HopperBlockEntity side = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.east()));
        HopperBlockEntity below = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.below()));
        above.setItem(0, new ItemStack(Items.COBBLESTONE));
        side.setItem(0, new ItemStack(Items.COAL));
        side.setItem(1, new ItemStack(Items.ANDESITE)); // not a fuel: stays in the side hopper
        helper.succeedWhen(() -> {
            helper.assertValueEqual(above.countItem(Items.COBBLESTONE), 0, "cobblestone left in the top hopper");
            helper.assertValueEqual(side.countItem(Items.COAL), 0, "coal left in the side hopper");
            helper.assertValueEqual(side.countItem(Items.ANDESITE), 1, "andesite in the side hopper");
            helper.assertValueEqual(below.countItem(Items.GRAVEL), 4, "gravel pulled out of the bottom (3 + 1 made)");
            helper.assertFalse(be.getItem(MsmMachineBlockEntity.FUEL).is(Items.ANDESITE), "andesite in the fuel slot");
        });
    }

    @GameTest(maxTicks = 80)
    public void hoppersFalseKeepsHoppersOut(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmMachineBlockEntity be = place(helper, AT, "machine_sealed");
        be.setItem(MsmMachineBlockEntity.OUTPUT, new ItemStack(Items.GRAVEL, 2));
        helper.setBlock(AT.above(), Blocks.HOPPER);
        helper.setBlock(AT.below(), Blocks.HOPPER);
        HopperBlockEntity above = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.above()));
        HopperBlockEntity below = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.below()));
        above.setItem(0, new ItemStack(Items.COBBLESTONE));
        helper.assertValueEqual(be.getSlotsForFace(Direction.UP).length, 0, "top slots");
        helper.runAfterDelay(40, () -> {
            helper.assertValueEqual(above.countItem(Items.COBBLESTONE), 1, "cobblestone moved into a sealed machine");
            helper.assertValueEqual(below.countItem(Items.GRAVEL), 0, "gravel moved out of a sealed machine");
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.GRAVEL), 2, "gravel left in the sealed machine");
            helper.succeed();
        });
    }

    // Comparators (ADR 0075 D5)

    @GameTest(maxTicks = 60)
    public void comparatorModes(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmMachineBlockEntity grinder = place(helper, AT, "machine_grinder");
        grinder.setItem(MsmMachineBlockEntity.OUTPUT, new ItemStack(Items.GRAVEL, 32));
        BlockState grinderState = helper.getBlockState(AT);
        helper.assertTrue(grinderState.hasAnalogOutputSignal(), "contents: no analog output");
        int contents = grinderState.getAnalogOutputSignal(level, helper.absolutePos(AT), Direction.NORTH);
        helper.assertValueEqual(contents, AbstractContainerMenu.getRedstoneSignalFromContainer(grinder), "contents signal");
        helper.assertTrue(contents > 0, "contents signal 0 with items");
        MsmMachineBlockEntity sealed = place(helper, AT.east(3), "machine_sealed");
        sealed.setItem(MsmMachineBlockEntity.OUTPUT, new ItemStack(Items.GRAVEL, 32));
        helper.assertFalse(helper.getBlockState(AT.east(3)).hasAnalogOutputSignal(), "comparator none has an analog output");
        BlockPos mixerAt = AT.south(3);
        MsmMachineBlockEntity mixer = place(helper, mixerAt, "machine_mixer");
        helper.assertTrue(helper.getBlockState(mixerAt).hasAnalogOutputSignal(), "progress: no analog output");
        helper.assertValueEqual(helper.getBlockState(mixerAt).getAnalogOutputSignal(level, helper.absolutePos(mixerAt), Direction.NORTH), 0,
                "progress signal while idle");
        mixer.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.SAND));
        int[] first = new int[1];
        helper.runAfterDelay(5, () -> {
            first[0] = helper.getBlockState(mixerAt).getAnalogOutputSignal(level, helper.absolutePos(mixerAt), Direction.NORTH);
            helper.assertTrue(first[0] > 0, "progress signal 0 while working");
        });
        helper.runAfterDelay(15, () -> {
            int later = helper.getBlockState(mixerAt).getAnalogOutputSignal(level, helper.absolutePos(mixerAt), Direction.NORTH);
            helper.assertTrue(later > first[0], "progress signal did not rise: " + first[0] + " then " + later);
            helper.succeed();
        });
    }

    // Experience and breaking (ADR 0075 D6)

    @GameTest(maxTicks = 80)
    public void takingTheResultPaysTheExperience(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_fast");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.COBBLESTONE));
        helper.runAfterDelay(30, () -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.GRAVEL), 1, "gravel made");
            helper.assertValueEqual(be.storedExperience(), 2.0f, "experience stored");
            ServerPlayer player = player(helper);
            use(helper, player, AT);
            AbstractContainerMenu menu = player.containerMenu;
            helper.assertTrue(menu instanceof FurnaceMenu, "not a furnace menu: " + menu);
            helper.assertTrue(menu.getSlot(AbstractFurnaceMenu.RESULT_SLOT) instanceof MsmMachineResultSlot slot
                    && slot.index == AbstractFurnaceMenu.RESULT_SLOT, "result slot: " + menu.getSlot(AbstractFurnaceMenu.RESULT_SLOT));
            menu.clicked(AbstractFurnaceMenu.RESULT_SLOT, 0, ContainerInput.QUICK_MOVE, player);
            helper.assertValueEqual(player.getInventory().countItem(Items.GRAVEL), 1, "gravel taken");
            helper.assertValueEqual(be.storedExperience(), 0.0f, "experience left in the machine");
            helper.assertValueEqual(orbs(helper, player.position()), 2, "experience orbs at the player");
            player.closeContainer();
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 80)
    public void breakingDropsContentsAndExperience(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_sealed");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.COBBLESTONE, 2));
        helper.runAfterDelay(45, () -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.GRAVEL), 1, "gravel made");
            helper.getLevel().destroyBlock(helper.absolutePos(AT), true);
            helper.assertValueEqual(dropped(helper, AT, Items.GRAVEL), 1, "gravel dropped");
            helper.assertValueEqual(dropped(helper, AT, Items.COBBLESTONE), 1, "cobblestone dropped");
            helper.assertValueEqual(orbs(helper, Vec3.atCenterOf(helper.absolutePos(AT))), 2, "experience orbs dropped");
            helper.succeed();
        });
    }

    // Events (ADR 0075 D1, D3)

    @GameTest(maxTicks = 100)
    public void eventsFireOncePerOutputWithNoActor(GameTestHelper helper) {
        MsmMachineBlockEntity be = place(helper, AT, "machine_mixer");
        Recorder r = new Recorder(helper.absolutePos(AT));
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.SAND, 2));
        helper.runAfterDelay(70, () -> {
            try (r) {
                helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.GLASS), 2, "glass made");
                helper.assertValueEqual(r.all(), List.of("machine_started", "machine_finished", "machine_started", "machine_finished"),
                        "events");
            }
            helper.succeed();
        });
    }

    // Menus (ADR 0075 D4)

    @GameTest(maxTicks = 60)
    public void menusAreTheVanillaFurnaceMenus(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        record Case(String path, Class<?> menu, MenuType<?> type) {}
        for (Case c : List.of(new Case("machine_grinder", MsmFurnaceMenu.class, MenuType.FURNACE),
                new Case("machine_blaster", BlastFurnaceMenu.class, MenuType.BLAST_FURNACE),
                new Case("machine_press", SmokerMenu.class, MenuType.SMOKER))) {
            place(helper, AT, c.path());
            use(helper, player, AT);
            AbstractContainerMenu menu = player.containerMenu;
            helper.assertTrue(c.menu().isInstance(menu), c.path() + ": menu " + menu);
            helper.assertTrue(menu.getType() == c.type(), c.path() + ": menu type " + BuiltInRegistries.MENU.getKey(menu.getType()));
            helper.assertTrue(menu.getSlot(AbstractFurnaceMenu.RESULT_SLOT) instanceof MsmMachineResultSlot, c.path() + ": result slot");
            player.closeContainer();
            helper.setBlock(AT, Blocks.AIR);
        }
        // Holding an item opens the menu too, and the menu's data reads the progress.
        MsmMachineBlockEntity mixer = place(helper, AT, "machine_mixer");
        mixer.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.SAND));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STICK));
        use(helper, player, AT);
        helper.assertTrue(player.containerMenu instanceof FurnaceMenu, "not opened with an item in hand: " + player.containerMenu);
        AbstractFurnaceMenu menu = (AbstractFurnaceMenu) player.containerMenu;
        helper.runAfterDelay(10, () -> {
            helper.assertTrue(menu.getBurnProgress() > 0, "menu progress 0 while working");
            helper.assertTrue(menu.isLit(), "menu flame off while working");
            player.closeContainer();
            helper.succeed();
        });
    }

    @GameTest
    public void shiftClickFollowsTheMachineRules(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        place(helper, AT, "machine_grinder");
        player.getInventory().setItem(9, new ItemStack(Items.COBBLESTONE, 5));
        player.getInventory().setItem(10, new ItemStack(Items.COAL, 2));
        player.getInventory().setItem(11, new ItemStack(Items.RAW_IRON, 1)); // smelting, not the grinder's
        use(helper, player, AT);
        AbstractContainerMenu menu = player.containerMenu;
        helper.assertTrue(menu instanceof MsmFurnaceMenu, "not a machine menu: " + menu);
        // Menu slots: 0 input, 1 fuel, 2 output, then the 27 inventory slots (inventory 9 is menu slot 3) and the hotbar.
        menu.quickMoveStack(player, 3);
        menu.quickMoveStack(player, 4);
        menu.quickMoveStack(player, 5);
        helper.assertTrue(menu.getSlot(0).getItem().is(Items.COBBLESTONE), "cobblestone not moved into the input: " + menu.getSlot(0).getItem());
        helper.assertTrue(menu.getSlot(1).getItem().is(Items.COAL), "coal not moved into the fuel slot: " + menu.getSlot(1).getItem());
        helper.assertValueEqual(player.getInventory().countItem(Items.RAW_IRON), 1, "raw iron moved into the grinder");
        player.closeContainer();
        helper.setBlock(AT, Blocks.AIR);
        place(helper, AT, "machine_press");
        player.getInventory().setItem(10, new ItemStack(Items.COAL, 2));
        use(helper, player, AT);
        AbstractContainerMenu press = player.containerMenu;
        press.quickMoveStack(player, 4);
        helper.assertTrue(press.getSlot(1).getItem().isEmpty(), "coal moved into a redstone machine: " + press.getSlot(1).getItem());
        player.closeContainer();
        helper.succeed();
    }

    // Saving (ADR 0075 D3)

    @GameTest(maxTicks = 60)
    public void progressAndExperienceSurviveSaving(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmMachineBlockEntity be = place(helper, AT, "machine_fast");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.COBBLESTONE, 2));
        helper.runAfterDelay(30, () -> {
            CompoundTag tag = be.saveWithFullMetadata(level.registryAccess());
            helper.assertValueEqual(tag.getListOrEmpty("Items").size(), 2, "saved Items: " + tag);
            BlockEntity loaded = BlockEntity.loadStatic(helper.absolutePos(AT), be.getBlockState(), tag, level.registryAccess());
            helper.assertTrue(loaded instanceof MsmMachineBlockEntity, "not loaded as a machine: " + loaded);
            MsmMachineBlockEntity m = (MsmMachineBlockEntity) loaded;
            helper.assertValueEqual(m.storedExperience(), be.storedExperience(), "experience after loading");
            helper.assertValueEqual(m.progress(), be.progress(), "progress after loading");
            helper.assertValueEqual(count(m, MsmMachineBlockEntity.OUTPUT, Items.GRAVEL), 1, "gravel after loading");
            helper.succeed();
        });
    }
}
