package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundLevelEventPacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.FilteredText;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.tags.FluidTags;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.SignBlockEntity;
import net.minecraft.world.level.block.entity.SignTextSlot;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-vanilla-blocks} (ADRs 0094 to 0096, 0101 D6; B464), written against
 * vanilla and Fabric API only, so the same tests run against the content jar (the runtime's classes, B445 to B454) and
 * the ejected jar (the generated ones, B457). Run with {@code --gametest-filter msm_parity_tests:sample_vanilla_blocks_parity_test_*}
 * (or {@code sample_vanilla_blocks_*} on a content jar, which also runs {@link SampleVanillaBlocksScriptParityTest}: the
 * sample's Script API 1.6 script and its rules that need a script are not ejected, B462b).
 *
 * <p>Black box, as {@code SampleVehiclesParityTest} (B426): states are set and tested with {@code setblock} and
 * {@code execute if block} (their names are the format's), light with {@code getLightEmission}, loot with
 * {@code Block.getDrops}, uses through {@code ServerPlayerGameMode.useItemOn} and {@code useItem} (which fire Fabric's
 * callbacks as a click does), menus through {@code AbstractContainerMenu.clicked} as the network handler calls it, and
 * what others see and hear through the packets a second {@link ParityEars} player receives. Each class keeps its own
 * mechanism: where the runtime and the eject differ inside (the bag guard refuses a click; the eject puts the item back
 * after it), the tests compare the outcome (B450's note).
 *
 * <p>Covered: the 31 blocks (with the conveyor, B462b), 34 items and four companions, the item ids of the berry bush, pod and stem, stack sizes and
 * vanilla tags; the {@code as_listed} tab's contents in registration order (block items, then items, each by file path;
 * B454's correction) and the {@code by_name} tab's by display name (B464a); tin ageing at vanilla copper's rate with a lower-stage neighbour (project or vanilla) stopping it in both
 * directions (B449's measurements); honeycomb and axe with level events 3003, 3004 and 3005; water in the sea lamp and the
 * vanilla-waterlogged types; the three bag layouts, opening, sounds, saved contents and the guard's outcome (no bag or
 * shulker box goes in, the bag never moves, nothing is copied); the bundle; {@code /greet} and {@code /hiya},
 * {@code /kit}'s macro values, range, permission and the {@code execute as} fork (B454, B457); signs sounding as vanilla
 * spruce signs and taking text, dye, glow and wax (B457a); sleeping in the bed and its spawn; the cake's slices and
 * refused candle; the berry harvest; light levels; drops by piece; the stem's fruit; scaffolding falling unsupported;
 * primed TNT breaking project blocks as vanilla blocks of the same resistance (no rule keeps a TNT blast's blocks); the
 * plain rule on {@code /greet} (a cookie after the wave, ejected with the command, B462b).
 *
 * <p>Not covered here: sign text written from a real client
 * (the client GameTest {@code MsmVanillaBlocksClientGameTest} does that on a dedicated server), anything drawn.
 */
public class SampleVanillaBlocksParityTest {
    static final String NAMESPACE = "msm_sample_vanilla_blocks";
    private static final String ARENA = "msm_parity_tests:arena";
    /** Where {@link #ifBlock} places its gold block when the predicate matches. */
    private static final BlockPos MARKER = new BlockPos(9, 3, 9);

    /** The fixture's 31 blocks. */
    private static final List<String> BLOCKS = List.of("honey_cake", "blue_berry_bush", "tall_bluebell", "potted_grass_tuft", "ivy",
            "glow_pod", "moss_rug", "ash_layer", "coffee_pod", "tallow_candle", "cosy_bed", "rope_ladder", "ember_torch", "paper_lantern",
            "brass_chain", "crystal_rod", "cedar_sign", "cedar_hanging_sign", "gourd_stem", "gourd", "bamboo_frame", "sea_lamp", "tin",
            "exposed_tin", "weathered_tin", "oxidized_tin", "waxed_tin", "waxed_exposed_tin", "waxed_weathered_tin", "waxed_oxidized_tin",
            "conveyor");
    /** The blocks the types make beside their own, without items. */
    private static final List<String> COMPANIONS = List.of("ember_torch_wall", "cedar_sign_wall", "cedar_hanging_sign_wall",
            "gourd_stem_attached");
    /**
     * The {@code as_listed} tab's contents: block items, then items, each by definition file path (the runtime's
     * registration order); the tin set is in the other tab.
     */
    private static final List<String> TAB = List.of("ash_layer", "bamboo_frame", "blue_berries", "brass_chain", "cedar_hanging_sign",
            "cedar_sign", "coffee_beans", "conveyor", "cosy_bed", "crystal_rod", "ember_torch", "glow_pod", "gourd", "gourd_seeds", "honey_cake", "ivy",
            "moss_rug", "paper_lantern", "rope_ladder", "sea_lamp", "tall_bluebell", "tallow_candle", "charm_bundle", "satchel", "seed_pouch",
            "tool_kit");
    /**
     * The {@code by_name} tab {@code tin_blocks} (B464a): the tin set sorted by display name ("Block of Tin" first), which
     * differs from its registration order ({@link #TIN_BY_ID}).
     */
    private static final List<String> TIN_TAB = List.of("tin", "exposed_tin", "oxidized_tin", "waxed_tin", "waxed_exposed_tin",
            "waxed_oxidized_tin", "waxed_weathered_tin", "weathered_tin");
    /** The tin set in registration order (by file path), which a {@code by_name} tab must not keep. */
    private static final List<String> TIN_BY_ID = List.of("exposed_tin", "oxidized_tin", "tin", "waxed_exposed_tin", "waxed_oxidized_tin",
            "waxed_tin", "waxed_weathered_tin", "weathered_tin");
    /** The tin set's display names, in {@link #TIN_TAB} order. */
    private static final List<String> TIN_NAMES = List.of("Block of Tin", "Exposed Tin", "Oxidised Tin", "Waxed Block of Tin",
            "Waxed Exposed Tin", "Waxed Oxidised Tin", "Waxed Weathered Tin", "Weathered Tin");

    private static final Identifier CHIME = Identifier.withDefaultNamespace("block.note_block.chime");
    private static final Identifier BELL = Identifier.withDefaultNamespace("block.note_block.bell");
    private static final Identifier BASS = Identifier.withDefaultNamespace("block.note_block.bass");
    private static final Identifier LEATHER = Identifier.withDefaultNamespace("item.armor.equip_leather");
    private static final Identifier BURP = Identifier.withDefaultNamespace("entity.player.burp");
    private static final Identifier AXE_SCRAPE = Identifier.withDefaultNamespace("item.axe.scrape");
    private static final Identifier AXE_WAX_OFF = Identifier.withDefaultNamespace("item.axe.wax_off");
    /** Vanilla's level events for waxing, scraping and taking wax off (B449, B457). */
    private static final int WAX_ON = 3003;
    private static final int WAX_OFF = 3004;
    private static final int SCRAPE = 3005;
    private static final String GREET_TEXT = "Hello from the vanilla blocks sample!";
    private static final String KIT_TEXT = "A kit of candles is on its way.";

    static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    private static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(path)), "item " + id(path) + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static String coords(GameTestHelper helper, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        return abs.getX() + " " + abs.getY() + " " + abs.getZ();
    }

    private static MinecraftServer server(GameTestHelper helper) {
        return helper.getLevel().getServer();
    }

    /** Runs a command with {@code source} and returns its result (0 when it failed or did not parse). */
    private static int command(CommandSourceStack source, String command) {
        AtomicInteger result = new AtomicInteger();
        source.getServer().getCommands().performPrefixedCommand(source.withCallback((success, value) ->
                result.set(success ? Math.max(value, 1) : 0)), command);
        return result.get();
    }

    /** Runs a command as the server in the test's level. */
    private static int command(GameTestHelper helper, String command) {
        return command(server(helper).createCommandSourceStack().withLevel(helper.getLevel()).withSuppressedOutput(), command);
    }

    private static void setblock(GameTestHelper helper, BlockPos rel, String blockAndState) {
        helper.assertTrue(command(helper, "setblock " + coords(helper, rel) + " " + blockAndState) > 0, "setblock " + blockAndState + " failed");
    }

    /** Whether {@code execute if block} matches (an unknown block or state name reads as false). */
    private static boolean ifBlock(GameTestHelper helper, BlockPos rel, String predicate) {
        helper.setBlock(MARKER, Blocks.AIR);
        command(helper, "execute if block " + coords(helper, rel) + " " + predicate + " run setblock " + coords(helper, MARKER)
                + " minecraft:gold_block");
        boolean matched = helper.getBlockState(MARKER).is(Blocks.GOLD_BLOCK);
        helper.setBlock(MARKER, Blocks.AIR);
        return matched;
    }

    private static void assertIfBlock(GameTestHelper helper, BlockPos rel, String predicate) {
        helper.assertTrue(ifBlock(helper, rel, predicate), "execute if block " + predicate + " did not match: " + helper.getBlockState(rel));
    }

    /** Clears the arena's inside above its stone floor (y 1 to 3). */
    private static void clear(GameTestHelper helper) {
        for (int x = 1; x <= 9; x++) {
            for (int z = 1; z <= 9; z++) {
                for (int y = 1; y <= 3; y++) {
                    helper.setBlock(x, y, z, Blocks.AIR);
                }
            }
        }
    }

    /** The player clicks face {@code face} of the block at {@code rel} with {@code stack} through the game mode, as a click does. */
    private static InteractionResult click(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel, Direction face) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 at = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        return player.gameMode.useItemOn(player, helper.getLevel(), stack, InteractionHand.MAIN_HAND, new BlockHitResult(at, face, abs, false));
    }

    /** A block item placed on face {@code face} of the block at {@code rel}, as {@code BlockItem.useOn} does for a click. */
    private static InteractionResult place(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel, Direction face) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 at = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        return stack.useOn(new UseOnContext(player, InteractionHand.MAIN_HAND, new BlockHitResult(at, face, abs, false)));
    }

    /** Turns the player to face south (yaw 0): placed beds and signs take their direction from it. */
    private static void faceSouth(ServerPlayer player) {
        player.setYRot(0);
        player.setYHeadRot(0);
        player.setXRot(0);
    }

    private static List<Identifier> sounds(List<Packet<?>> packets) {
        List<Identifier> out = new ArrayList<>();
        for (Packet<?> p : packets) {
            if (p instanceof ClientboundSoundPacket s) {
                out.add(s.getSound().value().location());
            }
        }
        return out;
    }

    private static List<Integer> levelEvents(List<Packet<?>> packets, BlockPos abs) {
        List<Integer> out = new ArrayList<>();
        for (Packet<?> p : packets) {
            if (p instanceof ClientboundLevelEventPacket e && e.getPos().equals(abs)) {
                out.add(e.getType());
            }
        }
        return out;
    }

    /** Whether a system chat line in {@code packets} reads {@code text} or is its translation key {@code key}. */
    private static boolean saysLine(List<Packet<?>> packets, String text, String key) {
        for (Packet<?> p : packets) {
            if (p instanceof ClientboundSystemChatPacket c && !c.overlay()) {
                Component line = c.content();
                if (line.getString().equals(text) || line.getContents() instanceof TranslatableContents t && t.getKey().equals(key)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static List<String> chatLines(List<Packet<?>> packets) {
        List<String> out = new ArrayList<>();
        for (Packet<?> p : packets) {
            if (p instanceof ClientboundSystemChatPacket c) {
                out.add(c.content().getString());
            }
        }
        return out;
    }

    private static int count(List<ItemStack> stacks, Item item) {
        return stacks.stream().filter(s -> s.is(item)).mapToInt(ItemStack::getCount).sum();
    }

    private static List<ItemStack> drops(GameTestHelper helper, BlockPos rel, String blockAndState, ItemStack tool) {
        setblock(helper, rel, blockAndState);
        return Block.getDrops(helper.getBlockState(rel), helper.getLevel(), helper.absolutePos(rel), null, null, tool);
    }

    /** Item entities of {@code item} within three blocks of {@code rel}, discarded after counting. */
    private static int takeItems(GameTestHelper helper, BlockPos rel, Item item) {
        List<ItemEntity> found = helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(3),
                e -> e.getItem().is(item));
        int n = found.stream().mapToInt(e -> e.getItem().getCount()).sum();
        found.forEach(ItemEntity::discard);
        return n;
    }

    private static TagKey<Block> blockTag(String path) {
        return TagKey.create(Registries.BLOCK, Identifier.withDefaultNamespace(path));
    }

    private static TagKey<Item> itemTag(String path) {
        return TagKey.create(Registries.ITEM, Identifier.withDefaultNamespace(path));
    }

    // Registration, items, tags and the creative tab

    /**
     * The 31 blocks and four companions are registered; 34 items: a block item for every block but the potted grass and
     * the companions, the bush, pod and stem under their item ids, and the four bags and bundle; stack sizes and the
     * vanilla tags the types join.
     */
    @GameTest(structure = ARENA)
    public void blocksItemsCompanionsAndTagsAreRegistered(GameTestHelper helper) {
        BLOCKS.forEach(path -> block(helper, path));
        for (String path : COMPANIONS) {
            block(helper, path);
            helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id(path)), "companion " + path + " has an item");
        }
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("potted_grass_tuft")), "the potted grass has an item");
        Map<String, String> itemOf = new LinkedHashMap<>();
        itemOf.put("blue_berries", "blue_berry_bush");
        itemOf.put("coffee_beans", "coffee_pod");
        itemOf.put("gourd_seeds", "gourd_stem");
        itemOf.forEach((itemPath, blockPath) -> {
            helper.assertTrue(item(helper, itemPath) instanceof BlockItem b && b.getBlock() == block(helper, blockPath),
                    itemPath + " does not place " + blockPath);
            helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id(blockPath)), blockPath + " has an item of its own id");
        });
        int items = 0;
        for (Identifier key : BuiltInRegistries.ITEM.keySet()) {
            if (key.getNamespace().equals(NAMESPACE)) {
                items++;
            }
        }
        helper.assertValueEqual(items, 34, "items in the namespace");
        Map<String, Integer> stacks = Map.of("cedar_sign", 16, "cedar_hanging_sign", 16, "cosy_bed", 1, "honey_cake", 1, "satchel", 1,
                "seed_pouch", 1, "tool_kit", 1, "charm_bundle", 1, "tin", 64, "tallow_candle", 64);
        stacks.forEach((path, size) -> helper.assertValueEqual(new ItemStack(item(helper, path)).getMaxStackSize(), size, path + " stack size"));
        Map<String, List<String>> tags = new LinkedHashMap<>();
        tags.put("climbable", List.of("rope_ladder", "ivy", "bamboo_frame"));
        tags.put("candles", List.of("tallow_candle"));
        tags.put("beds", List.of("cosy_bed"));
        tags.put("standing_signs", List.of("cedar_sign"));
        tags.put("wall_signs", List.of("cedar_sign_wall"));
        tags.put("ceiling_hanging_signs", List.of("cedar_hanging_sign"));
        tags.put("wall_hanging_signs", List.of("cedar_hanging_sign_wall"));
        tags.put("flower_pots", List.of("potted_grass_tuft"));
        tags.forEach((tag, members) -> members.forEach(path -> helper.assertTrue(block(helper, path).defaultBlockState().is(blockTag(tag)),
                path + " is not in #minecraft:" + tag)));
        helper.assertTrue(new ItemStack(item(helper, "tallow_candle")).is(itemTag("candles")), "tallow_candle item is not in #candles");
        helper.assertTrue(new ItemStack(item(helper, "cedar_sign")).is(itemTag("signs")), "cedar_sign item is not in #signs");
        helper.assertTrue(new ItemStack(item(helper, "cedar_hanging_sign")).is(itemTag("hanging_signs")), "hanging sign item tag");
        helper.assertTrue(new ItemStack(item(helper, "cosy_bed")).is(itemTag("beds")), "cosy_bed item is not in #beds");
        helper.succeed();
    }

    /** The tab {@code path}, its contents built on the server as the client builds them (Fabric's output events run). */
    private static CreativeModeTab builtTab(GameTestHelper helper, String path) {
        Identifier tabId = id(path);
        helper.assertTrue(BuiltInRegistries.CREATIVE_MODE_TAB.containsKey(tabId), "tab " + tabId + " not registered");
        CreativeModeTab tab = BuiltInRegistries.CREATIVE_MODE_TAB.getValue(tabId);
        MinecraftServer server = server(helper);
        tab.buildContents(new CreativeModeTab.ItemDisplayParameters(server.getWorldData().enabledFeatures(), true, server.registryAccess()));
        return tab;
    }

    /** The tab {@code vanilla_blocks}: its title key, the paper lantern icon and every item but the tin in registration order. */
    @GameTest(structure = ARENA)
    public void theTabListsEveryItemInRegistrationOrder(GameTestHelper helper) {
        CreativeModeTab tab = builtTab(helper, "vanilla_blocks");
        List<String> got = tab.getDisplayItems().stream().map(s -> BuiltInRegistries.ITEM.getKey(s.getItem()).toString()).toList();
        List<String> expected = TAB.stream().map(p -> NAMESPACE + ":" + p).toList();
        helper.assertValueEqual(got, expected, "tab contents");
        helper.assertTrue(tab.getDisplayName().getContents() instanceof TranslatableContents t
                && t.getKey().equals("itemGroup." + NAMESPACE + ".vanilla_blocks"), "tab title " + tab.getDisplayName());
        helper.assertTrue(tab.getIconItem().is(item(helper, "paper_lantern")), "tab icon " + tab.getIconItem());
        helper.succeed();
    }

    /**
     * The {@code by_name} tab {@code tin_blocks} (B464a): its title key, the tin icon and the eight tin blocks sorted by
     * their display names, which is not their registration order. The names are the project's own (the server reads the
     * mod's language file), so a missing translation, which would sort by key, fails here.
     */
    @GameTest(structure = ARENA)
    public void theByNameTabSortsTheTinByDisplayName(GameTestHelper helper) {
        CreativeModeTab tab = builtTab(helper, "tin_blocks");
        List<String> got = tab.getDisplayItems().stream().map(s -> BuiltInRegistries.ITEM.getKey(s.getItem()).toString()).toList();
        List<String> names = tab.getDisplayItems().stream().map(s -> s.getHoverName().getString()).toList();
        helper.assertValueEqual(got, TIN_TAB.stream().map(p -> NAMESPACE + ":" + p).toList(), "tin tab contents " + names);
        helper.assertValueEqual(names, TIN_NAMES, "tin tab names");
        helper.assertFalse(TIN_TAB.equals(TIN_BY_ID), "the by-name order equals the registration order");
        helper.assertTrue(tab.getDisplayName().getContents() instanceof TranslatableContents t
                && t.getKey().equals("itemGroup." + NAMESPACE + ".tin_blocks"), "tab title " + tab.getDisplayName());
        helper.assertTrue(tab.getIconItem().is(item(helper, "tin")), "tab icon " + tab.getIconItem());
        helper.succeed();
    }

    // Weathering and waxing (ADR 0094 D8, D9)

    /**
     * The share of {@code n} forced random ticks that change {@code start} at (4, 2, 4), with {@code neighbours} (offsets)
     * placed first; one seed, so the project block and vanilla copper see the same random numbers.
     */
    private static double rate(GameTestHelper helper, BlockState start, Map<BlockPos, BlockState> neighbours, int n, BlockState[] became) {
        ServerLevel level = helper.getLevel();
        clear(helper);
        BlockPos c = new BlockPos(4, 2, 4);
        neighbours.forEach((rel, s) -> level.setBlock(helper.absolutePos(c.offset(rel)), s, 2 | 16));
        RandomSource random = RandomSource.create(464L);
        BlockPos abs = helper.absolutePos(c);
        int changes = 0;
        for (int k = 0; k < n; k++) {
            level.setBlock(abs, start, 2 | 16);
            start.randomTick(level, abs, random);
            BlockState now = level.getBlockState(abs);
            if (now != start) {
                changes++;
                became[0] = now;
            }
        }
        clear(helper);
        return changes / (double) n;
    }

    private static void assertNear(GameTestHelper helper, double project, double vanilla, String what) {
        helper.assertTrue(vanilla > 0 && Math.abs(project - vanilla) <= 0.15 * vanilla, what + ": tin " + project + ", copper " + vanilla);
    }

    /**
     * Tin ages stage by stage at vanilla copper's rate (B449: unaffected about 0.044, exposed about 0.058); a lower-stage
     * neighbour stops it, tin or copper, and tin stops copper; three same-stage neighbours slow tin as they slow copper;
     * the last stage and the waxed copies never tick.
     */
    @GameTest(structure = ARENA, maxTicks = 40)
    public void tinAgesAtCoppersRateAndLowerNeighboursStopIt(GameTestHelper helper) {
        int n = 20000;
        Block copper = Blocks.COPPER_BLOCK.weathering().unaffected();
        Block exposedCopper = Blocks.COPPER_BLOCK.weathering().exposed();
        BlockState[] became = new BlockState[1];
        double tin = rate(helper, block(helper, "tin").defaultBlockState(), Map.of(), n, became);
        helper.assertTrue(became[0] != null && became[0].is(block(helper, "exposed_tin")), "tin aged into " + became[0]);
        double exposedTin = rate(helper, block(helper, "exposed_tin").defaultBlockState(), Map.of(), n, became);
        helper.assertTrue(became[0].is(block(helper, "weathered_tin")), "exposed tin aged into " + became[0]);
        rate(helper, block(helper, "weathered_tin").defaultBlockState(), Map.of(), n, became);
        helper.assertTrue(became[0].is(block(helper, "oxidized_tin")), "weathered tin aged into " + became[0]);
        double unaffectedCopper = rate(helper, copper.defaultBlockState(), Map.of(), n, new BlockState[1]);
        double exposedCopperRate = rate(helper, exposedCopper.defaultBlockState(), Map.of(), n, new BlockState[1]);
        assertNear(helper, tin, unaffectedCopper, "unaffected");
        assertNear(helper, exposedTin, exposedCopperRate, "exposed");
        BlockPos two = new BlockPos(2, 0, 0);
        BlockState tinState = block(helper, "tin").defaultBlockState();
        BlockState exposedTinState = block(helper, "exposed_tin").defaultBlockState();
        double tinStopsTin = rate(helper, exposedTinState, Map.of(two, tinState), n, new BlockState[1]);
        double copperStopsTin = rate(helper, exposedTinState, Map.of(two, copper.defaultBlockState()), n, new BlockState[1]);
        double tinStopsCopper = rate(helper, exposedCopper.defaultBlockState(), Map.of(two, tinState), n, new BlockState[1]);
        helper.assertTrue(tinStopsTin == 0 && copperStopsTin == 0 && tinStopsCopper == 0,
                "lower-stage neighbours: tin by tin " + tinStopsTin + ", tin by copper " + copperStopsTin + ", copper by tin " + tinStopsCopper);
        Map<BlockPos, BlockState> threeTin = new LinkedHashMap<>();
        Map<BlockPos, BlockState> threeCopper = new LinkedHashMap<>();
        for (BlockPos p : List.of(new BlockPos(2, 0, 0), new BlockPos(-2, 0, 0), new BlockPos(0, 0, 2))) {
            threeTin.put(p, tinState);
            threeCopper.put(p, copper.defaultBlockState());
        }
        assertNear(helper, rate(helper, tinState, threeTin, n, new BlockState[1]), rate(helper, copper.defaultBlockState(), threeCopper, n,
                new BlockState[1]), "three same-stage neighbours");
        for (String path : List.of("oxidized_tin", "waxed_tin", "waxed_exposed_tin", "waxed_weathered_tin", "waxed_oxidized_tin")) {
            helper.assertFalse(block(helper, path).defaultBlockState().isRandomlyTicking(), path + " ticks randomly");
        }
        helper.assertTrue(tinState.isRandomlyTicking(), "tin does not tick randomly");
        helper.succeed();
    }

    /**
     * Honeycomb waxes each stage (used up in survival, level event 3003); an axe takes the wax off (3004, the wax-off sound)
     * and scrapes a stage back (3005, the scrape sound), losing one durability a use; the unaffected stage is left alone.
     * Each level event reaches others and the acting player too (B464a: a null source, so the actor's client shows it).
     */
    @GameTest(structure = ARENA)
    public void honeycombWaxesAndTheAxeUnwaxesAndScrapes(GameTestHelper helper) {
        clear(helper);
        BlockPos at = new BlockPos(5, 1, 5);
        try (ParityEars actor = new ParityEars(helper, new BlockPos(4, 1, 4), GameType.SURVIVAL, "msm-svb-waxer");
                ParityEars ears = ParityEars.listener(helper, new BlockPos(6, 1, 6))) {
            BlockPos abs = helper.absolutePos(at);
            for (String stage : List.of("tin", "exposed_tin", "weathered_tin", "oxidized_tin")) {
                setblock(helper, at, id(stage).toString());
                ears.packets();
                actor.packets();
                ItemStack honeycomb = new ItemStack(Items.HONEYCOMB, 2);
                InteractionResult result = click(helper, actor.player, honeycomb, at, Direction.UP);
                helper.assertTrue(result.consumesAction(), stage + ": honeycomb " + result);
                helper.assertTrue(helper.getBlockState(at).is(block(helper, "waxed_" + stage)), stage + " waxed into " + helper.getBlockState(at));
                helper.assertValueEqual(actor.player.getMainHandItem().getCount(), 1, stage + ": honeycombs left");
                helper.assertTrue(levelEvents(ears.packets(), abs).contains(WAX_ON), stage + ": no level event 3003");
                helper.assertTrue(levelEvents(actor.packets(), abs).contains(WAX_ON), stage + ": the waxer got no level event 3003");
            }
            ItemStack axe = new ItemStack(Items.IRON_AXE);
            setblock(helper, at, id("waxed_exposed_tin").toString());
            ears.packets();
            actor.packets();
            click(helper, actor.player, axe, at, Direction.UP);
            helper.assertTrue(helper.getBlockState(at).is(block(helper, "exposed_tin")), "unwaxed into " + helper.getBlockState(at));
            List<Packet<?>> heard = ears.packets();
            helper.assertTrue(levelEvents(heard, abs).contains(WAX_OFF), "no level event 3004: " + levelEvents(heard, abs));
            helper.assertTrue(levelEvents(actor.packets(), abs).contains(WAX_OFF), "the actor got no level event 3004");
            helper.assertTrue(sounds(heard).contains(AXE_WAX_OFF), "no wax-off sound: " + sounds(heard));
            helper.assertValueEqual(actor.player.getMainHandItem().getDamageValue(), 1, "axe damage after unwaxing");
            click(helper, actor.player, actor.player.getMainHandItem(), at, Direction.UP);
            helper.assertTrue(helper.getBlockState(at).is(block(helper, "tin")), "scraped into " + helper.getBlockState(at));
            heard = ears.packets();
            helper.assertTrue(levelEvents(heard, abs).contains(SCRAPE), "no level event 3005: " + levelEvents(heard, abs));
            helper.assertTrue(levelEvents(actor.packets(), abs).contains(SCRAPE), "the actor got no level event 3005");
            helper.assertTrue(sounds(heard).contains(AXE_SCRAPE), "no scrape sound: " + sounds(heard));
            helper.assertValueEqual(actor.player.getMainHandItem().getDamageValue(), 2, "axe damage after scraping");
            click(helper, actor.player, actor.player.getMainHandItem(), at, Direction.UP);
            helper.assertTrue(helper.getBlockState(at).is(block(helper, "tin")), "the axe changed tin into " + helper.getBlockState(at));
            helper.assertValueEqual(actor.player.getMainHandItem().getDamageValue(), 2, "axe damaged on tin");
        }
        helper.succeed();
    }

    // Water (ADR 0094 D7)

    /**
     * The sea lamp holds water: placed into a water source it is waterlogged and keeps light 12; broken, the water stays.
     * The lantern, chain, ladder, candle and pod take {@code waterlogged} as their vanilla counterparts do.
     */
    @GameTest(structure = ARENA)
    public void theSeaLampAndTheVanillaWaterloggedTypesHoldWater(GameTestHelper helper) {
        clear(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.setBlock(at, Blocks.WATER);
        try (ParityEars actor = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.SURVIVAL, "msm-svb-lamp")) {
            InteractionResult placed = place(helper, actor.player, new ItemStack(item(helper, "sea_lamp")), at.below(), Direction.UP);
            helper.assertTrue(placed.consumesAction(), "sea lamp placement " + placed);
        }
        assertIfBlock(helper, at, NAMESPACE + ":sea_lamp[waterlogged=true]");
        helper.assertTrue(helper.getBlockState(at).getFluidState().is(FluidTags.WATER), "no water in the lamp");
        helper.assertValueEqual(helper.getBlockState(at).getLightEmission(), 12, "lamp light in water");
        helper.getLevel().destroyBlock(helper.absolutePos(at), false);
        helper.assertTrue(helper.getBlockState(at).getFluidState().is(FluidTags.WATER), "the water left with the lamp: " + helper.getBlockState(at));
        setblock(helper, at, NAMESPACE + ":sea_lamp");
        assertIfBlock(helper, at, NAMESPACE + ":sea_lamp[waterlogged=false]");
        helper.assertValueEqual(helper.getBlockState(at).getLightEmission(), 12, "dry lamp light");
        BlockPos other = new BlockPos(6, 1, 6);
        for (String state : List.of("paper_lantern[waterlogged=true]", "brass_chain[waterlogged=true]", "rope_ladder[facing=north,waterlogged=true]",
                "tallow_candle[waterlogged=true]", "glow_pod[waterlogged=true]")) {
            if (state.startsWith("rope_ladder")) {
                helper.setBlock(other.south(), Blocks.STONE);
            }
            setblock(helper, other, NAMESPACE + ":" + state);
            helper.assertTrue(helper.getBlockState(other).getFluidState().is(FluidTags.WATER), state + " holds no water");
            helper.setBlock(other, Blocks.AIR);
        }
        helper.succeed();
    }

    // Bags and the bundle (ADR 0095)

    private static int bagSlots(AbstractContainerMenu menu) {
        return menu.slots.size() - 36;
    }

    /** The menu slot showing player inventory index {@code inventorySlot}, or -1. */
    private static int menuSlot(AbstractContainerMenu menu, ServerPlayer player, int inventorySlot) {
        for (int n = 0; n < menu.slots.size(); n++) {
            if (menu.getSlot(n).container == player.getInventory() && menu.getSlot(n).getContainerSlot() == inventorySlot) {
                return n;
            }
        }
        return -1;
    }

    private static AbstractContainerMenu use(ServerPlayer player) {
        player.gameMode.useItem(player, player.level(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
        return player.containerMenu;
    }

    private static ItemStack withContents(ItemStack bag, ItemStack... contents) {
        bag.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(contents)));
        return bag;
    }

    private static int contained(ItemStack bag, Item item) {
        return bag.getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY).nonEmptyItemCopyStream()
                .filter(s -> s.is(item)).mapToInt(ItemStack::getCount).sum();
    }

    /**
     * The satchel opens a two-row chest screen only with sneak and use, with the leather sound and the bell (its
     * {@code on_open}), and closes with the leather sound and the bass note; the seed pouch opens a five-slot hopper
     * screen, the tool kit a three-by-three dispenser screen, with a plain use.
     */
    @GameTest(structure = ARENA)
    public void bagsOpenTheirLayoutsWithTheirSounds(GameTestHelper helper) {
        clear(helper);
        try (ParityEars user = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-svb-bags");
                ParityEars ears = ParityEars.listener(helper, new BlockPos(5, 1, 5))) {
            ServerPlayer player = user.player;
            player.getInventory().clearContent();
            player.getInventory().setItem(0, new ItemStack(item(helper, "satchel")));
            player.getInventory().setSelectedSlot(0);
            helper.assertTrue(use(player) == player.inventoryMenu, "the satchel opened without sneaking: " + player.containerMenu);
            ears.packets();
            player.setShiftKeyDown(true);
            AbstractContainerMenu menu = use(player);
            player.setShiftKeyDown(false);
            helper.assertTrue(menu != player.inventoryMenu, "the satchel did not open with sneak and use");
            helper.assertValueEqual(bagSlots(menu), 18, "satchel slots");
            List<Identifier> opened = sounds(ears.packets());
            helper.assertTrue(opened.contains(LEATHER) && opened.contains(BELL), "satchel opening sounds: " + opened);
            player.closeContainer();
            List<Identifier> closed = sounds(ears.packets());
            helper.assertTrue(closed.contains(LEATHER) && closed.contains(BASS), "satchel closing sounds: " + closed);
            for (Map.Entry<String, Integer> bag : Map.of("seed_pouch", 5, "tool_kit", 9).entrySet()) {
                player.getInventory().setItem(0, new ItemStack(item(helper, bag.getKey())));
                AbstractContainerMenu other = use(player);
                helper.assertTrue(other != player.inventoryMenu, bag.getKey() + " did not open");
                helper.assertValueEqual(bagSlots(other), bag.getValue(), bag.getKey() + " slots");
                player.closeContainer();
            }
        }
        helper.succeed();
    }

    /** What goes into the tool kit is written to its stack and is there when it opens again. */
    @GameTest(structure = ARENA)
    public void bagContentsAreKeptOnTheStack(GameTestHelper helper) {
        try (ParityEars user = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-svb-kit")) {
            ServerPlayer player = user.player;
            player.getInventory().clearContent();
            ItemStack kit = new ItemStack(item(helper, "tool_kit"));
            player.getInventory().setItem(0, kit);
            player.getInventory().setItem(5, new ItemStack(Items.DIAMOND, 5));
            player.getInventory().setSelectedSlot(0);
            AbstractContainerMenu menu = use(player);
            menu.clicked(menuSlot(menu, player, 5), 0, ContainerInput.QUICK_MOVE, player);
            player.closeContainer();
            ItemStack after = player.getInventory().getItem(0);
            helper.assertTrue(after.is(item(helper, "tool_kit")), "the kit left its slot: " + after);
            helper.assertValueEqual(contained(after, Items.DIAMOND), 5, "diamonds saved in the kit");
            helper.assertTrue(player.getInventory().getItem(5).isEmpty(), "diamonds left behind");
            AbstractContainerMenu again = use(player);
            int shown = 0;
            for (int k = 0; k < bagSlots(again); k++) {
                shown += again.getSlot(k).getItem().is(Items.DIAMOND) ? again.getSlot(k).getItem().getCount() : 0;
            }
            helper.assertValueEqual(shown, 5, "diamonds shown when opened again");
            player.closeContainer();
        }
        helper.succeed();
    }

    /**
     * Every {@code item} the player has: the inventory, the bags' contents and the cursor. While a bag is open its menu
     * slots are counted instead of the stack in hotbar slot 0 (the runtime writes the stack at every change, the eject
     * when the menu closes).
     */
    private static int held(ServerPlayer player, Item item) {
        AbstractContainerMenu menu = player.containerMenu;
        boolean open = menu != player.inventoryMenu;
        int n = menu.getCarried().is(item) ? menu.getCarried().getCount() : 0;
        n += contained(menu.getCarried(), item);
        for (int k = 0; k < player.getInventory().getContainerSize(); k++) {
            ItemStack s = player.getInventory().getItem(k);
            n += (s.is(item) ? s.getCount() : 0) + (open && k == 0 ? 0 : contained(s, item));
        }
        if (open) {
            for (int k = 0; k < bagSlots(menu); k++) {
                ItemStack s = menu.getSlot(k).getItem();
                n += (s.is(item) ? s.getCount() : 0) + contained(s, item);
            }
        }
        return n;
    }

    /**
     * The bag guard's outcome (not its mechanism, B450): with the satchel open, no shulker box or other bag gets into it
     * by the cursor, a shift-click or a number key; the satchel itself never leaves its slot (picked up, shift-clicked,
     * thrown, swapped by number key or to the off hand); and nothing is copied or lost on the way.
     */
    @GameTest(structure = ARENA)
    public void theBagGuardKeepsBagsOutAndTheBagInItsSlot(GameTestHelper helper) {
        clear(helper);
        try (ParityEars user = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-svb-guard")) {
            ServerPlayer player = user.player;
            Item satchel = item(helper, "satchel");
            Item pouch = item(helper, "seed_pouch");
            player.getInventory().clearContent();
            player.getInventory().setItem(0, withContents(new ItemStack(satchel), new ItemStack(Items.DIAMOND, 5)));
            player.getInventory().setItem(1, new ItemStack(pouch));
            player.getInventory().setItem(2, new ItemStack(Items.SHULKER_BOX));
            player.getInventory().setSelectedSlot(0);
            player.setShiftKeyDown(true);
            AbstractContainerMenu menu = use(player);
            player.setShiftKeyDown(false);
            helper.assertTrue(menu != player.inventoryMenu, "the satchel did not open");
            int own = menuSlot(menu, player, 0);
            record Route(String name, int slot, int button, ContainerInput input) {}
            List<Route> routes = List.of(
                    new Route("shift-click of the shulker box", menuSlot(menu, player, 2), 0, ContainerInput.QUICK_MOVE),
                    new Route("shift-click of the pouch", menuSlot(menu, player, 1), 0, ContainerInput.QUICK_MOVE),
                    new Route("number key 3 onto a bag slot", 3, 2, ContainerInput.SWAP),
                    new Route("number key 2 onto a bag slot", 4, 1, ContainerInput.SWAP),
                    new Route("picking up the satchel", own, 0, ContainerInput.PICKUP),
                    new Route("shift-click of the satchel", own, 0, ContainerInput.QUICK_MOVE),
                    new Route("throwing the satchel", own, 1, ContainerInput.THROW),
                    new Route("number key moving the satchel", own, 4, ContainerInput.SWAP),
                    new Route("off-hand key on the satchel", own, Inventory.SLOT_OFFHAND, ContainerInput.SWAP),
                    new Route("number key onto the satchel's slot", 0, 0, ContainerInput.SWAP));
            for (Route r : routes) {
                menu.clicked(r.slot(), r.button(), r.input(), player);
                checkGuard(helper, player, menu, satchel, pouch, r.name());
            }
            // The cursor: the shulker box, then the pouch, put down on a bag slot.
            for (int inventorySlot : List.of(2, 1)) {
                menu.clicked(menuSlot(menu, player, inventorySlot), 0, ContainerInput.PICKUP, player);
                menu.clicked(5, 0, ContainerInput.PICKUP, player);
                checkGuard(helper, player, menu, satchel, pouch, "cursor from inventory slot " + inventorySlot);
                if (!menu.getCarried().isEmpty()) {
                    menu.clicked(menuSlot(menu, player, inventorySlot), 0, ContainerInput.PICKUP, player);
                }
            }
            player.closeContainer();
            checkGuard(helper, player, player.containerMenu, satchel, pouch, "after closing");
            helper.assertValueEqual(contained(player.getInventory().getItem(0), Items.DIAMOND), 5, "diamonds in the satchel");
        }
        helper.succeed();
    }

    private static void checkGuard(GameTestHelper helper, ServerPlayer player, AbstractContainerMenu menu, Item satchel, Item pouch, String route) {
        if (menu != player.inventoryMenu) {
            for (int k = 0; k < bagSlots(menu); k++) {
                ItemStack s = menu.getSlot(k).getItem();
                helper.assertFalse(s.is(Items.SHULKER_BOX) || s.is(pouch) || s.is(satchel), route + ": bag slot " + k + " holds " + s);
            }
        }
        helper.assertTrue(player.getInventory().getItem(0).is(satchel), route + ": the satchel left its slot: " + player.getInventory().getItem(0));
        int onGround = helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(player.blockPosition()).inflate(4)).size();
        helper.assertValueEqual(onGround, 0, route + ": items on the ground");
        helper.assertValueEqual(held(player, satchel), 1, route + ": satchels");
        helper.assertValueEqual(held(player, pouch), 1, route + ": pouches");
        helper.assertValueEqual(held(player, Items.SHULKER_BOX), 1, route + ": shulker boxes");
        helper.assertValueEqual(held(player, Items.DIAMOND), 5, route + ": diamonds");
    }

    /**
     * The bundle's state after carrying {@code bundle} on the cursor and clicking a stack of eight diamonds, then a seed
     * pouch, with mouse button {@code button}: the diamonds and pouches inside it (wherever the bundle ended up).
     */
    private static int[] bundleClicks(GameTestHelper helper, ServerPlayer player, Item bundle, int button) {
        player.getInventory().clearContent();
        player.getInventory().setItem(9, new ItemStack(Items.DIAMOND, 8));
        player.getInventory().setItem(10, new ItemStack(item(helper, "seed_pouch")));
        AbstractContainerMenu menu = player.inventoryMenu;
        menu.setCarried(new ItemStack(bundle));
        menu.clicked(menuSlot(menu, player, 9), button, ContainerInput.PICKUP, player);
        ItemStack carried = menu.getCarried();
        if (carried.is(bundle)) {
            menu.clicked(menuSlot(menu, player, 10), button, ContainerInput.PICKUP, player);
        }
        List<ItemStack> inside = new ArrayList<>();
        List<ItemStack> all = new ArrayList<>(List.of(menu.getCarried()));
        for (int k = 0; k < player.getInventory().getContainerSize(); k++) {
            all.add(player.getInventory().getItem(k));
        }
        for (ItemStack s : all) {
            if (s.is(bundle)) {
                s.getOrDefault(DataComponents.BUNDLE_CONTENTS, BundleContents.EMPTY).itemCopies().forEach(inside::add);
            }
        }
        menu.setCarried(ItemStack.EMPTY);
        player.getInventory().clearContent();
        return new int[] {count(inside, Items.DIAMOND), count(inside, item(helper, "seed_pouch"))};
    }

    /**
     * The charm bundle answers the same clicks as vanilla's bundle (each mouse button): the diamonds go in as they go into
     * vanilla's, a bag never does.
     */
    @GameTest(structure = ARENA)
    public void theBundleTakesItemsAsVanillasAndRefusesBags(GameTestHelper helper) {
        try (ParityEars user = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-svb-bundle")) {
            helper.assertFalse(BundleContents.canItemBeInBundle(new ItemStack(item(helper, "satchel"))), "a bag fits in a bundle");
            helper.assertValueEqual(new ItemStack(item(helper, "charm_bundle")).getOrDefault(DataComponents.BUNDLE_CONTENTS, BundleContents.EMPTY)
                    .isEmpty(), true, "a new charm bundle is not empty");
            int taken = 0;
            for (int button = 0; button <= 1; button++) {
                int[] vanilla = bundleClicks(helper, user.player, Items.BUNDLE, button);
                int[] charm = bundleClicks(helper, user.player, item(helper, "charm_bundle"), button);
                helper.assertValueEqual(charm[0], vanilla[0], "diamonds in the bundle, button " + button);
                helper.assertValueEqual(charm[1], 0, "pouches in the charm bundle, button " + button);
                taken += charm[0];
            }
            helper.assertValueEqual(taken, 8, "diamonds taken by one of the buttons");
        }
        helper.succeed();
    }

    // Commands (ADR 0096)

    /**
     * {@code /greet} and its alias {@code /hiya}, for everyone: the chime for others, five seconds of glowing on the player
     * and the answer line; the rule book's plain rule "A cookie for a greeting" gives one cookie a run (in the command's
     * event after the wave, so also in the eject; B462b).
     */
    @GameTest(structure = ARENA)
    public void greetAndHiyaChimeGlowAndAnswer(GameTestHelper helper) {
        try (ParityEars user = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-svb-greet");
                ParityEars ears = ParityEars.listener(helper, new BlockPos(5, 1, 5))) {
            ServerPlayer player = user.player;
            for (String literal : List.of("greet", "hiya")) {
                player.removeAllEffects();
                int cookies = player.getInventory().countItem(Items.COOKIE);
                user.packets();
                ears.packets();
                int result = command(player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.ALL), literal);
                helper.assertTrue(result > 0, "/" + literal + " failed");
                helper.assertTrue(player.hasEffect(MobEffects.GLOWING), "/" + literal + ": no glowing");
                int seconds = player.getEffect(MobEffects.GLOWING).getDuration();
                helper.assertTrue(seconds > 90 && seconds <= 100, "/" + literal + ": glowing for " + seconds + " ticks");
                List<Packet<?>> mine = user.packets();
                helper.assertTrue(saysLine(mine, GREET_TEXT, "command." + NAMESPACE + ".greet.feedback"),
                        "/" + literal + ": answer " + chatLines(mine));
                List<Identifier> heard = sounds(ears.packets());
                helper.assertTrue(heard.contains(CHIME), "/" + literal + ": others heard " + heard);
                helper.assertValueEqual(player.getInventory().countItem(Items.COOKIE), cookies + 1, "/" + literal + ": cookies");
            }
        }
        helper.succeed();
    }

    private static int candles(GameTestHelper helper, ServerPlayer player) {
        return player.getInventory().countItem(item(helper, "tallow_candle"));
    }

    /** The command storage {@code <mod id>:args} the commands pass their values through (B454, B457). */
    private static net.minecraft.nbt.CompoundTag args(GameTestHelper helper) {
        return server(helper).getCommandStorage().get(id("args"));
    }

    /**
     * {@code give_kit} gave {@code player} exactly {@code n} candles more than {@code before}. Strict since B464a: a
     * {@code player} argument reaches the macro as the player's name, which vanilla's {@code give} takes (it refuses a
     * UUID for a player, the B464 finding).
     */
    private static void assertKit(GameTestHelper helper, ServerPlayer player, List<String> chat, int n, int before, String what) {
        helper.assertValueEqual(candles(helper, player), before + n, what + ": tallow candles " + chat);
    }

    /**
     * {@code /kit <who> <count>} at permission 2 runs {@code give_kit} with the typed values as macros through the
     * storage {@code <mod id>:args} ({@code who} the player's name, from a selector or a name; {@code count} an int), and
     * the candles arrive;
     * a count outside 1 to 16 and a level-0 player are refused before anything runs; under {@code execute as} with two
     * players each fork passes its own player.
     */
    @GameTest(structure = ARENA)
    public void kitPassesItsValuesAsMacrosAndForksPerPlayer(GameTestHelper helper) {
        try (ParityEars a = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-svb-kit-a");
                ParityEars b = new ParityEars(helper, new BlockPos(5, 1, 5), GameType.SURVIVAL, "msm-svb-kit-b")) {
            a.player.getInventory().clearContent();
            b.player.getInventory().clearContent();
            CommandSourceStack op = a.player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
            a.packets();
            command(op, "kit @s 5");
            List<String> chat = chatLines(a.packets());
            helper.assertTrue(chat.contains(KIT_TEXT) || chat.stream().anyMatch(l -> l.contains("command." + NAMESPACE + ".kit.feedback")),
                    "/kit answer " + chat);
            helper.assertValueEqual(args(helper).getStringOr("who", "<missing>"), a.player.getName().getString(), "who (a selector) as a macro");
            helper.assertValueEqual(args(helper).getIntOr("count", -1), 5, "count as a macro");
            assertKit(helper, a.player, chat, 5, 0, "/kit @s 5");
            for (String refused : List.of("kit @s 17", "kit @s 0")) {
                command(op, refused);
                helper.assertValueEqual(args(helper).getIntOr("count", -1), 5, refused + " ran");
            }
            assertKit(helper, a.player, List.of(), 5, 0, "after the refused counts");
            int before = candles(helper, b.player);
            command(op, "kit msm-svb-kit-b 2");
            chat = chatLines(a.packets());
            helper.assertValueEqual(args(helper).getStringOr("who", "<missing>"), b.player.getName().getString(), "who (a name) as a macro");
            assertKit(helper, b.player, chat, 2, before, "/kit by name");
            command(a.player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.ALL), "kit @s 3");
            helper.assertValueEqual(args(helper).getIntOr("count", -1), 2, "a level-0 player ran /kit");
            assertKit(helper, a.player, List.of(), 5, 0, "after the level-0 /kit");
            a.player.addTag("msm_svb_fork");
            b.player.addTag("msm_svb_fork");
            int beforeA = candles(helper, a.player);
            int beforeB = candles(helper, b.player);
            a.packets();
            command(op, "execute as @a[tag=msm_svb_fork] run kit @s 3");
            chat = chatLines(a.packets());
            helper.assertValueEqual(chat.stream().filter(KIT_TEXT::equals).count(), 2L, "one answer per fork: " + chat);
            assertKit(helper, a.player, chat, 3, beforeA, "first fork");
            assertKit(helper, b.player, chat, 3, beforeB, "second fork");
        }
        helper.succeed();
    }

    // Signs (ADR 0094 D6)

    /** The place sounds others hear when {@code stack} is placed on face {@code face} of the block at {@code rel}. */
    private static List<Identifier> placeSounds(GameTestHelper helper, ParityEars actor, ParityEars ears, ItemStack stack, BlockPos rel,
            Direction face) {
        ears.packets();
        InteractionResult result = place(helper, actor.player, stack, rel, face);
        helper.assertTrue(result.consumesAction(), stack + " placement " + result);
        return sounds(ears.packets());
    }

    /**
     * The cedar signs stand, hang and go on walls (the {@code _wall} companions) with vanilla sign block entities, and are
     * heard as vanilla's spruce signs are (B457a: the wood type's sounds, in the runtime and in the eject); the front takes
     * text, dye, glow ink and wax as a vanilla sign does.
     */
    @GameTest(structure = ARENA)
    public void signsSoundLikeSpruceAndTakeText(GameTestHelper helper) {
        clear(helper);
        for (int x = 1; x <= 9; x += 2) {
            helper.setBlock(new BlockPos(x, 2, 8), Blocks.STONE);
            helper.setBlock(new BlockPos(x, 3, 5), Blocks.STONE);
        }
        try (ParityEars actor = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.CREATIVE, "msm-svb-signs");
                ParityEars ears = ParityEars.listener(helper, new BlockPos(5, 1, 4))) {
            faceSouth(actor.player);
            List<Identifier> cedar = placeSounds(helper, actor, ears, new ItemStack(item(helper, "cedar_sign")), new BlockPos(1, 0, 2), Direction.UP);
            List<Identifier> spruce = placeSounds(helper, actor, ears, new ItemStack(Items.SPRUCE_SIGN), new BlockPos(3, 0, 2), Direction.UP);
            helper.assertTrue(!cedar.isEmpty() && cedar.equals(spruce), "cedar sign placed " + cedar + ", spruce sign " + spruce);
            List<Identifier> cedarHanging = placeSounds(helper, actor, ears, new ItemStack(item(helper, "cedar_hanging_sign")),
                    new BlockPos(1, 3, 5), Direction.DOWN);
            List<Identifier> spruceHanging = placeSounds(helper, actor, ears, new ItemStack(Items.SPRUCE_HANGING_SIGN), new BlockPos(3, 3, 5),
                    Direction.DOWN);
            helper.assertTrue(!cedarHanging.isEmpty() && cedarHanging.equals(spruceHanging),
                    "cedar hanging sign placed " + cedarHanging + ", spruce hanging sign " + spruceHanging);
            helper.assertTrue(helper.getBlockState(new BlockPos(1, 2, 5)).is(block(helper, "cedar_hanging_sign")), "hanging sign: "
                    + helper.getBlockState(new BlockPos(1, 2, 5)));
            place(helper, actor.player, new ItemStack(item(helper, "cedar_sign")), new BlockPos(5, 2, 8), Direction.NORTH);
            helper.assertTrue(helper.getBlockState(new BlockPos(5, 2, 7)).is(block(helper, "cedar_sign_wall")), "wall sign: "
                    + helper.getBlockState(new BlockPos(5, 2, 7)));
            place(helper, actor.player, new ItemStack(item(helper, "cedar_hanging_sign")), new BlockPos(7, 2, 8), Direction.NORTH);
            helper.assertTrue(helper.getBlockState(new BlockPos(7, 2, 7)).is(block(helper, "cedar_hanging_sign_wall")), "wall hanging sign: "
                    + helper.getBlockState(new BlockPos(7, 2, 7)));
            BlockPos at = new BlockPos(1, 1, 2);
            helper.assertTrue(helper.getBlockState(at).is(block(helper, "cedar_sign")), "standing sign: " + helper.getBlockState(at));
            BlockEntity be = helper.getLevel().getBlockEntity(helper.absolutePos(at));
            helper.assertTrue(be instanceof SignBlockEntity, "sign block entity " + be);
            SignBlockEntity sign = (SignBlockEntity) be;
            for (BlockPos p : List.of(new BlockPos(5, 2, 7), new BlockPos(7, 2, 7), new BlockPos(1, 2, 5))) {
                helper.assertTrue(helper.getLevel().getBlockEntity(helper.absolutePos(p)) instanceof SignBlockEntity, "no sign block entity at " + p);
            }
            actor.player.setGameMode(GameType.SURVIVAL);
            sign.updateSignText(actor.player, SignTextSlot.FRONT, List.of(FilteredText.passThrough("Cedar"), FilteredText.passThrough("signs"),
                    FilteredText.passThrough("take"), FilteredText.passThrough("text")));
            helper.assertValueEqual(sign.getText(SignTextSlot.FRONT).getMessages(false).get(0).getString(), "Cedar", "line 1");
            click(helper, actor.player, new ItemStack(Items.DYE.red()), at, Direction.NORTH);
            helper.assertValueEqual(sign.getText(SignTextSlot.FRONT).getColor(), DyeColor.RED, "dyed");
            click(helper, actor.player, new ItemStack(Items.GLOW_INK_SAC), at, Direction.NORTH);
            helper.assertTrue(sign.getText(SignTextSlot.FRONT).hasGlowingText(), "glowing");
            click(helper, actor.player, new ItemStack(Items.HONEYCOMB), at, Direction.NORTH);
            helper.assertTrue(sign.isWaxed(), "waxed");
            helper.assertValueEqual(count(Block.getDrops(helper.getBlockState(at), helper.getLevel(), helper.absolutePos(at), be, null,
                    ItemStack.EMPTY), item(helper, "cedar_sign")), 1, "sign drop");
        }
        helper.succeed();
    }

    // Bed, cake, berry bush (ADR 0094 D2, D3)

    /**
     * The cosy bed is placed as a foot and a head; at midnight a player sleeps in it at the head and it becomes their
     * spawn; the head drops the bed once, the foot nothing; breaking the foot takes the head.
     */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void theBedSleepsAndSetsSpawn(GameTestHelper helper) {
        clear(helper);
        ParityEars sleeper = new ParityEars(helper, new BlockPos(2, 1, 1), GameType.SURVIVAL, "msm-svb-sleeper");
        faceSouth(sleeper.player);
        BlockPos foot = new BlockPos(3, 1, 3);
        BlockPos head = foot.south();
        InteractionResult placed = place(helper, sleeper.player, new ItemStack(item(helper, "cosy_bed")), foot.below(), Direction.UP);
        helper.assertTrue(placed.consumesAction(), "bed placement " + placed);
        assertIfBlock(helper, foot, NAMESPACE + ":cosy_bed[part=foot,facing=south]");
        assertIfBlock(helper, head, NAMESPACE + ":cosy_bed[part=head,facing=south]");
        helper.assertValueEqual(count(Block.getDrops(helper.getBlockState(head), helper.getLevel(), helper.absolutePos(head), null, null,
                ItemStack.EMPTY), item(helper, "cosy_bed")), 1, "head drop");
        helper.assertValueEqual(Block.getDrops(helper.getBlockState(foot), helper.getLevel(), helper.absolutePos(foot), null, null,
                ItemStack.EMPTY).size(), 0, "foot drops");
        command(helper, "time set midnight");
        helper.runAfterDelay(5, () -> {
            ServerPlayer player = sleeper.player;
            player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(foot.west())));
            InteractionResult used = click(helper, player, ItemStack.EMPTY, head, Direction.UP);
            boolean slept = player.isSleeping();
            BlockPos at = player.getSleepingPos().orElse(null);
            ServerPlayer.RespawnConfig spawn = player.getRespawnConfig();
            if (slept) {
                player.stopSleepInBed(true, true);
            }
            command(helper, "time set noon");
            sleeper.close();
            helper.assertTrue(used.consumesAction(), "bed use " + used);
            helper.assertTrue(slept, "not sleeping at midnight");
            helper.assertValueEqual(at, helper.absolutePos(head), "sleeping position");
            helper.assertTrue(spawn != null && spawn.respawnData().pos().equals(helper.absolutePos(head)), "spawn " + spawn);
            helper.getLevel().destroyBlock(helper.absolutePos(foot), false, player);
            helper.assertTrue(helper.getBlockState(head).isAir(), "the head stayed: " + helper.getBlockState(head));
            helper.succeed();
        });
    }

    /**
     * The honey cake is eaten a slice at a time by a hungry player (3 food points each, the burp of its {@code on_eat} for
     * others), refuses a candle (a slice is eaten instead, nothing is placed), drops only while whole and is gone after
     * the seventh slice.
     */
    @GameTest(structure = ARENA)
    public void theCakeIsEatenASliceAtATimeAndRefusesCandles(GameTestHelper helper) {
        clear(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        setblock(helper, at, NAMESPACE + ":honey_cake");
        helper.assertValueEqual(count(Block.getDrops(helper.getBlockState(at), helper.getLevel(), helper.absolutePos(at), null, null,
                ItemStack.EMPTY), item(helper, "honey_cake")), 1, "whole cake drop");
        try (ParityEars eater = new ParityEars(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "msm-svb-eater");
                ParityEars ears = ParityEars.listener(helper, new BlockPos(5, 1, 5))) {
            ServerPlayer player = eater.player;
            player.getFoodData().setFoodLevel(2);
            ears.packets();
            click(helper, player, ItemStack.EMPTY, at, Direction.UP);
            assertIfBlock(helper, at, NAMESPACE + ":honey_cake[bites=1]");
            helper.assertValueEqual(player.getFoodData().getFoodLevel(), 5, "food after one slice");
            List<Identifier> heard = sounds(ears.packets());
            helper.assertTrue(heard.contains(BURP), "others heard " + heard);
            helper.assertTrue(Block.getDrops(helper.getBlockState(at), helper.getLevel(), helper.absolutePos(at), null, null,
                    ItemStack.EMPTY).isEmpty(), "a bitten cake drops something");
            ItemStack candle = new ItemStack(item(helper, "tallow_candle"), 4);
            click(helper, player, candle, at, Direction.UP);
            helper.assertTrue(helper.getBlockState(at).is(block(helper, "honey_cake")), "the cake became " + helper.getBlockState(at));
            helper.assertTrue(helper.getBlockState(at.above()).isAir(), "something was placed on the cake: " + helper.getBlockState(at.above()));
            helper.assertValueEqual(player.getMainHandItem().getCount(), 4, "candles after using one on the cake");
            assertIfBlock(helper, at, NAMESPACE + ":honey_cake[bites=2]");
            for (int k = 0; k < 5; k++) {
                player.getFoodData().setFoodLevel(2);
                click(helper, player, ItemStack.EMPTY, at, Direction.UP);
                helper.assertValueEqual(player.getFoodData().getFoodLevel(), 5, "food after slice " + (k + 3));
            }
            helper.assertTrue(helper.getBlockState(at).isAir(), "the cake after seven slices: " + helper.getBlockState(at));
        }
        helper.succeed();
    }

    /**
     * Using the blue berry bush picks blue berries: 1 to 2 when ripe (age 2), 2 to 3 when full (age 3), and takes it back
     * to age 1; a young bush gives nothing.
     */
    @GameTest(structure = ARENA)
    public void theBerryBushIsHarvestedByAge(GameTestHelper helper) {
        clear(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.setBlock(at.below(), Blocks.GRASS_BLOCK);
        Item berries = item(helper, "blue_berries");
        try (ParityEars picker = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.SURVIVAL, "msm-svb-picker")) {
            for (int[] c : new int[][] {{2, 1, 2}, {3, 2, 3}}) {
                int min = Integer.MAX_VALUE;
                int max = 0;
                for (int k = 0; k < 24; k++) {
                    setblock(helper, at, NAMESPACE + ":blue_berry_bush[age=" + c[0] + "]");
                    click(helper, picker.player, ItemStack.EMPTY, at, Direction.UP);
                    assertIfBlock(helper, at, NAMESPACE + ":blue_berry_bush[age=1]");
                    int n = takeItems(helper, at, berries) + picker.player.getInventory().countItem(berries);
                    picker.player.getInventory().clearContent();
                    min = Math.min(min, n);
                    max = Math.max(max, n);
                }
                helper.assertTrue(min >= c[1] && max <= c[2], "age " + c[0] + " picked " + min + " to " + max + ", expected " + c[1] + " to " + c[2]);
            }
            helper.setBlock(at, Blocks.AIR);
            setblock(helper, at, NAMESPACE + ":blue_berry_bush[age=1]");
            click(helper, picker.player, ItemStack.EMPTY, at, Direction.UP);
            helper.assertValueEqual(takeItems(helper, at, berries) + picker.player.getInventory().countItem(berries), 0, "berries from age 1");
            assertIfBlock(helper, at, NAMESPACE + ":blue_berry_bush[age=1]");
        }
        helper.succeed();
    }

    // Light and drops

    /**
     * Light: torch and wall torch 14, lantern 15 standing and hanging, rod 14, sea lamp 12, the pods 6, 9, 12, 15 in water
     * and 0 dry, candles 3 a lit candle and 0 unlit.
     */
    @GameTest(structure = ARENA)
    public void lightsGiveTheirLevels(GameTestHelper helper) {
        clear(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.setBlock(at.north(), Blocks.STONE);
        Map<String, Integer> levels = new LinkedHashMap<>();
        levels.put("ember_torch", 14);
        levels.put("ember_torch_wall[facing=south]", 14);
        levels.put("paper_lantern", 15);
        levels.put("paper_lantern[hanging=true]", 15);
        levels.put("crystal_rod", 14);
        levels.put("sea_lamp", 12);
        for (int n = 1; n <= 4; n++) {
            levels.put("glow_pod[pickles=" + n + ",waterlogged=true]", 3 + 3 * n);
            levels.put("glow_pod[pickles=" + n + ",waterlogged=false]", 0);
            levels.put("tallow_candle[candles=" + n + ",lit=true]", 3 * n);
            levels.put("tallow_candle[candles=" + n + ",lit=false]", 0);
        }
        List<String> wrong = new ArrayList<>();
        levels.forEach((state, light) -> {
            setblock(helper, at, NAMESPACE + ":" + state);
            int got = helper.getBlockState(at).getLightEmission();
            if (got != light) {
                wrong.add(state + " gives " + got + ", not " + light);
            }
        });
        helper.assertTrue(wrong.isEmpty(), String.join("; ", wrong));
        helper.succeed();
    }

    /**
     * Drops follow the pieces: pods and candles one a piece, ash one a layer, the pot its flower pot and grass, the tall
     * bluebell from its lower half only, the coffee pod beans when ripe, tin with a pickaxe.
     */
    @GameTest(structure = ARENA)
    public void dropsFollowThePieces(GameTestHelper helper) {
        clear(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.assertValueEqual(count(drops(helper, at, NAMESPACE + ":glow_pod[pickles=3]", ItemStack.EMPTY), item(helper, "glow_pod")), 3, "pods");
        helper.assertValueEqual(count(drops(helper, at, NAMESPACE + ":tallow_candle[candles=4]", ItemStack.EMPTY), item(helper, "tallow_candle")), 4,
                "candles");
        helper.assertValueEqual(count(drops(helper, at, NAMESPACE + ":ash_layer[layers=5]", new ItemStack(Items.IRON_SHOVEL)),
                item(helper, "ash_layer")), 5, "ash layers");
        List<ItemStack> pot = drops(helper, at, NAMESPACE + ":potted_grass_tuft", ItemStack.EMPTY);
        helper.assertTrue(count(pot, Items.FLOWER_POT) == 1 && count(pot, Items.SHORT_GRASS) == 1, "pot drops " + pot);
        helper.assertValueEqual(count(drops(helper, at, NAMESPACE + ":tall_bluebell[half=lower]", ItemStack.EMPTY), item(helper, "tall_bluebell")),
                1, "lower half");
        helper.assertValueEqual(drops(helper, at, NAMESPACE + ":tall_bluebell[half=upper]", ItemStack.EMPTY).size(), 0, "upper half drops");
        helper.setBlock(at.north(), Blocks.JUNGLE_LOG);
        helper.assertTrue(count(drops(helper, at, NAMESPACE + ":coffee_pod[age=2,facing=north]", ItemStack.EMPTY), item(helper, "coffee_beans")) >= 2,
                "ripe coffee pod drops");
        helper.assertValueEqual(count(drops(helper, at, NAMESPACE + ":coffee_pod[age=0,facing=north]", ItemStack.EMPTY), item(helper, "coffee_beans")),
                1, "young coffee pod drops");
        helper.assertValueEqual(count(drops(helper, at, NAMESPACE + ":tin", new ItemStack(Items.IRON_PICKAXE)), item(helper, "tin")), 1, "tin");
        helper.assertValueEqual(count(drops(helper, at, NAMESPACE + ":crystal_rod", ItemStack.EMPTY), item(helper, "crystal_rod")), 1, "rod");
        helper.succeed();
    }

    // Stem and scaffolding

    /** A full gourd stem on farmland grows a gourd beside it and becomes {@code gourd_stem_attached} facing it. */
    @GameTest(structure = ARENA)
    public void theStemGrowsItsFruitAndBends(GameTestHelper helper) {
        clear(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.setBlock(at.below(), Blocks.FARMLAND);
        for (Direction d : Direction.Plane.HORIZONTAL) {
            helper.setBlock(at.below().relative(d), Blocks.DIRT);
        }
        setblock(helper, at, NAMESPACE + ":gourd_stem[age=7]");
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(at);
        RandomSource random = RandomSource.create(464L);
        for (int k = 0; k < 4000 && helper.getBlockState(at).is(block(helper, "gourd_stem")); k++) {
            level.getBlockState(abs).randomTick(level, abs, random);
        }
        BlockState stem = helper.getBlockState(at);
        helper.assertTrue(stem.is(block(helper, "gourd_stem_attached")), "the full stem became " + stem);
        Direction facing = null;
        for (Direction d : Direction.Plane.HORIZONTAL) {
            if (helper.getBlockState(at.relative(d)).is(block(helper, "gourd"))) {
                facing = d;
            }
        }
        helper.assertTrue(facing != null, "no gourd beside the stem");
        assertIfBlock(helper, at, NAMESPACE + ":gourd_stem_attached[facing=" + facing.getSerializedName() + "]");
        helper.succeed();
    }

    /**
     * The bamboo frame on the floor has distance 0, one out from a column's top distance 1; a frame with nothing under or
     * beside it falls.
     */
    @GameTest(structure = ARENA, maxTicks = 60)
    public void scaffoldingCountsDistanceAndFalls(GameTestHelper helper) {
        clear(helper);
        BlockPos base = new BlockPos(2, 1, 2);
        setblock(helper, base, NAMESPACE + ":bamboo_frame");
        setblock(helper, base.above(), NAMESPACE + ":bamboo_frame");
        setblock(helper, base.above().east(), NAMESPACE + ":bamboo_frame");
        setblock(helper, new BlockPos(8, 3, 8), NAMESPACE + ":bamboo_frame");
        helper.succeedWhen(() -> {
            assertIfBlock(helper, base, NAMESPACE + ":bamboo_frame[distance=0]");
            assertIfBlock(helper, base.above(), NAMESPACE + ":bamboo_frame[distance=0]");
            assertIfBlock(helper, base.above().east(), NAMESPACE + ":bamboo_frame[distance=1]");
            helper.assertFalse(helper.getBlockState(new BlockPos(8, 3, 8)).is(block(helper, "bamboo_frame")), "the lone frame did not fall");
        });
    }
    // Explosions (ADR 0096 D3: the explosion Mixin loads at the first explosion)

    /**
     * Primed TNT in the arena: tin and the sea lamp beside it break as vanilla iron ore (the same blast resistance, 3)
     * and glass do (the rule book keeps the blocks of a creeper's blast only, B462b). On the content jar the script's
     * {@code World.explode} at {@code server.started} has already loaded the runtime's explosion Mixin (B455); on the
     * ejected jar this is the first explosion of the run.
     */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void anExplosionBreaksProjectBlocksAsVanillaBlocks(GameTestHelper helper) {
        clear(helper);
        BlockPos tnt = new BlockPos(5, 1, 5);
        BlockPos nearTin = new BlockPos(5, 1, 7);
        BlockPos nearOre = new BlockPos(5, 1, 3);
        BlockPos nearLamp = new BlockPos(7, 1, 5);
        BlockPos nearGlass = new BlockPos(3, 1, 5);
        setblock(helper, nearTin, NAMESPACE + ":tin");
        setblock(helper, nearLamp, NAMESPACE + ":sea_lamp");
        helper.setBlock(nearOre, Blocks.IRON_ORE);
        helper.setBlock(nearGlass, Blocks.GLASS);
        helper.assertTrue(command(helper, "summon minecraft:tnt " + coords(helper, tnt) + " {fuse:1}") > 0, "summon tnt failed");
        helper.runAfterDelay(20, () -> {
            helper.assertTrue(helper.getBlockState(nearOre).isAir(), "the near iron ore stayed: the explosion was too weak to compare");
            helper.assertTrue(helper.getBlockState(nearTin).isAir(), "the near tin stayed: " + helper.getBlockState(nearTin));
            helper.assertTrue(helper.getBlockState(nearGlass).isAir(), "the near glass stayed");
            helper.assertTrue(helper.getBlockState(nearLamp).isAir(), "the near sea lamp stayed: " + helper.getBlockState(nearLamp));
            helper.succeed();
        });
    }
}
