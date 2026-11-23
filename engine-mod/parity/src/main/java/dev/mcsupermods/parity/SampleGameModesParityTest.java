package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundExplodePacket;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.bossevents.CustomBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.scores.DisplaySlot;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.PlayerTeam;
import net.minecraft.world.scores.ReadOnlyScoreInfo;
import net.minecraft.world.scores.ScoreHolder;
import net.minecraft.world.scores.Scoreboard;

/**
 * Behaviour parity over {@code fixtures/sample-game-modes} (namespace {@code msm_sample_game_modes}, ADRs 0113 to 0117,
 * ADR 0117 D5; B559): the games plugin's data pack on the real server. Vanilla and Fabric API only (ADR 0033 D5). One class
 * for both runs, filter {@code msm_parity_tests:sample_game_modes_*}:
 *
 * <ul>
 *   <li>on the <b>content jar</b> (the runtime nested): everything below, with the rule books' effects (the function bridge
 *       of B553: joining the red team on entering the arena, a point for every player when the round ends, the line when
 *       the one block goes underground) and the lucky block;</li>
 *   <li>on the <b>vanilla data pack</b> (the app's vanilla data pack export, as a Fabric mod of its own with no runtime:
 *       the GameTest server makes its own world, so no world's {@code datapacks} folder is read): the games kinds alone,
 *       the rules' effects checked absent and the lucky block checked unregistered.</li>
 * </ul>
 *
 * <p>A run knows which by the lucky block's registration ({@link #jar}).
 *
 * <p>The games functions use world positions, not test-relative ones (the reason B558 found for having no sim-parity
 * scenario). The fixture's pieces are therefore placed where no GameTest structure is: the start island with its corner
 * at 0 64 0 (the Skyblock flow's default), the one block at 12 66 4 beside it, the arena from -12 100 -12 to 11 104 11
 * (the Arena game flow's default). The tests force-load chunks -1 to 0 and read and write those positions through
 * commands, as a player's command block would; only the lucky block, a block of the mod's own, is tested inside its test
 * structure. The tests share the world's games state (one world setup, one timer, one one block), so each piece has one
 * test. Players are made by {@link ParityEars} and only act once their first join has run (the Skyblock's first-join
 * advancement, criterion {@code minecraft:tick}; the level ticks them, so the join runs on a server tick after they are
 * placed): whichever player joins first has the island placed and is sent to it, and every player is put in survival.
 * The GameTest structures themselves are millions of blocks away from the fixture's pieces. A step that waits on the
 * server runs on later ticks ({@link #steps}).
 *
 * <ul>
 *   <li>{@link #theGameIsSetUpWhenTheWorldLoads}: the World Type, the world start (difficulty, flag), the goals tab, both
 *       teams, the sidebar objective and the round's boss bar.</li>
 *   <li>{@link #theIslandIsPlacedOnceAndTheKitGivenOnce}: the island at the first join, the kit once per player, the
 *       island not placed again for a second player; the home island area entered and reset.</li>
 *   <li>{@link #theOneBlockRefillsThroughItsPhases}: 20 breaks by a player, the block refilled each time from its
 *       phase's blocks, the phase moving on every 10 breaks with its line in chat.</li>
 *   <li>{@link #theRoundTimerEndsAndRunsItsEnd}: the timer started by its function, counting down on the boss bar,
 *       ending, running {@code round_end} (the title, the arena rebuilt).</li>
 *   <li>{@link #theArenaIsEnteredAndReset}: the arena built by its reset, a player tagged on entering and untagged on
 *       leaving, a block and a mob in it removed by the reset.</li>
 *   <li>{@link #aKillScoresOnTheSidebar}: a player defeating another scores a point on the sidebar objective.</li>
 *   <li>{@link #theLuckyBlockRuleFiresInTheJarOnly}: each break of the lucky block does exactly one of its outcomes; the
 *       hut is found by its floor beside the block's place, since the rule runs as the block breaks and the break then
 *       takes the hut's corner block away (an in-game check in the fixture's README).</li>
 * </ul>
 */
public class SampleGameModesParityTest {
    static final String NAMESPACE = "msm_sample_game_modes";
    private static final String ARENA = "msm_parity_tests:arena";

