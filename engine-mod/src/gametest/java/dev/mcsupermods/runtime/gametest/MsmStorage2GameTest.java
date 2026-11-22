package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.container.MsmContainerBlock;
import dev.mcsupermods.runtime.registry.container.MsmDoubleChestBlock;
import dev.mcsupermods.runtime.registry.container.MsmDoubleChestBlockEntity;
import dev.mcsupermods.runtime.registry.container.MsmStorageBlockEntity;
import dev.mcsupermods.runtime.registry.container.MsmWaterloggedContainerBlock;
import dev.mcsupermods.runtime.registry.container.MsmWeatheringContainerBlock;
import dev.mcsupermods.runtime.registry.container.PlayerStores;
import dev.mcsupermods.runtime.registry.machine.MsmMachineBlockEntity;
import dev.mcsupermods.runtime.registry.weathering.Lightning;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.advancements.predicates.ItemPredicate;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.core.component.DataComponentPatch;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.Connection;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.util.ProblemReporter;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Container;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.LockCode;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChangeOverTimeBlock;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.HopperBlock;
import net.minecraft.world.level.block.entity.BaseContainerBlockEntity;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.ChestType;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for storage 2 (ADR 0104 D3 to D6, B513) on {@code msm/msm_test/block/storage2_*}: waterlogged containers and
 * machines (block entity, menu, hoppers, comparator, the water left when broken), double chests (joining, one six-row
 * menu, hoppers and comparators per half, breaking one half of a full pair, sneak-placing, {@code hoppers: false},
 * {@code on_open} once), per-player stores (two players, two block ids, death, the Nether, the saved attachment, no
 * hoppers or comparator, one store across weathering stages) and containers that age, are waxed, scraped and struck by
 * lightning keeping their contents, custom name and lock (a double chest's halves together), and the load rules.
 *
 * <p>Uses go through {@code ServerPlayerGameMode.useItemOn}, as the network handler does, so Fabric's
 * {@code UseBlockCallback} (waxing and scraping) and vanilla's chest placement run.
 */
public class MsmStorage2GameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper, Vec3 at, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.snapTo(helper.absoluteVec(at));
        return player;
    }

    /** A right-click on {@code face} of the block at {@code rel} holding {@code stack}, as the network handler does. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel, Direction face, ItemStack stack) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 hitAt = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        BlockHitResult hit = new BlockHitResult(hitAt, face, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
    }

    private static Container container(GameTestHelper helper, BlockPos rel) {
        return helper.getLevel().getBlockEntity(helper.absolutePos(rel)) instanceof Container c ? c : null;
    }

    private static int count(Container c, Item item) {
        int n = 0;
        for (int i = 0; i < c.getContainerSize(); i++) {
            if (c.getItem(i).is(item)) {
                n += c.getItem(i).getCount();
            }
        }
        return n;
    }

    private static int dropped(GameTestHelper helper, BlockPos rel, Item item) {
        int n = 0;
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(1.5),
                e -> e.getItem().is(item))) {
            n += e.getItem().getCount();
        }
        return n;
    }

    private static BlockState hopperDown() {
        return Blocks.HOPPER.defaultBlockState().setValue(HopperBlock.FACING, Direction.DOWN);
    }

    /** Forced random ticks with a fixed sequence until the block at {@code rel} is no longer {@code from}; the tick count. */
    private static int ageOnce(GameTestHelper helper, BlockPos rel, Block from) {
        ServerLevel level = helper.getLevel();
        RandomSource random = RandomSource.create(13L);
        int k = 0;
        while (helper.getBlockState(rel).is(from) && k < 50_000) {
            helper.getBlockState(rel).randomTick(level, helper.absolutePos(rel), random);
            k++;
        }
        return k;
    }

    /** Records the {@code storage2_*} events fired at any of {@code at}. */
    private static final class Recorder implements EventListener, AutoCloseable {
        private final List<String> firings = Collections.synchronizedList(new ArrayList<>());
        private final Set<BlockPos> at;

        Recorder(BlockPos... at) {
            this.at = Set.of(at);
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.getNamespace().equals("msm_test") && event.getPath().startsWith("storage2_") && depth == 1 && at.contains(ctx.block())) {
                firings.add(event.getPath() + (ctx.player() != null && ctx.other() == ctx.player() ? "" : " (not the player)"));
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

    /** A survival player on a connection inside an {@code EmbeddedChannel}: in the player list, so it can die and respawn. */
    private static final class Joined implements AutoCloseable {
        ServerPlayer player;
        private final EmbeddedChannel channel;
        private final MinecraftServer server;

        Joined(GameTestHelper helper, Vec3 at, String name) {
            server = helper.getLevel().getServer();
            GameProfile profile = new GameProfile(UUID.randomUUID(), name);
            CommonListenerCookie cookie = CommonListenerCookie.createInitial(profile, false);
            player = new ServerPlayer(server, helper.getLevel(), profile, cookie.clientInformation());
            Connection connection = new Connection(PacketFlow.SERVERBOUND);
            channel = new EmbeddedChannel(connection);
            server.getPlayerList().placeNewPlayer(connection, player, cookie);
            player.setGameMode(GameType.SURVIVAL);
            player.snapTo(helper.absoluteVec(at));
        }

        ServerPlayer respawn() {
            player = server.getPlayerList().respawn(player, false, Entity.RemovalReason.KILLED);
            return player;
        }

        @Override
        public void close() {
            server.getPlayerList().remove(player);
            channel.close();
        }
    }

    /** Opens the block at {@code rel} as {@code player}, reads the menu's items and optionally puts one stack in; closes it. */
    private static List<String> openAndPut(GameTestHelper helper, ServerPlayer player, BlockPos rel, ItemStack put, int slot) {
        use(helper, player, rel, Direction.UP, ItemStack.EMPTY);
        helper.assertTrue(player.containerMenu instanceof ChestMenu, "no chest menu for " + player.getName().getString() + ": "
                + player.containerMenu);
        Container shown = ((ChestMenu) player.containerMenu).getContainer();
        List<String> out = new ArrayList<>();
        for (int i = 0; i < shown.getContainerSize(); i++) {
            if (!shown.getItem(i).isEmpty()) {
                out.add(i + "=" + shown.getItem(i).getCount() + " " + BuiltInRegistries.ITEM.getKey(shown.getItem(i).getItem()).getPath());
            }
        }
        if (put != null) {
            shown.setItem(slot, put);
        }
        player.closeContainer();
        return out;
    }

    // Loading (ADR 0104 D3, D6: limit Q8 lifted)

    @GameTest
    public void containersHoldWaterAndAgeAndMachinesHoldWater(GameTestHelper helper) {
        helper.assertTrue(block("storage2_wet_crate") instanceof MsmWaterloggedContainerBlock, "wet crate class " + block("storage2_wet_crate"));
        helper.assertTrue(block("storage2_wet_furnace") instanceof MsmWaterloggedContainerBlock, "wet furnace class");
        helper.assertTrue(block("storage2_tin_crate") instanceof MsmWeatheringContainerBlock, "tin crate class");
        helper.assertTrue(block("storage2_wet_tin_crate") instanceof MsmWeatheringContainerBlock.Waterlogged, "wet tin crate class");
        helper.assertTrue(block("storage2_double") instanceof MsmDoubleChestBlock, "double class");
        helper.assertTrue(block("storage2_tin_double") instanceof MsmDoubleChestBlock.Weathers, "tin double class");
        helper.assertTrue(block("storage2_store") instanceof MsmContainerBlock, "store class");
        helper.assertTrue(block("storage2_tin_store") instanceof MsmWeatheringContainerBlock, "tin store class");
        helper.assertTrue(!(block("storage2_ageing_machine") instanceof ChangeOverTimeBlock<?>), "a machine weathers");
        for (String path : List.of("storage2_wet_crate", "storage2_wet_furnace", "storage2_double", "storage2_tin_double")) {
            helper.assertTrue(block(path).defaultBlockState().hasProperty(BlockStateProperties.WATERLOGGED), path + " cannot hold water");
            helper.assertTrue(BuiltInRegistries.BLOCK_ENTITY_TYPE.containsKey(id(path)), path + ": no block entity type with its id");
        }
        List<String> problems = new ArrayList<>(MsmRuntime.report().warnings());
        problems.addAll(MsmRuntime.report().errors());
        List<String> own = problems.stream().filter(p -> p.contains("storage2_") && !p.contains("storage2_ageing_machine")).toList();
        helper.assertTrue(own.isEmpty(), "storage 2 problems: " + own);
        helper.assertTrue(MsmRuntime.report().warnings().stream().anyMatch(w -> w.contains("storage2_ageing_machine")
                && w.contains("msm:weathering") && w.contains("msm:machine")), "no warning for a weathering machine");
        helper.succeed();
    }

    // Waterlogged containers and machines (D3; B503 X7)

    @GameTest(maxTicks = 100)
    public void aWaterloggedContainerKeepsItsBlockEntityMenuHoppersAndComparator(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at.below(), Blocks.STONE);
        helper.setBlock(at, Blocks.WATER);
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 4.5), GameType.SURVIVAL);
        InteractionResult placed = use(helper, player, at.below(), Direction.UP, new ItemStack(item("storage2_wet_crate")));
        helper.assertTrue(placed.consumesAction(), "place result " + placed);
        BlockState state = helper.getBlockState(at);
        helper.assertTrue(state.is(block("storage2_wet_crate")) && state.getValue(BlockStateProperties.WATERLOGGED), "not waterlogged: " + state);
        helper.assertTrue(state.getFluidState().is(Fluids.WATER) && state.getFluidState().isSource(), "holds no water source");
        helper.assertTrue(helper.getLevel().getBlockEntity(helper.absolutePos(at)) instanceof MsmStorageBlockEntity, "no block entity");
        use(helper, player, at, Direction.UP, ItemStack.EMPTY);
        helper.assertTrue(player.containerMenu instanceof ChestMenu menu && menu.getRowCount() == 3, "menu " + player.containerMenu);
        player.closeContainer();
        // A hopper above feeds it, one below empties it, and the comparator reads it.
        BlockPos hopperAt = new BlockPos(4, 3, 2);
        BlockPos crateAt = new BlockPos(4, 2, 2);
        helper.setBlock(new BlockPos(4, 0, 2), Blocks.STONE);
        helper.setBlock(new BlockPos(4, 1, 2), hopperDown());
        helper.setBlock(crateAt, block("storage2_wet_crate").defaultBlockState().setValue(BlockStateProperties.WATERLOGGED, true));
        helper.setBlock(hopperAt, hopperDown());
        container(helper, hopperAt).setItem(0, new ItemStack(Items.DIAMOND, 3));
        helper.succeedWhen(() -> {
            helper.assertValueEqual(count(container(helper, new BlockPos(4, 1, 2)), Items.DIAMOND), 3, "diamonds through the wet crate");
            container(helper, crateAt).setItem(5, new ItemStack(Items.STONE, 64));
            int signal = helper.getBlockState(crateAt).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(crateAt), Direction.EAST);
            helper.assertTrue(signal > 0, "comparator reads " + signal);
            helper.getLevel().destroyBlock(helper.absolutePos(crateAt), true);
            helper.assertTrue(helper.getBlockState(crateAt).is(Blocks.WATER) && helper.getBlockState(crateAt).getFluidState().isSource(),
                    "no water source left: " + helper.getBlockState(crateAt));
            helper.assertTrue(dropped(helper, crateAt, Items.STONE) == 64, "the contents did not drop");
        });
    }

    @GameTest
    public void aWaterloggedMachineKeepsItsMenuAndLeavesWater(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at.below(), Blocks.STONE);
        helper.setBlock(at, Blocks.WATER);
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 4.5), GameType.SURVIVAL);
        use(helper, player, at.below(), Direction.UP, new ItemStack(item("storage2_wet_furnace")));
        BlockState state = helper.getBlockState(at);
        helper.assertTrue(state.is(block("storage2_wet_furnace")) && state.getValue(BlockStateProperties.WATERLOGGED), "not waterlogged: " + state);
        helper.assertTrue(state.hasProperty(BlockStateProperties.LIT), "the machine lost its lit property");
        helper.assertTrue(helper.getLevel().getBlockEntity(helper.absolutePos(at)) instanceof MsmMachineBlockEntity, "no machine block entity");
        use(helper, player, at, Direction.UP, ItemStack.EMPTY);
        helper.assertTrue(player.containerMenu != player.inventoryMenu, "no machine menu");
        player.closeContainer();
        helper.getLevel().destroyBlock(helper.absolutePos(at), true);
        helper.assertTrue(helper.getBlockState(at).is(Blocks.WATER), "no water left: " + helper.getBlockState(at));
        helper.succeed();
    }

    // Double chests (D4; B503 X8)

    /** Places two double chests side by side at {@code a} and {@code a.east()} as a player facing north; returns the player. */
    private static ServerPlayer placePair(GameTestHelper helper, BlockPos a, String path) {
        BlockPos b = a.east();
        helper.setBlock(a.below(), Blocks.STONE);
        helper.setBlock(b.below(), Blocks.STONE);
        ServerPlayer player = player(helper, new Vec3(a.getX() + 0.5, a.getY(), a.getZ() + 3.5), GameType.SURVIVAL);
        player.setYRot(180f);
        player.setYHeadRot(180f);
        use(helper, player, a.below(), Direction.UP, new ItemStack(item(path)));
        use(helper, player, b.below(), Direction.UP, new ItemStack(item(path)));
        return player;
    }

    private static ChestType type(GameTestHelper helper, BlockPos rel) {
        return helper.getBlockState(rel).getValue(ChestBlock.TYPE);
    }

    @GameTest
    public void doubleChestsJoinWithOneSixRowMenuAndHalvesOfTheirOwn(GameTestHelper helper) {
        BlockPos a = new BlockPos(2, 2, 2);
        BlockPos b = a.east();
        ServerPlayer player = placePair(helper, a, "storage2_double");
        helper.assertTrue(type(helper, a) != ChestType.SINGLE && type(helper, b) != ChestType.SINGLE && type(helper, a) != type(helper, b),
                "not joined: " + helper.getBlockState(a) + " / " + helper.getBlockState(b));
        helper.assertTrue(helper.getLevel().getBlockEntity(helper.absolutePos(a)) instanceof MsmDoubleChestBlockEntity, "half a has no own block entity");
        helper.assertTrue(helper.getLevel().getBlockEntity(helper.absolutePos(b)) instanceof MsmDoubleChestBlockEntity, "half b has no own block entity");
        use(helper, player, a, Direction.UP, ItemStack.EMPTY);
        helper.assertTrue(player.containerMenu instanceof ChestMenu, "no chest menu: " + player.containerMenu);
        ChestMenu menu = (ChestMenu) player.containerMenu;
        helper.assertValueEqual(menu.getRowCount(), 6, "rows");
        helper.assertValueEqual(menu.getContainer().getContainerSize(), 54, "slots");
        menu.getContainer().setItem(1, new ItemStack(Items.GOLD_INGOT, 2));
        menu.getContainer().setItem(40, new ItemStack(Items.EMERALD, 5));
        player.closeContainer();
        int gold = count(container(helper, a), Items.GOLD_INGOT) + count(container(helper, b), Items.GOLD_INGOT);
        int emerald = count(container(helper, a), Items.EMERALD) + count(container(helper, b), Items.EMERALD);
        helper.assertValueEqual(gold + emerald, 7, "items in the halves");
        helper.assertTrue(count(container(helper, a), Items.GOLD_INGOT) == 0 || count(container(helper, a), Items.EMERALD) == 0,
                "one half holds both stacks");
        helper.assertValueEqual(container(helper, a).getContainerSize(), 27, "half size");
        for (BlockPos half : List.of(a, b)) {
            int signal = helper.getBlockState(half).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(half), Direction.SOUTH);
            helper.assertTrue(signal > 0, "comparator at " + half + " reads " + signal);
        }
        helper.succeed();
    }

    @GameTest
    public void doubleChestFiresOnOpenAndOnCloseOnce(GameTestHelper helper) {
        BlockPos a = new BlockPos(2, 2, 2);
        ServerPlayer player = placePair(helper, a, "storage2_double");
        try (Recorder recorder = new Recorder(helper.absolutePos(a), helper.absolutePos(a.east()))) {
            use(helper, player, a.east(), Direction.UP, ItemStack.EMPTY);
            player.closeContainer();
            helper.assertValueEqual(recorder.all(), List.of("storage2_opened", "storage2_closed"), "events");
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 100)
    public void hoppersFeedEachHalfAndASealedDoubleChestRefusesThem(GameTestHelper helper) {
        BlockPos a = new BlockPos(1, 2, 1);
        BlockPos b = a.east();
        placePair(helper, a, "storage2_double");
        BlockPos sa = new BlockPos(4, 2, 1);
        BlockPos sb = sa.east();
        placePair(helper, sa, "storage2_double_sealed");
        helper.assertTrue(type(helper, sa) != ChestType.SINGLE, "the sealed pair did not join");
        for (BlockPos half : List.of(a, b, sa, sb)) {
            helper.setBlock(half.above(), hopperDown());
        }
        container(helper, a.above()).setItem(0, new ItemStack(Items.DIAMOND, 1));
        container(helper, b.above()).setItem(0, new ItemStack(Items.COAL, 1));
        container(helper, sa.above()).setItem(0, new ItemStack(Items.DIAMOND, 1));
        container(helper, sb.above()).setItem(0, new ItemStack(Items.COAL, 1));
        helper.assertTrue(!block("storage2_double_sealed").defaultBlockState().hasAnalogOutputSignal(), "a comparator: false chest has a signal");
        helper.runAfterDelay(40, () -> {
            int diamonds = count(container(helper, a), Items.DIAMOND) + count(container(helper, b), Items.DIAMOND);
            int coal = count(container(helper, a), Items.COAL) + count(container(helper, b), Items.COAL);
            helper.assertValueEqual(diamonds + coal, 2, "items fed into the pair");
            helper.assertValueEqual(count(container(helper, sa.above()), Items.DIAMOND), 1, "a hopper fed the sealed chest");
            helper.assertValueEqual(count(container(helper, sb.above()), Items.COAL), 1, "a hopper fed the sealed chest's other half");
            helper.assertTrue(container(helper, sa).isEmpty() && container(helper, sb).isEmpty(), "the sealed chest got items");
            helper.succeed();
        });
    }

    @GameTest
    public void breakingOneHalfOfAFullDoubleChestDropsOnlyItsHalf(GameTestHelper helper) {
        BlockPos a = new BlockPos(2, 2, 2);
        BlockPos b = a.east();
        placePair(helper, a, "storage2_double");
        for (int i = 0; i < 27; i++) {
            container(helper, a).setItem(i, new ItemStack(Items.STONE, 64));
            container(helper, b).setItem(i, new ItemStack(Items.DIRT, 64));
        }
        helper.getLevel().destroyBlock(helper.absolutePos(b), true);
        helper.assertValueEqual(dropped(helper, b, Items.DIRT), 27 * 64, "dirt dropped by the broken half");
        helper.assertValueEqual(dropped(helper, b, Items.STONE), 0, "stone of the other half dropped");
        helper.assertValueEqual(type(helper, a), ChestType.SINGLE, "the half left");
        helper.assertValueEqual(count(container(helper, a), Items.STONE), 27 * 64, "stone kept in the half left");
        helper.succeed();
    }

    @GameTest
    public void sneakPlacingKeepsDoubleChestsApart(GameTestHelper helper) {
        BlockPos a = new BlockPos(2, 2, 2);
        BlockPos b = a.east();
        helper.setBlock(a.below(), Blocks.STONE);
        helper.setBlock(b.below(), Blocks.STONE);
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5), GameType.SURVIVAL);
        player.setYRot(180f);
        player.setYHeadRot(180f);
        use(helper, player, a.below(), Direction.UP, new ItemStack(item("storage2_double")));
        player.setShiftKeyDown(true);
        use(helper, player, b.below(), Direction.UP, new ItemStack(item("storage2_double")));
        player.setShiftKeyDown(false);
        helper.assertTrue(helper.getBlockState(b).is(block("storage2_double")), "not placed: " + helper.getBlockState(b));
        helper.assertValueEqual(type(helper, a), ChestType.SINGLE, "first chest");
        helper.assertValueEqual(type(helper, b), ChestType.SINGLE, "sneak-placed chest");
        use(helper, player, a, Direction.UP, ItemStack.EMPTY);
        helper.assertTrue(player.containerMenu instanceof ChestMenu menu && menu.getRowCount() == 3, "single menu " + player.containerMenu);
        player.closeContainer();
        helper.succeed();
    }

    // Per-player storage (D5; B503 X9)

    @GameTest(maxTicks = 60)
    public void eachPlayerSeesTheirOwnStorePerBlock(GameTestHelper helper) {
        BlockPos store = new BlockPos(2, 2, 2);
        BlockPos two = new BlockPos(4, 2, 2);
        helper.setBlock(store, block("storage2_store"));
        helper.setBlock(two, block("storage2_store_two"));
        try (Joined ann = new Joined(helper, new Vec3(2.5, 2, 4.5), "Ann"); Joined ben = new Joined(helper, new Vec3(3.5, 2, 4.5), "Ben");
                Recorder recorder = new Recorder(helper.absolutePos(store))) {
            helper.assertValueEqual(openAndPut(helper, ann.player, store, new ItemStack(Items.DIAMOND, 4), 0), List.of(), "Ann first");
            helper.assertValueEqual(openAndPut(helper, ben.player, store, new ItemStack(Items.EMERALD, 2), 3), List.of(), "Ben first");
            helper.assertValueEqual(openAndPut(helper, ann.player, store, null, 0), List.of("0=4 diamond"), "Ann again");
            helper.assertValueEqual(openAndPut(helper, ben.player, store, null, 0), List.of("3=2 emerald"), "Ben again");
            helper.assertValueEqual(openAndPut(helper, ann.player, two, null, 0), List.of(), "Ann at another block id");
            helper.assertTrue(container(helper, store).isEmpty(), "the block itself holds items");
            helper.assertValueEqual(recorder.all().size(), 8, "on_open and on_close per opening: " + recorder.all());
            helper.assertTrue(!helper.getBlockState(store).getValue(BlockStateProperties.OPEN), "left open after every menu closed");
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 60)
    public void aStoreOutlivesDeathAndATripToTheNether(GameTestHelper helper) {
        BlockPos store = new BlockPos(2, 2, 2);
        helper.setBlock(store, block("storage2_store"));
        String key = PlayerStores.key(block("storage2_store"));
        try (Joined ann = new Joined(helper, new Vec3(2.5, 2, 4.5), "Ann")) {
            openAndPut(helper, ann.player, store, new ItemStack(Items.DIAMOND, 4), 0);
            ServerPlayer before = ann.player;
            before.kill(helper.getLevel());
            ServerPlayer after = ann.respawn();
            helper.assertTrue(before != after, "the respawned player is the same object");
            helper.assertValueEqual(PlayerStores.contents(after, key).getFirst().getCount(), 4, "store after respawn");
            after.snapTo(helper.absoluteVec(new Vec3(2.5, 2, 4.5)));
            helper.assertValueEqual(openAndPut(helper, after, store, null, 0), List.of("0=4 diamond"), "after respawn");
            ServerLevel nether = helper.getLevel().getServer().getLevel(Level.NETHER);
            Entity moved = after.teleport(new TeleportTransition(nether, new Vec3(0.5, 70, 0.5), Vec3.ZERO, 0f, 0f, TeleportTransition.DO_NOTHING));
            helper.assertTrue(moved instanceof ServerPlayer, "no player in the Nether");
            helper.assertValueEqual(PlayerStores.contents((ServerPlayer) moved, key).getFirst().getCount(), 4, "store in the Nether");
            ServerPlayer back = (ServerPlayer) moved.teleport(new TeleportTransition(helper.getLevel(),
                    helper.absoluteVec(new Vec3(2.5, 2, 4.5)), Vec3.ZERO, 0f, 0f, TeleportTransition.DO_NOTHING));
            ann.player = back;
            helper.assertValueEqual(openAndPut(helper, back, store, null, 0), List.of("0=4 diamond"), "back from the Nether");
            TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, helper.getLevel().registryAccess());
            back.saveWithoutId(out);
            CompoundTag saved = out.buildResult();
            helper.assertTrue(saved.contains("fabric:attachments") && saved.get("fabric:attachments").toString().contains(PlayerStores.ID.toString()),
                    "the store is not saved with the player: " + saved.keySet());
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 100)
    public void aStoreHasNoHoppersOrComparator(GameTestHelper helper) {
        BlockPos store = new BlockPos(2, 2, 2);
        helper.setBlock(new BlockPos(2, 0, 2), Blocks.STONE);
        helper.setBlock(new BlockPos(2, 1, 2), hopperDown());
        helper.setBlock(store, block("storage2_store"));
        helper.setBlock(store.above(), hopperDown());
        container(helper, store.above()).setItem(0, new ItemStack(Items.DIAMOND, 2));
        helper.assertTrue(!helper.getBlockState(store).hasAnalogOutputSignal(), "a per-player chest has a comparator signal");
        helper.runAfterDelay(40, () -> {
            helper.assertValueEqual(count(container(helper, store.above()), Items.DIAMOND), 2, "a hopper fed the store");
            helper.assertTrue(container(helper, store).isEmpty(), "the block took items");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 60)
    public void aWeatheringStoreKeepsOneStoreAcrossItsStages(GameTestHelper helper) {
        BlockPos store = new BlockPos(2, 2, 2);
        helper.setBlock(store, block("storage2_tin_store"));
        try (Joined ann = new Joined(helper, new Vec3(2.5, 2, 4.5), "Ann")) {
            openAndPut(helper, ann.player, store, new ItemStack(Items.APPLE, 3), 2);
            int ticks = ageOnce(helper, store, block("storage2_tin_store"));
            helper.assertTrue(helper.getBlockState(store).is(block("storage2_exposed_tin_store")), "did not age after " + ticks + " ticks: "
                    + helper.getBlockState(store));
            helper.assertValueEqual(openAndPut(helper, ann.player, store, null, 0), List.of("2=3 apple"), "store after ageing");
        }
        helper.succeed();
    }

    // Weathering containers (D6; B503 X13)

    private static void nameAndLock(GameTestHelper helper, BlockPos rel) {
        BlockEntity be = helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        LockCode lock = new LockCode(ItemPredicate.Builder.item().of(helper.getLevel().registryAccess().lookupOrThrow(Registries.ITEM), Items.DIAMOND).build());
        be.applyComponents(DataComponentMap.builder().set(DataComponents.CUSTOM_NAME, Component.literal("Tin box"))
                .set(DataComponents.LOCK, lock).build(), DataComponentPatch.EMPTY);
        be.setChanged();
    }

    private static void assertNameAndLock(GameTestHelper helper, BlockPos rel, String what) {
        BaseContainerBlockEntity be = (BaseContainerBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        helper.assertTrue(be.getCustomName() != null && be.getCustomName().getString().equals("Tin box"), what + ": name " + be.getCustomName());
        helper.assertTrue(be.isLocked(), what + ": the lock is gone");
    }

    private static void fill(GameTestHelper helper, BlockPos rel) {
        Container c = container(helper, rel);
        c.setItem(0, new ItemStack(Items.DIAMOND, 7));
        c.setItem(13, new ItemStack(Items.APPLE, 3));
    }

    private static void assertFilled(GameTestHelper helper, BlockPos rel, String what) {
        Container c = container(helper, rel);
        helper.assertTrue(c != null, what + ": no container");
        helper.assertTrue(c.getItem(0).is(Items.DIAMOND) && c.getItem(0).getCount() == 7 && c.getItem(13).is(Items.APPLE)
                && c.getItem(13).getCount() == 3, what + ": contents " + c.getItem(0) + ", " + c.getItem(13));
        helper.assertValueEqual(dropped(helper, rel, Items.DIAMOND), 0, what + ": diamonds dropped");
    }

    @GameTest
    public void anAgedContainerKeepsItsContentsNameAndLock(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at, block("storage2_tin_crate"));
        nameAndLock(helper, at); // applying components first: a map without a container component empties the block
        fill(helper, at);
        assertNameAndLock(helper, at, "before");
        int ticks = ageOnce(helper, at, block("storage2_tin_crate"));
        helper.assertTrue(helper.getBlockState(at).is(block("storage2_exposed_tin_crate")), "did not age after " + ticks + " ticks");
        assertFilled(helper, at, "aged");
        assertNameAndLock(helper, at, "aged");
        helper.assertTrue(helper.getLevel().getBlockEntity(helper.absolutePos(at)).getType() == BuiltInRegistries.BLOCK_ENTITY_TYPE
                .getValue(id("storage2_exposed_tin_crate")), "the block entity is not the new block's type");
        helper.succeed();
    }

    @GameTest
    public void waxingScrapingAndLightningKeepAContainersContents(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at, block("storage2_tin_crate"));
        fill(helper, at);
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 4.5), GameType.SURVIVAL);
        InteractionResult waxed = use(helper, player, at, Direction.UP, new ItemStack(Items.HONEYCOMB));
        helper.assertTrue(waxed.consumesAction() && helper.getBlockState(at).is(block("storage2_waxed_tin_crate")),
                "not waxed: " + waxed + " " + helper.getBlockState(at));
        assertFilled(helper, at, "waxed");
        use(helper, player, at, Direction.UP, new ItemStack(Items.IRON_AXE));
        helper.assertTrue(helper.getBlockState(at).is(block("storage2_tin_crate")), "not unwaxed: " + helper.getBlockState(at));
        assertFilled(helper, at, "unwaxed");
        container(helper, at).clearContent(); // so replacing it below drops nothing
        helper.setBlock(at, block("storage2_exposed_tin_crate"));
        fill(helper, at);
        use(helper, player, at, Direction.UP, new ItemStack(Items.IRON_AXE));
        helper.assertTrue(helper.getBlockState(at).is(block("storage2_tin_crate")), "not scraped: " + helper.getBlockState(at));
        assertFilled(helper, at, "scraped");
        container(helper, at).clearContent();
        helper.setBlock(at, block("storage2_exposed_tin_crate"));
        fill(helper, at);
        Lightning.strike(helper.getLevel(), helper.absolutePos(at), RandomSource.create(5L));
        helper.assertTrue(helper.getBlockState(at).is(block("storage2_tin_crate")), "lightning left " + helper.getBlockState(at));
        assertFilled(helper, at, "struck");
        helper.succeed();
    }

    @GameTest
    public void aDoubleChestAgesBothHalvesTogether(GameTestHelper helper) {
        BlockPos a = new BlockPos(2, 2, 2);
        BlockPos b = a.east();
        ServerPlayer player = placePair(helper, a, "storage2_tin_double");
        helper.assertTrue(type(helper, a) != ChestType.SINGLE, "the pair did not join");
        nameAndLock(helper, b);
        fill(helper, a);
        container(helper, b).setItem(4, new ItemStack(Items.COAL, 9));
        int ticks = ageOnce(helper, a, block("storage2_tin_double"));
        for (BlockPos half : List.of(a, b)) {
            helper.assertTrue(helper.getBlockState(half).is(block("storage2_exposed_tin_double")), "half " + half + " after " + ticks
                    + " ticks: " + helper.getBlockState(half));
            helper.assertTrue(type(helper, half) != ChestType.SINGLE, "half " + half + " came apart");
        }
        assertFilled(helper, a, "aged half a");
        helper.assertValueEqual(count(container(helper, b), Items.COAL), 9, "coal in half b");
        assertNameAndLock(helper, b, "aged half b");
        helper.assertValueEqual(dropped(helper, b, Items.COAL), 0, "coal dropped");
        // The lock on half b keeps the pair shut for a player without the key, as vanilla's double chest.
        use(helper, player, a, Direction.UP, ItemStack.EMPTY);
        helper.assertTrue(!(player.containerMenu instanceof ChestMenu), "a locked pair opened: " + player.containerMenu);
        BaseContainerBlockEntity lockedHalf = (BaseContainerBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(b));
        lockedHalf.applyComponents(DataComponentMap.builder().set(DataComponents.LOCK, LockCode.NO_LOCK).build(), DataComponentPatch.EMPTY);
        use(helper, player, a, Direction.UP, ItemStack.EMPTY);
        helper.assertTrue(player.containerMenu instanceof ChestMenu menu && menu.getRowCount() == 6, "aged pair menu " + player.containerMenu);
        player.closeContainer();
        helper.succeed();
    }
}