    /** A grass block of the island (the L's corner). */
    private static final BlockPos ISLAND_GRASS = new BlockPos(2, 66, 2);
    /** The island's chest. */
    private static final BlockPos ISLAND_CHEST = new BlockPos(7, 67, 3);
    private static final Vec3 ISLAND_SPAWN = new Vec3(5.5, 67, 3.5);
    private static final BlockPos ONE_BLOCK = new BlockPos(12, 66, 4);
    private static final BlockPos ARENA_CORNER = new BlockPos(-12, 100, -12);
    private static final Vec3 ARENA_MIDDLE = new Vec3(0.5, 101, 0.5);

    private static final String ONE_BLOCKS = NAMESPACE + ".msm_one_block";
    private static final String TIMERS = NAMESPACE + ".msm_timers";
    private static final String POINTS = NAMESPACE + ".arena.points";
    private static final String RED = NAMESPACE + ".arena.red";
    private static final String BLUE = NAMESPACE + ".arena.blue";
    private static final String ARENA_TAG = NAMESPACE + ".area.arena.arena";
    private static final String ISLAND_TAG = NAMESPACE + ".area.sky_survival.home_island";
    private static final String ROUND_BAR = NAMESPACE + ":msm_games/timer/arena/round";

    /** The blocks of the first two phases (Plains, Underground) and the chest a phase can give. */
    private static final Set<Block> PLAINS = Set.of(Blocks.GRASS_BLOCK, Blocks.DIRT, Blocks.OAK_LOG, Blocks.OAK_LEAVES,
            Blocks.MELON, Blocks.CHEST);
    private static final Set<Block> UNDERGROUND = Set.of(Blocks.STONE, Blocks.COAL_ORE, Blocks.IRON_ORE, Blocks.COPPER_ORE,
            Blocks.GOLD_ORE, Blocks.REDSTONE_ORE, Blocks.LAPIS_ORE, Blocks.CHEST);
    private static final Set<Item> PRIZES = Set.of(Items.IRON_INGOT, Items.GOLD_INGOT, Items.DIAMOND, Items.GOLDEN_APPLE,
            Items.ENDER_PEARL, Items.COOKIE);

    static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    /** Whether this run has the content jar: the lucky block is a block of the mod's own, never in a data pack. */
    static boolean jar() {
        return BuiltInRegistries.BLOCK.containsKey(id("lucky_block"));
    }

    /** The server's own source in the overworld, permission level 4, output suppressed. */
    private static CommandSourceStack console(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        return level.getServer().createCommandSourceStack().withLevel(level).withPermission(LevelBasedPermissionSet.GAMEMASTER)
                .withSuppressedOutput();
    }

    /** Runs {@code command} as the server; returns its result, or {@link Integer#MIN_VALUE} when it failed. */
    static int run(GameTestHelper helper, String command) {
        AtomicInteger result = new AtomicInteger(Integer.MIN_VALUE);
        CommandSourceStack source = console(helper).withCallback((success, value) -> result.set(success ? value : Integer.MIN_VALUE));
        helper.getLevel().getServer().getCommands().performPrefixedCommand(source, command);
        return result.get();
    }

    /** Whether {@code execute if <condition>} passes. */
    static boolean test(GameTestHelper helper, String condition) {
        return run(helper, "execute if " + condition) > 0;
    }

    /** Keeps the fixture's pieces loaded (chunks -1 to 0 in x and z). A first join's start removes its own tickets. */
    static void forceLoad(GameTestHelper helper) {
        run(helper, "forceload add -16 -16 15 15");
    }

    static String at(BlockPos pos) {
        return pos.getX() + " " + pos.getY() + " " + pos.getZ();
    }

    static BlockState block(GameTestHelper helper, BlockPos world) {
        return helper.getLevel().getBlockState(world);
    }

    static String name(BlockState state) {
        return BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
    }

    /** A score, or {@code null} when the holder has none. */
    static Integer score(MinecraftServer server, String holder, String objective) {
        Scoreboard scoreboard = server.getScoreboard();
        Objective o = scoreboard.getObjective(objective);
        if (o == null) {
            return null;
        }
        ReadOnlyScoreInfo info = scoreboard.getPlayerScoreInfo(ScoreHolder.forNameOnly(holder), o);
        return info == null ? null : info.value();
    }

    static int count(ServerPlayer player, Item item) {
        int total = 0;
        for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) {
            if (player.getInventory().getItem(slot).is(item)) {
                total += player.getInventory().getItem(slot).getCount();
            }
        }
        return total;
    }

    /** The Skyblock's first-join advancement. */
    static AdvancementHolder firstJoin(GameTestHelper helper) {
        AdvancementHolder holder = helper.getLevel().getServer().getAdvancements().get(id("msm_games/first_join"));
        helper.assertTrue(holder != null, "no advancement " + id("msm_games/first_join"));
        return holder;
    }

    /** Whether the player's first join has run (its advancement done). */
    static boolean joined(GameTestHelper helper, ServerPlayer player) {
        return player.getAdvancements().getOrStartProgress(firstJoin(helper)).isDone();
    }

    /** The system chat lines sent to the player since the last read of {@code ears}. */
    static List<String> chat(ParityEars ears) {
        List<String> out = new ArrayList<>();
        for (Packet<?> packet : ears.packets()) {
            if (packet instanceof ClientboundSystemChatPacket p && !p.overlay()) {
                out.add(p.content().getString());
            }
        }
        return out;
    }

    /** A step of {@link #steps}: returns true when done, false to be called again on the next tick. */
    @FunctionalInterface
    interface Step {
        boolean run();
    }

    /**
     * Runs {@code steps} in order on the test's ticks: each is called once a tick until it returns true, and the next one
     * starts on the following tick (so the server's own tick, with the games functions, runs between two steps). A failed
     * assertion inside a step fails the test at once; the test passes when the last step is done.
     */
    static void steps(GameTestHelper helper, List<Step> steps) {
        int[] at = {0};
        helper.onEachTick(() -> {
            if (at[0] < steps.size() && steps.get(at[0]).run()) {
                at[0]++;
            }
        });
        helper.succeedWhen(() -> helper.assertTrue(at[0] == steps.size(), "waiting at step " + (at[0] + 1) + " of " + steps.size()));
    }

    /** A step that waits until every player's first join has run (players made by {@link ParityEars} are ticked by the level). */
    static Step untilJoined(GameTestHelper helper, ParityEars... players) {
        return () -> {
            for (ParityEars ears : players) {
                if (!joined(helper, ears.player)) {
                    return false;
                }
            }
            return true;
        };
    }

    /** A step that waits {@code ticks} ticks. */
    static Step waitTicks(int ticks) {
        int[] left = {ticks};
        return () -> left[0]-- <= 0;
    }

    /** A step that runs {@code body} once. */
    static Step once(Runnable body) {
        return () -> {
            body.run();
            return true;
        };
    }

    /** The world setup's world start ran at load, the goals, teams, sidebar and the round's boss bar exist. */
    @GameTest
    public void theGameIsSetUpWhenTheWorldLoads(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        // The World Type the Create New World screen lists, and its sky biome.
        helper.assertTrue(server.registryAccess().lookupOrThrow(Registries.WORLD_PRESET)
                .get(ResourceKey.create(Registries.WORLD_PRESET, id("sky_survival"))).isPresent(), "no world preset sky_survival");
        helper.assertTrue(server.registryAccess().lookupOrThrow(Registries.BIOME)
                .get(ResourceKey.create(Registries.BIOME, id("msm_games/sky"))).isPresent(), "no sky biome");
        // The world start ran once (#minecraft:load).
        helper.assertTrue(test(helper, "data storage " + NAMESPACE + ":msm_games {world_setup:1b}"), "the world start did not run");
        helper.assertValueEqual(run(helper, "difficulty"), 2, "difficulty (normal)");
        helper.assertTrue(server.getAdvancements().get(id("sky_survival/goals/root")) != null, "no goals tab");
        // Both teams (msm:team, B552).
        Scoreboard scoreboard = server.getScoreboard();
        for (String[] team : new String[][] {{RED, "red", "[Red] "}, {BLUE, "blue", "[Blue] "}}) {
            PlayerTeam t = scoreboard.getPlayerTeam(team[0]);
            helper.assertTrue(t != null, "no team " + team[0]);
            helper.assertValueEqual(t.getColor().map(c -> c.getSerializedName()).orElse("none"), team[1], team[0] + " colour");
            helper.assertValueEqual(t.getPlayerPrefix().getString(), team[2], team[0] + " prefix");
            helper.assertFalse(t.isAllowFriendlyFire(), team[0] + " friendly fire");
        }
        // The points on the sidebar.
        Objective sidebar = scoreboard.getDisplayObjective(DisplaySlot.SIDEBAR);
        helper.assertTrue(sidebar != null, "nothing on the sidebar");
        helper.assertValueEqual(sidebar.getName(), POINTS, "the sidebar objective");
        helper.assertValueEqual(sidebar.getCriteria().getName(), "playerKillCount", "its criterion");
        helper.assertValueEqual(sidebar.getDisplayName().getString(), "Defeats", "its name");
        // The round's boss bar, made at load.
        CustomBossEvent bar = server.getCustomBossEvents().get(Identifier.parse(ROUND_BAR));
        helper.assertTrue(bar != null, "no boss bar " + ROUND_BAR);
        helper.assertValueEqual(bar.max(), 300, "the round's seconds");
        helper.succeed();
    }

    /**
     * The first join places the island once and gives the kit once: after a player's first join the island is at 0 64 0
     * with its chest naming its loot table and the world spawn on its grass (whichever test's player joined first placed
     * it); each player gets three bread and slow falling once, however long it plays; a second player's join does not
     * place the island again (a grass block taken away stays away). Then the home island area: a player on the island is
     * tagged, and its reset removes a pig and places the island again.
     */
    @GameTest(maxTicks = 300)
    public void theIslandIsPlacedOnceAndTheKitGivenOnce(GameTestHelper helper) {
        forceLoad(helper);
        ParityEars first = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.SURVIVAL, "msm-sky-first");
        ParityEars[] second = {null};
        steps(helper, List.of(
                untilJoined(helper, first),
                once(() -> {
                    forceLoad(helper);
                    helper.assertTrue(test(helper, "data storage " + NAMESPACE + ":msm_games {start:1b}"), "the start flag is not set");
                    helper.assertValueEqual(name(block(helper, ISLAND_GRASS)), "minecraft:grass_block", "the island's grass at " + at(ISLAND_GRASS));
                    helper.assertValueEqual(name(block(helper, ISLAND_GRASS.below())), "minecraft:dirt", "the island's dirt");
                    helper.assertValueEqual(name(block(helper, ISLAND_CHEST)), "minecraft:chest", "the island's chest");
                    helper.assertTrue(test(helper, "block " + at(ISLAND_CHEST) + " minecraft:chest{LootTable:\"" + NAMESPACE
                            + ":sky_survival/start_chest\"}"), "the chest does not name its loot table");
                    helper.assertValueEqual(helper.getLevel().getRespawnData().pos(), BlockPos.containing(ISLAND_SPAWN), "the world spawn");
                    helper.assertValueEqual(count(first.player, Items.BREAD), 3, "the first player's kit");
                    helper.assertTrue(first.player.hasEffect(MobEffects.SLOW_FALLING), "no slow falling for the first player");
                    helper.assertValueEqual(first.player.gameMode.getGameModeForPlayer(), GameType.SURVIVAL, "game mode");
                }),
                waitTicks(20),
                once(() -> {
                    helper.assertValueEqual(count(first.player, Items.BREAD), 3, "the first player's kit 20 ticks later");
                    // Take a grass block away; a second player's first join must not place the island again.
                    run(helper, "setblock " + at(ISLAND_GRASS) + " minecraft:air");
                    second[0] = new ParityEars(helper, new BlockPos(3, 1, 1), GameType.SURVIVAL, "msm-sky-second");
                }),
                () -> joined(helper, second[0].player),
                once(() -> {
                    helper.assertValueEqual(count(second[0].player, Items.BREAD), 3, "the second player's kit");
                    forceLoad(helper);
                    helper.assertValueEqual(name(block(helper, ISLAND_GRASS)), "minecraft:air", "the island was placed again");
                    // The home island area: a player on the island is tagged by the area's tick.
                    second[0].player.teleportTo(ISLAND_SPAWN.x, ISLAND_SPAWN.y, ISLAND_SPAWN.z);
                    run(helper, "summon minecraft:pig 3.5 67 3.5 {NoAI:1b,Tags:[\"msm_b559_pig\"]}");
                }),
                () -> second[0].player.entityTags().contains(ISLAND_TAG),
                once(() -> {
                    helper.assertTrue(test(helper, "entity @e[type=minecraft:pig,tag=msm_b559_pig]"), "no pig to clear");
                    run(helper, "function " + NAMESPACE + ":msm_games/area/sky_survival/home_island/reset");
                    helper.assertValueEqual(name(block(helper, ISLAND_GRASS)), "minecraft:grass_block", "the reset did not place the island");
                    helper.assertFalse(test(helper, "entity @e[type=minecraft:pig,tag=msm_b559_pig]"), "the reset left the pig");
                    helper.assertTrue(second[0].player.isAlive() && !second[0].player.isRemoved(), "the reset removed the player");
                    first.close();
                    second[0].close();
                })));
    }

    /**
     * The one block: a player breaks it 20 times; it is refilled each time, from the Plains blocks (or a chest) for the
     * first 10 breaks and the Underground ones for the next 10, the phase holder counting on, "Underground" and "Deep dark"
     * said in chat. With the jar, the rule book also says "Underground at last!" on each break in the second phase.
     */
    @GameTest(maxTicks = 400)
    public void theOneBlockRefillsThroughItsPhases(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        forceLoad(helper);
        ParityEars ears = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.CREATIVE, "msm-one-block");
        List<String> lines = new ArrayList<>();
        List<String> seen = new ArrayList<>();
        int[] breaks = {0};
        int[] empty = {0};
        String near = "x=" + ONE_BLOCK.getX() + ",y=" + ONE_BLOCK.getY() + ",z=" + ONE_BLOCK.getZ();
        steps(helper, List.of(
                untilJoined(helper, ears),
                once(() -> {
                    ears.player.setGameMode(GameType.CREATIVE);
                    ears.player.teleportTo(ONE_BLOCK.getX() + 0.5, ONE_BLOCK.getY() + 1, ONE_BLOCK.getZ() + 2.5);
                    helper.assertValueEqual(score(server, "#one_block.magic_block.phase", ONE_BLOCKS), 0, "the phase at the start");
                    chat(ears);
                }),
                () -> {
                    // One break a tick at most: the block's tick function refills it on the server's tick between.
                    forceLoad(helper);
                    lines.addAll(chat(ears));
                    BlockState now = block(helper, ONE_BLOCK);
                    if (now.isAir()) {
                        helper.assertTrue(++empty[0] < 10, "the one block was not refilled after " + breaks[0] + " breaks");
                        return false;
                    }
                    empty[0] = 0;
                    if (breaks[0] == 20) {
                        return true;
                    }
                    seen.add(name(now));
                    Set<Block> phase = breaks[0] < 10 ? PLAINS : UNDERGROUND;
                    helper.assertTrue(phase.contains(now.getBlock()), "break " + (breaks[0] + 1) + ": " + name(now)
                            + " is not of the phase; seen " + seen);
                    run(helper, "kill @e[type=!minecraft:player," + near + ",distance=..4]");
                    helper.assertTrue(ears.player.gameMode.destroyBlock(ONE_BLOCK), "breaking the one block failed");
                    breaks[0]++;
                    return false;
                },
                waitTicks(2),
                once(() -> {
                    lines.addAll(chat(ears));
                    helper.assertValueEqual(score(server, "#one_block.magic_block.phase", ONE_BLOCKS), 2, "the phase after 20 breaks");
                    helper.assertValueEqual(score(server, "#one_block.magic_block.breaks", ONE_BLOCKS), 0, "breaks in the new phase");
                    helper.assertValueEqual(lines.stream().filter("Underground"::equals).count(), 1L, "Underground said: " + lines);
                    helper.assertValueEqual(lines.stream().filter("Deep dark"::equals).count(), 1L, "Deep dark said: " + lines);
                    long atLast = lines.stream().filter("Underground at last!"::equals).count();
                    helper.assertValueEqual(atLast, jar() ? 10L : 0L, "the rule book's line (jar: " + jar() + "): " + lines);
                    run(helper, "kill @e[type=!minecraft:player," + near + ",distance=..3]");
                    ears.close();
                })));
    }

    /**
     * The round: started by its function (as the arena's start does), shown on the boss bar, counted down from 300 (set to
     * 2 here, the holder the Rules' "time left" reads), ended, running its {@code on_end} {@code round_end}: the title
     * "Round over" and the arena rebuilt. With the jar, the rule book gives every player a point when it ends.
     */
    @GameTest(maxTicks = 300)
    public void theRoundTimerEndsAndRunsItsEnd(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        forceLoad(helper);
        ParityEars ears = ParityEars.listener(helper, new BlockPos(1, 1, 1));
        CustomBossEvent bar = server.getCustomBossEvents().get(Identifier.parse(ROUND_BAR));
        Integer[] before = {null};
        List<String> read = new ArrayList<>();
        steps(helper, List.of(
                untilJoined(helper, ears),
                once(() -> {
                    ears.player.setGameMode(GameType.SPECTATOR);
                    ears.player.teleportTo(0.5, 120, 30.5);
                    forceLoad(helper);
                    run(helper, "function " + NAMESPACE + ":msm_games/area/arena/arena/reset");
                    run(helper, "setblock 3 101 3 minecraft:gold_block");
                    before[0] = score(server, ears.player.getScoreboardName(), POINTS);
                    ears.read();
                    run(helper, "function " + NAMESPACE + ":msm_games/timer/arena/round/start");
                    helper.assertTrue(bar.isVisible(), "the boss bar is hidden while the round runs");
                    helper.assertValueEqual(bar.value(), 300, "the boss bar at the start");
                    helper.assertValueEqual(score(server, "#arena.round", TIMERS), 300, "seconds left at the start");
                    helper.assertValueEqual(score(server, "#arena.round.on", TIMERS), 1, "running");
                    run(helper, "scoreboard players set #arena.round " + TIMERS + " 2");
                }),
                () -> {
                    read.addAll(ears.read());
                    return Integer.valueOf(0).equals(score(server, "#arena.round.on", TIMERS));
                },
                waitTicks(2),
                once(() -> {
                    read.addAll(ears.read());
                    helper.assertValueEqual(score(server, "#arena.round", TIMERS), 0, "seconds left at the end");
                    helper.assertFalse(bar.isVisible(), "the boss bar shows after the end");
                    helper.assertTrue(read.contains("title Round over"), "no title Round over: " + read);
                    forceLoad(helper);
                    helper.assertValueEqual(name(block(helper, new BlockPos(3, 101, 3))), "minecraft:air", "round_end did not rebuild the arena");
                    Integer after = score(server, ears.player.getScoreboardName(), POINTS);
                    int gained = (after == null ? 0 : after) - (before[0] == null ? 0 : before[0]);
                    helper.assertValueEqual(gained, jar() ? 1 : 0, "points from the round's end (jar: " + jar() + ")");
                    ears.close();
                })));
    }

    /**
     * The arena's area: its reset builds the arena (floor, walls, lanterns); a player walking in is tagged (and, with the
     * jar, joins the red team by the rule book), walking out untagged; a block and a mob left in it are removed by the next
     * reset, players are not.
     */
    @GameTest(maxTicks = 300)
    public void theArenaIsEnteredAndReset(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        forceLoad(helper);
        ParityEars ears = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.SURVIVAL, "msm-arena");
        steps(helper, List.of(
                untilJoined(helper, ears),
                once(() -> {
                    ears.player.setGameMode(GameType.CREATIVE);
                    forceLoad(helper);
                    run(helper, "function " + NAMESPACE + ":msm_games/area/arena/arena/reset");
                    helper.assertValueEqual(name(block(helper, ARENA_CORNER)), "minecraft:stone_bricks", "the arena floor");
                    helper.assertValueEqual(name(block(helper, ARENA_CORNER.above())), "minecraft:mossy_stone_bricks", "the arena wall");
                    helper.assertValueEqual(name(block(helper, ARENA_CORNER.above(4))), "minecraft:lantern", "the corner lantern");
                    helper.assertFalse(ears.player.entityTags().contains(ARENA_TAG), "tagged before walking in");
                    ears.player.teleportTo(ARENA_MIDDLE.x, ARENA_MIDDLE.y, ARENA_MIDDLE.z);
                }),
                () -> ears.player.entityTags().contains(ARENA_TAG),
                waitTicks(2),
                once(() -> {
                    PlayerTeam team = server.getScoreboard().getPlayersTeam(ears.player.getScoreboardName());
                    if (jar()) {
                        helper.assertTrue(team != null && team.getName().equals(RED), "the rule book did not put the player on red: " + team);
                    } else {
                        helper.assertTrue(team == null, "on a team without the jar: " + team);
                    }
                    ears.player.teleportTo(0.5, 120, 40.5);
                }),
                () -> !ears.player.entityTags().contains(ARENA_TAG),
                once(() -> {
                    forceLoad(helper);
                    run(helper, "setblock 2 101 2 minecraft:dirt");
                    run(helper, "summon minecraft:pig 4.5 101 4.5 {NoAI:1b,Tags:[\"msm_b559_arena_pig\"]}");
                    ears.player.teleportTo(-3.5, 101, -3.5);
                    helper.assertTrue(test(helper, "entity @e[type=minecraft:pig,tag=msm_b559_arena_pig]"), "no pig to clear");
                    run(helper, "function " + NAMESPACE + ":msm_games/area/arena/arena/reset");
                    helper.assertValueEqual(name(block(helper, new BlockPos(2, 101, 2))), "minecraft:air", "the reset left the dirt");
                    helper.assertFalse(test(helper, "entity @e[type=minecraft:pig,tag=msm_b559_arena_pig]"), "the reset left the pig");
                    helper.assertTrue(ears.player.isAlive() && !ears.player.isRemoved(), "the reset removed the player");
                    run(helper, "team leave " + ears.player.getScoreboardName());
                    ears.close();
                })));
    }

    /**
     * A player defeating another scores one point on the sidebar objective (criterion {@code playerKillCount}), once the
     * loser's spawn protection (3 seconds) is over.
     */
    @GameTest(maxTicks = 300)
    public void aKillScoresOnTheSidebar(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        ParityEars winner = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.SURVIVAL, "msm-winner");
        ParityEars loser = new ParityEars(helper, new BlockPos(3, 1, 1), GameType.SURVIVAL, "msm-loser");
        steps(helper, List.of(
                untilJoined(helper, winner, loser),
                once(() -> {
                    Vec3 a = helper.absoluteVec(new Vec3(1.5, 1, 1.5));
                    Vec3 b = helper.absoluteVec(new Vec3(2.5, 1, 1.5));
                    winner.player.teleportTo(a.x, a.y, a.z);
                    loser.player.teleportTo(b.x, b.y, b.z);
                }),
                waitTicks(70),
                () -> {
                    // Read the points in the same tick as the blow: other tests' rules may add points on the server's tick.
                    Integer before = score(server, winner.player.getScoreboardName(), POINTS);
                    loser.player.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(winner.player), 1000.0f);
                    if (!loser.player.isDeadOrDying()) {
                        return false;
                    }
                    Integer after = score(server, winner.player.getScoreboardName(), POINTS);
                    helper.assertValueEqual(after == null ? 0 : after, (before == null ? 0 : before) + 1, "the winner's points");
                    return true;
                },
                once(() -> {
                    helper.assertValueEqual(server.getScoreboard().getDisplayObjective(DisplaySlot.SIDEBAR).getName(), POINTS, "the sidebar");
                    winner.close();
                    loser.close();
                })));
    }

    /**
     * The lucky block's rule book (Lucky block flow defaults: prizes often, a zombie, a hut and Speed sometimes, an explosion
     * that breaks nothing rarely). With the jar: each of 30 breaks by a player does one outcome, and the prizes come at
     * least once. As a vanilla data pack: the block is not registered and the bridge's functions are not there.
     */
    @GameTest(structure = ARENA, maxTicks = 400)
    public void theLuckyBlockRuleFiresInTheJarOnly(GameTestHelper helper) {
        if (!jar()) {
            helper.assertTrue(helper.getLevel().getServer().getFunctions()
                    .get(id("msm_rules/signal/timer/arena/round/ended")).isEmpty(), "a bridge function in the vanilla pack run");
            helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("lucky_block")), "the lucky block's item without the jar");
            helper.succeed();
            return;
        }
        Block lucky = BuiltInRegistries.BLOCK.getValue(id("lucky_block"));
        BlockPos rel = new BlockPos(3, 1, 3);
        BlockPos abs = helper.absolutePos(rel);
        ParityEars ears = new ParityEars(helper, new BlockPos(8, 1, 8), GameType.CREATIVE, "msm-lucky");
        AABB box = new AABB(abs).inflate(6);
        int[] outcomes = new int[5];
        List<String> nothing = new ArrayList<>();
        int[] breaks = {0};
        boolean[] broken = {false};
        steps(helper, List.of(
                untilJoined(helper, ears),
                once(() -> {
                    ears.player.setGameMode(GameType.CREATIVE);
                    Vec3 stand = helper.absoluteVec(new Vec3(8.5, 1, 8.5));
                    ears.player.teleportTo(stand.x, stand.y, stand.z);
                }),
                () -> {
                    if (!broken[0]) {
                        // Clear what the last break left, then put the block back and break it.
                        ears.player.removeAllEffects();
                        helper.getLevel().getEntitiesOfClass(ItemEntity.class, box).forEach(e -> e.discard());
                        helper.getLevel().getEntitiesOfClass(Zombie.class, box).forEach(e -> e.discard());
                        for (BlockPos p : BlockPos.betweenClosed(rel, rel.offset(4, 3, 4))) {
                            helper.setBlock(p.immutable(), Blocks.AIR);
                        }
                        helper.setBlock(rel, lucky);
                        ears.packets();
                        helper.assertTrue(ears.player.gameMode.destroyBlock(abs), "breaking the lucky block failed");
                        broken[0] = true;
                        return false;
                    }
                    // A tick later: what happened.
                    int found = 0;
                    if (!helper.getLevel().getEntitiesOfClass(ItemEntity.class, box, e -> PRIZES.contains(e.getItem().getItem())).isEmpty()) {
                        outcomes[0]++;
                        found++;
                    }
                    if (!helper.getLevel().getEntitiesOfClass(Zombie.class, box).isEmpty()) {
                        outcomes[1]++;
                        found++;
                    }
                    if (ears.packets().stream().anyMatch(p -> p instanceof ClientboundExplodePacket)) {
                        outcomes[2]++;
                        found++;
                    }
                    // The hut's corner is where the block was; the script runs as the block breaks, so the break then
                    // takes that one block (the hut's own corner) away: look at the floor beside it.
                    if (helper.getBlockState(rel.east()).is(Blocks.COBBLESTONE) && helper.getBlockState(rel.south()).is(Blocks.COBBLESTONE)) {
                        outcomes[3]++;
                        found++;
                    }
                    if (ears.player.hasEffect(MobEffects.SPEED)) {
                        outcomes[4]++;
                        found++;
                    }
                    if (found != 1) {
                        nothing.add("break " + (breaks[0] + 1) + ": " + found + " outcomes; entities "
                                + helper.getLevel().getEntities((Entity) null, box, e -> true).stream()
                                        .map(e -> BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).getPath()).toList()
                                + ", block " + name(helper.getBlockState(rel)) + ", effects " + ears.player.getActiveEffects());
                    }
                    broken[0] = false;
                    return ++breaks[0] == 30;
                },
                once(() -> {
                    helper.assertTrue(nothing.isEmpty(), "breaks without exactly one outcome: " + nothing + "; outcomes "
                            + Arrays.toString(outcomes));
                    helper.assertTrue(outcomes[0] > 0, "no prizes in 30 breaks: " + Arrays.toString(outcomes));
                    helper.getLevel().getEntitiesOfClass(ItemEntity.class, box).forEach(e -> e.discard());
                    helper.getLevel().getEntitiesOfClass(Zombie.class, box).forEach(e -> e.discard());
                    ears.close();
                })));
    }
}
