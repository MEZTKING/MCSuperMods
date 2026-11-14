package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.scripting.ScriptData;
import dev.mcsupermods.runtime.scripting.ScriptDataAttachment;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.ChatType;
import net.minecraft.network.chat.PlayerChatMessage;
import net.minecraft.network.protocol.game.ClientboundBossEventPacket;
import net.minecraft.network.protocol.game.ClientboundClearTitlesPacket;
import net.minecraft.network.protocol.game.ClientboundDisguisedChatPacket;
import net.minecraft.network.protocol.game.ClientboundGameEventPacket;
import net.minecraft.network.protocol.game.ClientboundPlayerChatPacket;
import net.minecraft.network.protocol.game.ClientboundSetActionBarTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetExperiencePacket;
import net.minecraft.network.protocol.game.ClientboundSetHealthPacket;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.server.players.PlayerList;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.projectile.arrow.Arrow;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket;
import net.minecraft.network.protocol.game.ClientboundBlockUpdatePacket;
import net.minecraft.network.protocol.game.ClientboundContainerSetContentPacket;
import net.minecraft.network.protocol.game.ClientboundCooldownPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Runtime v1 scripting GameTests (ADR 0031, ADR 0032) on the hand-written ES5 CommonJS scripts in
 * {@code msm/msm_test/script/} of this test mod: one per game event, the World, Entity and Player API, schedules,
 * relative {@code require}, the {@code run_script} action of {@code msm/msm_test/block/scripted.json}, isolation and
 * the sandbox, errors and the time budget; saved script data (ADR 0062) through the {@code run_script} handlers of
 * {@code data.js} in {@code msm_test} and {@code msm_test_b}.
 *
 * <p>Interactions go through {@code ServerPlayerGameMode.useItemOn}, {@code useItem} and {@code destroyBlock}, so the
 * Fabric API events fire ({@code GameTestHelper.useBlock} calls the block directly and bypasses
 * {@code UseBlockCallback}). {@code UseEntityCallback} fires from the network handler, which a mock player cannot
 * drive, so the entity tests invoke the Fabric event's invoker; {@code ServerPlayConnectionEvents.JOIN} fires when
 * {@code makeMockServerPlayerInLevel} places a mock player. The
 * {@code END_DATA_PACK_RELOAD} test reloads a detached host, since a {@code /reload} would reset the scripts other
 * tests of the batch are using.
 */
public class MsmScriptGameTest {
    private static final BlockPos AT = new BlockPos(1, 2, 1);
    private static final String EVENTS = "msm_test:events: ";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static ScriptHost host(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost: SERVER_STARTING did not load scripts");
        return host;
    }

    private static ServerPlayer survivalPlayer(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        return player;
    }

    /** Right-click on the top face through {@code ServerPlayerGameMode.useItemOn}, as the network handler does. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel, InteractionHand hand) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(hand), hand, hit);
    }

    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        return use(helper, player, rel, InteractionHand.MAIN_HAND);
    }

    private static InteractionResult useItem(GameTestHelper helper, ServerPlayer player, InteractionHand hand) {
        return player.gameMode.useItem(player, helper.getLevel(), player.getItemInHand(hand), hand);
    }

    private static InteractionResult interactEntity(GameTestHelper helper, ServerPlayer player, Entity entity) {
        return UseEntityCallback.EVENT.invoker().interact(player, helper.getLevel(), InteractionHand.MAIN_HAND, entity,
                new EntityHitResult(entity));
    }

    private static <T extends Entity> T named(T entity, String name) {
        entity.setCustomName(Component.literal(name));
        return entity;
    }

    private static int count(ServerPlayer player, Item item) {
        int n = 0;
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            if (player.getInventory().getItem(i).is(item)) {
                n += player.getInventory().getItem(i).getCount();
            }
        }
        return n;
    }

    private static String pos(GameTestHelper helper, BlockPos rel) {
        BlockPos a = helper.absolutePos(rel);
        return a.getX() + ", " + a.getY() + ", " + a.getZ();
    }

    private static long logged(ScriptHost host, String line) {
        return host.recentLogs().stream().filter(line::equals).count();
    }

    private static void assertLogged(GameTestHelper helper, ScriptHost host, String line) {
        helper.assertTrue(logged(host, line) >= 1, "not logged: '" + line + "'; recent: " + tail(host));
    }

    private static List<String> tail(ScriptHost host) {
        List<String> logs = host.recentLogs();
        return logs.subList(Math.max(0, logs.size() - 12), logs.size());
    }

    // ---- loading, errors, sandbox ------------------------------------------------------------------------

    @GameTest
    public void scriptsLoadWithTwoErrors(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.assertValueEqual(host.summary(), "[msm_runtime] loaded 21 script(s); 2 error(s)", "load summary");
        helper.assertValueEqual(host.loadErrors(), List.of(
                "script msm_test:broken: syntax error (msm/msm_test/script/broken.js#5)",
                "script msm_test:events: unknown event 'no.such.event' (msm/msm_test/script/events.js)"), "load errors");
        ScriptHost.Report report = host.report();
        helper.assertValueEqual(report.scripts().size(), 21, "scripts found");
        helper.assertFalse(report.loaded().contains(id("broken")), "broken.js loaded");
        helper.assertTrue(report.loaded().contains(id("events")), "events.js with an unknown event name did not load");
        // events.js still registered its other handlers.
        helper.assertTrue(host.handlerCount("server.tick") >= 1 && host.handlerCount("player.join") == 1, "events.js handlers");
        MsmRuntime.LOGGER.info("[msm_runtime] script test: {}; errors {}", host.summary(), host.loadErrors());
        helper.succeed();
    }

    @GameTest
    public void sandboxHidesJavaAndSealsSharedObjects(GameTestHelper helper) {
        ScriptHost host = host(helper);
        assertLogged(helper, host, "msm_test:a_sandbox: sandbox refused Array.prototype, globalThis, Math; java=undefined "
                + "Packages=undefined JavaAdapter=undefined");
        assertLogged(helper, host, "msm_test:z_isolation: isolation topLevel=undefined undeclaredGlobal=undefined "
                + "Array.prototype=undefined globalThis=undefined Math=undefined");
        helper.succeed();
    }

    /** Named groups need {@code RegExpLoader}, which Rhino finds through {@code ServiceLoader}; promises run as microtasks. */
    @GameTest
    public void regexGroupsAndPromisesWork(GameTestHelper helper) {
        ScriptHost host = host(helper);
        assertLogged(helper, host, "msm_test:a_sandbox: regex msm_test/kitchen_sink");
        assertLogged(helper, host, "msm_test:a_sandbox: promise 7");
        helper.succeed();
    }

    @GameTest
    public void relativeRequireLoadsEachModuleOnce(GameTestHelper helper) {
        ScriptHost host = host(helper);
        assertLogged(helper, host, "msm_test:main: require answer=42 doubled=84 same=true; "
                + "cannot find module './missing' from msm_test:main; cannot find module '../../escape' from msm_test:main; "
                + "cannot find module 'fs': only 'msm:runtime' and relative ids are allowed");
        helper.assertValueEqual(logged(host, "msm_test:util: util evaluated"), 1L, "util.js evaluations");
        helper.succeed();
    }

    @GameTest
    public void throwingHandlerIsLoggedOnce(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.DIAMOND_BLOCK);
        ServerPlayer player = survivalPlayer(helper);
        InteractionResult first = use(helper, player, AT);
        InteractionResult second = use(helper, player, AT);
        List<String> errors = host.handlerErrors().stream()
                .filter(e -> e.startsWith("script msm_test:throws: block.interact handler: ")).toList();
        helper.assertValueEqual(errors.size(), 1, "logged handler errors (rate-limited): " + errors);
        helper.assertTrue(errors.getFirst().contains("(msm/msm_test/script/throws.js#7)"), "handler error: " + errors);
        helper.assertTrue(!(first instanceof InteractionResult.Fail) && !(second instanceof InteractionResult.Fail),
                "a throwing handler cancelled the interaction");
        MsmRuntime.LOGGER.info("[msm_runtime] script test: throwing handler logged once: {}", errors.getFirst());
        helper.succeed();
    }

    @GameTest
    public void endlessLoopIsStopped(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.BEDROCK);
        ServerPlayer player = survivalPlayer(helper);
        long start = System.nanoTime();
        InteractionResult result = use(helper, player, AT);
        long ms = (System.nanoTime() - start) / 1_000_000L;
        helper.assertTrue(ms < 3000, "endless loop ran for " + ms + " ms");
        helper.assertTrue(ms >= host.budgetMs() - 50, "stopped before the budget: " + ms + " ms");
        String error = host.handlerErrors().stream().filter(e -> e.startsWith("script msm_test:loop: ")).findFirst().orElse("");
        helper.assertValueEqual(error, "script msm_test:loop: block.interact handler: ran for more than 2000 ms and was stopped "
                + "(msm/msm_test/script/loop.js)", "loop error");
        helper.assertTrue(!(result instanceof InteractionResult.Fail), "an aborted handler cancelled the interaction");
        MsmRuntime.LOGGER.info("[msm_runtime] script test: endless loop stopped after {} ms", ms);
        helper.succeed();
    }

    // ---- game events -------------------------------------------------------------------------------------

    @GameTest
    public void serverStartedRanBeforeTheTests(GameTestHelper helper) {
        assertLogged(helper, host(helper), EVENTS + "server.started in minecraft:overworld");
        helper.succeed();
    }

    @GameTest(maxTicks = 60)
    public void serverTickCountsTicks(GameTestHelper helper) {
        ScriptHost host = host(helper);
        long start = helper.getLevel().getServer().getTickCount();
        Pattern line = Pattern.compile(Pattern.quote(EVENTS) + "server\\.tick (\\d+) at (\\d+) in minecraft:overworld");
        helper.runAfterDelay(45, () -> {
            List<long[]> seen = new ArrayList<>();
            for (String log : host.recentLogs()) {
                Matcher m = line.matcher(log);
                if (m.matches() && Long.parseLong(m.group(2)) >= start) {
                    seen.add(new long[] {Long.parseLong(m.group(1)), Long.parseLong(m.group(2))});
                }
            }
            helper.assertTrue(seen.size() >= 2, "server.tick logs since tick " + start + ": " + seen.size());
            long[] a = seen.get(seen.size() - 2);
            long[] b = seen.getLast();
            helper.assertValueEqual(b[0] - a[0], b[1] - a[1], "handler calls between two logs");
            helper.succeed();
        });
    }

    @GameTest
    public void blockInteractCancelsTheBlocksOwnUse(GameTestHelper helper) {
        ScriptHost host = host(helper);
        Block sink = BuiltInRegistries.BLOCK.getValue(id("kitchen_sink"));
        helper.setBlock(AT, sink);
        ServerPlayer player = survivalPlayer(helper);
        List<String> events = new ArrayList<>();
        EventListener recorder = new EventListener() {
            @Override
            public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
                if (ctx.level() == helper.getLevel() && ctx.base().equals(helper.absolutePos(AT))) {
                    events.add(owner + " " + event);
                }
            }
        };
        InteractionResult result;
        EventRunner.addListener(recorder);
        try {
            result = use(helper, player, AT);
        } finally {
            EventRunner.removeListener(recorder);
        }
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        helper.assertBlockPresent(Blocks.GLOWSTONE, AT.above());
        helper.assertValueEqual(count(player, Items.EMERALD), 1, "emeralds given by the script");
        helper.assertTrue(events.isEmpty(), "the block's own msm:on_interact ran: " + events);
        assertLogged(helper, host, EVENTS + "block.interact main msm_test:kitchen_sink at " + pos(helper, AT));
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void offHandAndItemUseAreRefusedAfterACancelledClick(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, BuiltInRegistries.BLOCK.getValue(id("kitchen_sink")));
        ServerPlayer player = survivalPlayer(helper);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SNOWBALL, 4));
        InteractionResult main = use(helper, player, AT, InteractionHand.MAIN_HAND);
        InteractionResult off = use(helper, player, AT, InteractionHand.OFF_HAND);
        InteractionResult item = useItem(helper, player, InteractionHand.MAIN_HAND);
        helper.assertTrue(main instanceof InteractionResult.Fail, "main hand not cancelled: " + main);
        helper.assertTrue(off instanceof InteractionResult.Fail, "off hand not refused: " + off);
        helper.assertTrue(item instanceof InteractionResult.Fail, "item use not refused: " + item);
        String at = " msm_test:kitchen_sink at " + pos(helper, AT);
        helper.assertValueEqual(logged(host, EVENTS + "block.interact main" + at), 1L, "block.interact main");
        helper.assertValueEqual(logged(host, EVENTS + "block.interact off" + at), 0L, "block.interact off");
        helper.assertValueEqual(player.getItemInHand(InteractionHand.MAIN_HAND).getCount(), 4, "snowballs after the refused use");
        // The next tick is a new click: the item use runs (and vanilla throws a snowball).
        helper.runAfterDelay(1, () -> {
            InteractionResult later = useItem(helper, player, InteractionHand.MAIN_HAND);
            helper.assertFalse(later instanceof InteractionResult.Fail, "item use refused in the next tick: " + later);
            helper.assertValueEqual(player.getItemInHand(InteractionHand.MAIN_HAND).getCount(), 3, "snowballs after the next use");
            helper.succeed();
        });
    }

    @GameTest
    public void blockBreakIsCancelled(GameTestHelper helper) {
        ScriptHost host = host(helper);
        BlockPos stone = AT.east();
        helper.setBlock(AT, Blocks.GLOWSTONE);
        helper.setBlock(stone, Blocks.STONE);
        ServerPlayer player = survivalPlayer(helper);
        boolean glowstoneBroken = player.gameMode.destroyBlock(helper.absolutePos(AT));
        boolean stoneBroken = player.gameMode.destroyBlock(helper.absolutePos(stone));
        helper.assertFalse(glowstoneBroken, "destroyBlock on glowstone returned true");
        helper.assertBlockPresent(Blocks.GLOWSTONE, AT);
        helper.assertTrue(stoneBroken, "control: stone was not broken");
        helper.assertBlockPresent(Blocks.AIR, stone);
        assertLogged(helper, host, EVENTS + "block.break minecraft:glowstone by " + player.getName().getString() + " at " + pos(helper, AT));
        helper.succeed();
    }

    @GameTest
    public void itemUseSeesTheHeldItemAndCancels(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = survivalPlayer(helper);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.ENDER_PEARL, 16));
        InteractionResult result = useItem(helper, player, InteractionHand.MAIN_HAND);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        helper.assertValueEqual(player.getItemInHand(InteractionHand.MAIN_HAND).getCount(), 16, "ender pearls after a cancelled use");
        assertLogged(helper, host, EVENTS + "item.use main minecraft:ender_pearl x16 held minecraft:ender_pearl");
        helper.succeed();
    }

    @GameTest
    public void entityInteractCancels(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = survivalPlayer(helper);
        Mob cow = named(helper.spawnWithNoFreeWill(EntityTypes.COW, AT), "msm-interact");
        InteractionResult result = interactEntity(helper, player, cow);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        assertLogged(helper, host, EVENTS + "entity.interact main minecraft:cow by " + player.getName().getString());
        helper.succeed();
    }

    @GameTest
    public void entityHurtCancelKeepsHealth(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = survivalPlayer(helper);
        Mob pig = named(helper.spawnWithNoFreeWill(EntityTypes.PIG, AT), "msm-hurt");
        float before = pig.getHealth();
        boolean hurt = pig.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(player), 4);
        helper.assertFalse(hurt, "a cancelled entity.hurt still hurt the pig");
        helper.assertValueEqual(pig.getHealth(), before, "pig health");
        assertLogged(helper, host, EVENTS + "entity.hurt minecraft:pig amount 4 attacker minecraft:player");
        helper.succeed();
    }

    @GameTest
    public void entityDeathNamesTheAttacker(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = survivalPlayer(helper);
        Mob zombie = named(helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, AT), "msm-death");
        zombie.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(player), 1000);
        helper.assertFalse(zombie.isAlive(), "zombie survived");
        assertLogged(helper, host, EVENTS + "entity.death minecraft:zombie attacker minecraft:player isPlayer=true");
        helper.succeed();
    }

    /** {@code makeMockServerPlayerInLevel} places the player through {@code PlayerList.placeNewPlayer}, which fires JOIN. */
    @GameTest
    public void playerJoinFires(GameTestHelper helper) {
        ScriptHost host = host(helper);
        long before = logged(host, EVENTS + "player.join test-mock-player in minecraft:overworld");
        ServerPlayer player = survivalPlayer(helper);
        helper.assertValueEqual(player.getName().getString(), "test-mock-player", "mock player name");
        helper.assertValueEqual(logged(host, EVENTS + "player.join test-mock-player in minecraft:overworld") - before, 1L,
                "player.join for the new player");
        helper.succeed();
    }

    // ---- API ---------------------------------------------------------------------------------------------

    @GameTest
    public void worldApi(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.LODESTONE);
        ServerPlayer player = survivalPlayer(helper);
        InteractionResult result = use(helper, player, AT);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        helper.assertBlockPresent(Blocks.OAK_STAIRS, AT.above());
        helper.assertBlockPresent(Blocks.GOLD_BLOCK, AT.above(2));
        String state = BlockStateParser.serialize(helper.getBlockState(AT.above()));
        assertLogged(helper, host, "msm_test:world: world true | false | " + state + " | 1 | true | false | minecraft:chicken | 1 | "
                + "undefined | minecraft:overworld | number at " + pos(helper, AT));
        helper.succeed();
    }

    @GameTest
    public void entityApi(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = survivalPlayer(helper);
        Mob cow = named(helper.spawnWithNoFreeWill(EntityTypes.COW, AT), "msm-api");
        double x = cow.getX();
        InteractionResult result = interactEntity(helper, player, cow);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        assertLogged(helper, host, "msm_test:entity: entity minecraft:cow 4 | 2 | true | true | false | string | true | minecraft:overworld");
        helper.assertValueEqual(cow.getHealth(), cow.getMaxHealth() - 2, "cow health after damage(4) and heal(2)");
        MobEffectInstance speed = cow.getEffect(MobEffects.SPEED);
        helper.assertTrue(speed != null && speed.getAmplifier() == 1, "speed effect: " + speed);
        helper.assertTrue(Math.abs(cow.getX() - (x + 1)) < 1e-6, "teleported by +1 x: " + x + " -> " + cow.getX());

        Mob doomed = named(helper.spawnWithNoFreeWill(EntityTypes.COW, AT.east()), "msm-kill");
        interactEntity(helper, player, doomed);
        helper.assertFalse(doomed.isAlive(), "kill()");
        assertLogged(helper, host, "msm_test:entity: killed minecraft:cow alive=false");

        if (FabricLoader.getInstance().isModLoaded("geckolib")) {
            // playAnimation on an MSM entity triggers its animation (a cow above did nothing); no error either way.
            @SuppressWarnings("unchecked")
            EntityType<MsmEntity> type = (EntityType<MsmEntity>) BuiltInRegistries.ENTITY_TYPE.getValue(id("kitchen_sink"));
            LivingEntity mob = named(helper.spawnWithNoFreeWill(type, AT.south()), "msm-api");
            interactEntity(helper, player, mob);
            assertLogged(helper, host, "msm_test:entity: entity msm_test:kitchen_sink 4 | 2 | true | true | false | string | true | "
                    + "minecraft:overworld");
        }
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:entity:")),
                "entity.js errors: " + host.handlerErrors());
        helper.succeed();
    }

    @GameTest
    public void playerApi(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.BOOKSHELF);
        ServerPlayer player = survivalPlayer(helper);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STICK));
        player.setShiftKeyDown(true);
        InteractionResult result = use(helper, player, AT);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        helper.assertValueEqual(count(player, Items.APPLE), 3, "apples given");
        assertLogged(helper, host, "msm_test:player: player " + player.getName().getString()
                + " | true | " + player.isCreative() // the mock player reports creative whatever its game mode
                + " | minecraft:stick | true | false | true | true | minecraft:player");
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void scheduleRunsAfterTicks(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.TARGET);
        ServerPlayer player = survivalPlayer(helper);
        InteractionResult result = use(helper, player, AT);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        helper.assertBlockNotPresent(Blocks.GOLD_BLOCK, AT.above());
        helper.runAfterDelay(3, () -> helper.assertBlockNotPresent(Blocks.GOLD_BLOCK, AT.above()));
        helper.runAfterDelay(8, () -> {
            helper.assertBlockPresent(Blocks.GOLD_BLOCK, AT.above());
            assertLogged(helper, host, "msm_test:timers: scheduled after 5 tick(s) at " + pos(helper, AT.above()));
            assertLogged(helper, host, "msm_test:timers: schedule(5) at load ran");
            helper.succeed();
        });
    }

    @GameTest
    public void runScriptActionCallsTheDefinedHandler(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, BuiltInRegistries.BLOCK.getValue(id("scripted")));
        ServerPlayer player = survivalPlayer(helper);
        use(helper, player, AT);
        use(helper, player, AT);
        helper.assertBlockPresent(Blocks.EMERALD_BLOCK, AT.above());
        helper.assertValueEqual(logged(host, "msm_test:actions: action msm_test:scripted msm_test:scripted msm_test:scripted "
                + player.getName().getString() + " entity=undefined at " + pos(helper, AT)), 2L, "action handler calls");
        long undefined = host.handlerErrors().stream()
                .filter("msm_test:scripted: run_script handler msm_test:undefined_handler is not defined"::equals).count();
        helper.assertValueEqual(undefined, 1L, "undefined handler logged once");
        helper.assertTrue(host.actionHandlers().contains(id("scripted_action")), "action handlers: " + host.actionHandlers());
        helper.succeed();
    }

    /** {@code END_DATA_PACK_RELOAD} calls {@link ScriptHost#reload()}: a fresh scope, nothing registered twice. */
    @GameTest
    public void reloadReplacesScopeAndHandlers(GameTestHelper helper) {
        ScriptHost running = host(helper);
        ScriptHost host = ScriptHost.detached(helper.getLevel().getServer());
        helper.assertValueEqual(host.loads(), 1, "loads");
        Object scope = host.scopeIdentity();
        int interact = host.handlerCount("block.interact");
        int schedules = host.pendingSchedules();
        helper.assertValueEqual(interact, running.handlerCount("block.interact"), "block.interact handlers of a fresh host");
        helper.assertTrue(schedules >= 1, "the load-time schedule of timers.js is pending");
        host.reload();
        helper.assertValueEqual(host.loads(), 2, "loads after reload");
        helper.assertTrue(host.scopeIdentity() != scope, "reload kept the old scope");
        helper.assertValueEqual(host.handlerCount("block.interact"), interact, "block.interact handlers after reload");
        helper.assertValueEqual(host.pendingSchedules(), schedules, "pending schedules after reload");
        helper.assertValueEqual(host.summary(), running.summary(), "summary after reload");
        helper.assertValueEqual(logged(host, "msm_test:util: util evaluated"), 2L, "util.js evaluated once per load");
        helper.succeed();
    }

    // ---- script commands (ADR 0058 D2) ----------------------------------------------------------------------

    /**
     * {@code World.runCommand} without {@code at} still runs at the world spawn point with no {@code @s}
     * ({@code MinecraftServer.createCommandSourceStack()}); with {@code at}, {@code ~ ~ ~} is that position, for
     * commands and functions alike.
     */
    @GameTest
    public void worldRunCommandRunsAtTheSpawnPointOrAt(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.AMETHYST_BLOCK);
        Entity spawnMarker = helper.spawn(EntityTypes.MARKER, AT.east());
        spawnMarker.addTag("msm_cmd_spawn");
        Entity atMarker = helper.spawn(EntityTypes.MARKER, AT.west());
        atMarker.addTag("msm_cmd_at");
        ServerPlayer player = survivalPlayer(helper);
        Vec3 spawn = helper.getLevel().getServer().createCommandSourceStack().getPosition();
        InteractionResult result = use(helper, player, AT);
        try {
            helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
            assertLogged(helper, host, "msm_test:commands: world 1 | 1 | 0 | 1 | true | false at " + pos(helper, AT));
            helper.assertValueEqual(spawnMarker.position(), spawn, "marker teleported by runCommand without at");
            BlockPos abs = helper.absolutePos(AT);
            helper.assertValueEqual(atMarker.position(), new Vec3(abs.getX(), abs.getY() + 1, abs.getZ()),
                    "marker teleported by runCommand with at");
            helper.assertBlockPresent(Blocks.EMERALD_BLOCK, AT.above(2));
            helper.assertBlockPresent(Blocks.DIAMOND_BLOCK, AT.above(3));
        } finally {
            spawnMarker.discard();
            atMarker.discard();
        }
        helper.succeed();
    }

    /**
     * {@code Entity.runCommand} runs as and at the entity: {@code @s} is the entity, {@code ~ ~ ~} its position,
     * {@code ^ ^ ^} its facing; it returns the result count ({@code time query gametime} returns the game time).
     * {@code Entity.runFunction} returns true for a function (which tags {@code @s} and places a block at
     * {@code ~ ~3 ~}) and false for an unknown id.
     */
    @GameTest
    public void entityRunCommandRunsAsAndAtTheEntity(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = survivalPlayer(helper);
        Mob cow = named(helper.spawnWithNoFreeWill(EntityTypes.COW, AT), "msm-cmd");
        cow.setYRot(-90); // facing east (+x)
        cow.setXRot(0);
        long time = helper.getLevel().getGameTime();
        InteractionResult result = interactEntity(helper, player, cow);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        assertLogged(helper, host, "msm_test:commands: entity 1 | 1 | 1 | 1 | true | false time " + time);
        helper.assertTrue(cow.entityTags().contains("msm_cmd"), "tag @s from Entity.runCommand: " + cow.entityTags());
        helper.assertTrue(cow.entityTags().contains("msm_ran"), "tag @s from Entity.runFunction: " + cow.entityTags());
        helper.assertBlockPresent(Blocks.GOLD_BLOCK, AT.above(2));
        helper.assertBlockPresent(Blocks.DIAMOND_BLOCK, AT.above(3));
        helper.assertBlockPresent(Blocks.LAPIS_BLOCK, AT.east(2));
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:commands:")),
                "commands.js errors: " + host.handlerErrors());
        helper.succeed();
    }

    // ---- cancel resync (ADR 0058 D3) -------------------------------------------------------------------------

    /** A connection that records every packet sent to its player (the mock player's embedded channel otherwise). */
    private static final class RecordingConnection extends Connection {
        final List<Packet<?>> sent = new ArrayList<>();

        RecordingConnection() {
            super(PacketFlow.SERVERBOUND);
        }

        @Override
        public void send(Packet<?> packet, ChannelFutureListener listener, boolean flush) {
            sent.add(packet);
            super.send(packet, listener, flush);
        }

        /** The resync packets of ADR 0058 D3 sent since the last {@code clear()}, as text. */
        List<String> resync() {
            List<String> out = new ArrayList<>();
            for (Packet<?> p : sent) {
                switch (p) {
                    case ClientboundContainerSetContentPacket c -> out.add("inventory " + c.containerId());
                    case ClientboundBlockUpdatePacket b -> out.add("block " + b.getPos().toShortString());
                    case ClientboundCooldownPacket c -> out.add("cooldown " + c.cooldownGroup() + " " + c.duration());
                    case ClientboundBlockEntityDataPacket b -> out.add("block entity " + b.getPos().toShortString());
                    default -> { }
                }
            }
            return out;
        }
    }

    private record Recorded(ServerPlayer player, RecordingConnection connection) {}

    /**
     * A survival player placed as {@code GameTestHelper.makeMockServerPlayerInLevel} does (a {@code Connection} on an
     * {@code EmbeddedChannel}, {@code PlayerList.placeNewPlayer}), with a recording connection.
     */
    private static Recorded recordingPlayer(GameTestHelper helper) {
        return recordingPlayer(helper, "msm-resync");
    }

    /** As {@link #recordingPlayer(GameTestHelper)} with a player name. */
    private static Recorded recordingPlayer(GameTestHelper helper, String name) {
        ServerLevel level = helper.getLevel();
        CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), name), false);
        ServerPlayer player = new ServerPlayer(level.getServer(), level, cookie.gameProfile(), cookie.clientInformation());
        RecordingConnection connection = new RecordingConnection();
        new EmbeddedChannel(connection);
        level.getServer().getPlayerList().placeNewPlayer(connection, player, cookie);
        player.setGameMode(GameType.SURVIVAL);
        connection.sent.clear();
        return new Recorded(player, connection);
    }

    private static List<String> neighbours(GameTestHelper helper, BlockPos placement) {
        List<String> out = new ArrayList<>();
        for (Direction d : Direction.values()) {
            out.add("block " + helper.absolutePos(placement).relative(d).toShortString());
        }
        return out;
    }

    /** A cancelled {@code block.interact} sends the inventory and the six neighbours of the placement position. */
    @GameTest
    public void cancelledBlockInteractResyncsInventoryAndNeighbours(GameTestHelper helper) {
        helper.setBlock(AT, BuiltInRegistries.BLOCK.getValue(id("kitchen_sink")));
        helper.setBlock(AT.east(2), Blocks.STONE);
        Recorded r = recordingPlayer(helper);
        r.player().setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.OAK_DOOR, 5));
        InteractionResult result = use(helper, r.player(), AT);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        List<String> expected = new ArrayList<>(List.of("inventory 0"));
        expected.addAll(neighbours(helper, AT.above()));
        helper.assertValueEqual(r.connection().resync(), expected, "resync after a cancelled block.interact");
        r.connection().sent.clear();
        InteractionResult control = use(helper, r.player(), AT.east(2)); // events.js logs it, nothing cancels
        helper.assertFalse(control instanceof InteractionResult.Fail, "control was refused: " + control);
        helper.assertValueEqual(r.connection().resync(), List.of(), "resync after an uncancelled block.interact");
        helper.succeed();
    }

    /**
     * A cancelled {@code item.use} sends the inventory and ends the cooldown the client may have predicted
     * ({@code ClientboundCooldownPacket} with duration 0, which the client handles as {@code removeCooldown}).
     */
    @GameTest(maxTicks = 20)
    public void cancelledItemUseResyncsInventoryAndCooldown(GameTestHelper helper) {
        Recorded r = recordingPlayer(helper);
        r.player().setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.ENDER_PEARL, 16));
        InteractionResult result = useItem(helper, r.player(), InteractionHand.MAIN_HAND);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        String group = r.player().getCooldowns().getCooldownGroup(r.player().getMainHandItem()).toString();
        helper.assertValueEqual(r.connection().resync(), List.of("inventory 0", "cooldown " + group + " 0"),
                "resync after a cancelled item.use");
        // The next tick is a new click (the cancelled use refuses further item uses in this one).
        helper.runAfterDelay(1, () -> {
            r.connection().sent.clear();
            r.player().setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STICK));
            InteractionResult control = useItem(helper, r.player(), InteractionHand.MAIN_HAND);
            helper.assertFalse(control instanceof InteractionResult.Fail, "control was refused: " + control);
            helper.assertValueEqual(r.connection().resync(), List.of(), "resync after an uncancelled item.use");
            helper.succeed();
        });
    }

    @GameTest
    public void cancelledEntityInteractResyncsInventory(GameTestHelper helper) {
        Recorded r = recordingPlayer(helper);
        Mob cancelled = named(helper.spawnWithNoFreeWill(EntityTypes.COW, AT), "msm-interact");
        Mob other = named(helper.spawnWithNoFreeWill(EntityTypes.COW, AT.east(2)), "msm-resync-control");
        InteractionResult result = interactEntity(helper, r.player(), cancelled);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        helper.assertValueEqual(r.connection().resync(), List.of("inventory 0"), "resync after a cancelled entity.interact");
        r.connection().sent.clear();
        InteractionResult control = interactEntity(helper, r.player(), other);
        helper.assertFalse(control instanceof InteractionResult.Fail, "control was refused: " + control);
        helper.assertValueEqual(r.connection().resync(), List.of(), "resync after an uncancelled entity.interact");
        helper.succeed();
    }

    /**
     * The block itself is resent by vanilla's {@code destroyAndAck} and, with its 3 by 3 by 3 neighbourhood, by Fabric
     * API's own {@code PlayerBlockBreakEvents.CANCELED} listener ({@code InteractionEventsRouter}); the bridge adds the
     * inventory, and for a block with a block entity the block and its block entity data, in that order (neither vanilla
     * nor Fabric sends the data, so the client would keep the empty block entity it creates for the restored block).
     */
    @GameTest
    public void cancelledBlockBreakResyncsInventoryAndBlockEntity(GameTestHelper helper) {
        helper.setBlock(AT, Blocks.GLOWSTONE);
        helper.setBlock(AT.east(2), Blocks.STONE);
        helper.setBlock(AT.south(2), Blocks.OAK_SIGN);
        Recorded r = recordingPlayer(helper);
        helper.assertFalse(r.player().gameMode.destroyBlock(helper.absolutePos(AT)), "glowstone was broken");
        List<String> expected = new ArrayList<>(List.of("inventory 0"));
        expected.addAll(cube(helper, AT));
        helper.assertValueEqual(r.connection().resync(), expected, "resync after a cancelled block.break");
        r.connection().sent.clear();
        helper.assertFalse(r.player().gameMode.destroyBlock(helper.absolutePos(AT.south(2))), "the sign was broken");
        helper.assertBlockPresent(Blocks.OAK_SIGN, AT.south(2));
        String sign = helper.absolutePos(AT.south(2)).toShortString();
        expected = new ArrayList<>(List.of("inventory 0", "block " + sign, "block entity " + sign));
        expected.addAll(cube(helper, AT.south(2)));
        helper.assertValueEqual(r.connection().resync(), expected, "resync after a cancelled block.break of a sign");
        r.connection().sent.clear();
        helper.assertTrue(r.player().gameMode.destroyBlock(helper.absolutePos(AT.east(2))), "control: stone was not broken");
        helper.assertValueEqual(r.connection().resync(), List.of(), "resync after an uncancelled block.break");
        helper.succeed();
    }

    /** Fabric API's block updates after a cancelled break: the 3 by 3 by 3 cube around the block, x then y then z. */
    private static List<String> cube(GameTestHelper helper, BlockPos rel) {
        List<String> out = new ArrayList<>();
        BlockPos corner = helper.absolutePos(rel).offset(-1, -1, -1);
        for (int x = 0; x < 3; x++) {
            for (int y = 0; y < 3; y++) {
                for (int z = 0; z < 3; z++) {
                    out.add("block " + corner.offset(x, y, z).toShortString());
                }
            }
        }
        return out;
    }

    /**
     * The off-hand attempt and item use the client still sends after a cancelled main-hand click are refused; each
     * refusal resyncs again, so the last packet the client gets follows its last prediction.
     */
    @GameTest
    public void refusedFollowUpsResyncToo(GameTestHelper helper) {
        helper.setBlock(AT, BuiltInRegistries.BLOCK.getValue(id("kitchen_sink")));
        Recorded r = recordingPlayer(helper);
        r.player().setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SNOWBALL, 4));
        use(helper, r.player(), AT, InteractionHand.MAIN_HAND);
        r.connection().sent.clear();
        InteractionResult off = use(helper, r.player(), AT, InteractionHand.OFF_HAND);
        helper.assertTrue(off instanceof InteractionResult.Fail, "off hand not refused: " + off);
        List<String> expected = new ArrayList<>(List.of("inventory 0"));
        expected.addAll(neighbours(helper, AT.above()));
        helper.assertValueEqual(r.connection().resync(), expected, "resync after the refused off-hand attempt");
        r.connection().sent.clear();
        InteractionResult item = useItem(helper, r.player(), InteractionHand.MAIN_HAND);
        helper.assertTrue(item instanceof InteractionResult.Fail, "item use not refused: " + item);
        helper.assertValueEqual(r.connection().resync(), List.of("inventory 0", "cooldown minecraft:snowball 0"),
                "resync after the refused item use");
        helper.succeed();
    }

    // ---- saved script data (ADR 0062) ------------------------------------------------------------------------

    private static final String DATA = "msm_test:data: ";
    private static final String MOB_JSON = "{\"count\":1,\"tags\":[\"a\",\"b\"],\"nested\":{\"ok\":true,\"none\":null},"
            + "\"ratio\":0.5,\"text\":\"é<>\"}";

    /** Calls a {@code run_script} handler of the running host as the action of {@code msm_test:data}. */
    private static void act(ScriptHost host, String handler, EventContext ctx) {
        host.action(id("data"), id("data"), Identifier.parse(handler), ctx);
    }

    private static ScriptData storage(GameTestHelper helper) {
        return ScriptDataAttachment.get(ScriptDataAttachment.world(helper.getLevel().getServer()));
    }

    private static void assertNoDataErrors(GameTestHelper helper, ScriptHost host) {
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.contains(":data:") || e.contains("data_")),
                "data.js errors: " + host.handlerErrors());
    }

    /** A mob, a player and {@code msm.storage}: set from a script, kept as JSON text per namespace, read back. */
    @GameTest
    public void dataOnMobPlayerAndStorage(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = survivalPlayer(helper);
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
        EventContext ctx = EventContext.forEntity(helper.getLevel(), cow, player);
        act(host, "msm_test:data_write", ctx);
        assertLogged(helper, host, DATA + "write [[\"mob\"],[\"visits\"],true]");
        helper.assertValueEqual(ScriptDataAttachment.get(cow).texts(), Map.of("msm_test", "{\"mob\":" + MOB_JSON + "}"), "cow data");
        helper.assertValueEqual(ScriptDataAttachment.get(player).texts(), Map.of("msm_test", "{\"visits\":1}"), "player data");
        helper.assertValueEqual(String.valueOf(storage(helper).get("msm_test", "written")), "{\"by\":\"data_write\"}", "msm.storage");
        act(host, "msm_test:data_read", ctx);
        assertLogged(helper, host, DATA + "read [" + MOB_JSON + ",1,{\"by\":\"data_write\"}]");
        assertNoDataErrors(helper, host);
        helper.succeed();
    }

    /** Copies in and out, JSON values only, the key and size limits leave the old value (ADR 0062 D1, D4). */
    @GameTest
    public void dataValuesAreCopiedAndChecked(GameTestHelper helper) {
        ScriptHost host = host(helper);
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
        act(host, "msm_test:data_values", EventContext.forEntity(helper.getLevel(), cow, null));
        String key64 = "k".repeat(64);
        assertLogged(helper, host, DATA + "values {\"list\":[1,2,{\"x\":\"y\"}],\"n\":null,\"f\":1.5} true true true false true true "
                + "fn:TypeError nan:TypeError inf:TypeError undef:TypeError nestedUndef:TypeError date:TypeError host:TypeError "
                + "cycle:TypeError key64:ok key65:RangeError get65:RangeError false over:RangeError small true false "
                + "[\"v\",\"nul\",\"" + key64 + "\"]");
        helper.assertValueEqual(ScriptDataAttachment.get(cow).keys("msm_test"), List.of("v", "nul", key64), "stored keys");
        assertNoDataErrors(helper, host);
        helper.succeed();
    }

    /** {@code msm.storage} over 1 MiB is a {@code RangeError} and keeps the old value. */
    @GameTest
    public void storageOverItsLimitKeepsTheOldValue(GameTestHelper helper) {
        ScriptHost host = host(helper);
        act(host, "msm_test:data_storage_limit", EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), null));
        String prefix = DATA + "storage limit RangeError: msm.storage of namespace msm_test would hold ";
        helper.assertTrue(host.recentLogs().stream().anyMatch(l -> l.startsWith(prefix)
                && l.endsWith(" bytes, over its limit of 1048576; the old value stays | small")), "not logged: " + prefix + "; recent: " + tail(host));
        helper.assertValueEqual(String.valueOf(storage(helper).get("msm_test", "huge")), "\"small\"", "stored value");
        assertNoDataErrors(helper, host);
        helper.succeed();
    }

    /** Two namespaces writing the same keys on one mob and in {@code msm.storage} do not see each other (ADR 0062 D2). */
    @GameTest
    public void namespacesDoNotSeeEachOther(GameTestHelper helper) {
        ScriptHost host = host(helper);
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
        EventContext ctx = EventContext.forEntity(helper.getLevel(), cow, null);
        act(host, "msm_test:data_ns", ctx);
        act(host, "msm_test_b:data_ns", ctx);
        act(host, "msm_test:data_ns", ctx);
        helper.assertValueEqual(logged(host, DATA + "ns [\"test\",\"test\",[\"shared\"]]") >= 2, true, "msm_test sees its own data");
        assertLogged(helper, host, "msm_test_b:data: ns [\"b\",\"b\",[\"shared\"]]");
        helper.assertValueEqual(ScriptDataAttachment.get(cow).texts(),
                Map.of("msm_test", "{\"shared\":\"test\"}", "msm_test_b", "{\"shared\":\"b\"}"), "cow data per namespace");
        helper.assertValueEqual(String.valueOf(storage(helper).get("msm_test_b", "shared_ns")), "\"b\"", "msm_test_b storage");
        assertNoDataErrors(helper, host);
        helper.succeed();
    }

    /** A mob saved with {@code saveWithoutId} and loaded into a new entity keeps its data (chunk save and load). */
    @GameTest
    public void mobDataSurviveSaveAndLoad(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerLevel level = helper.getLevel();
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
        act(host, "msm_test:data_write", EventContext.forEntity(level, cow, survivalPlayer(helper)));
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        cow.saveWithoutId(out);
        CompoundTag tag = out.buildResult();
        helper.assertTrue(tag.toString().contains("msm_runtime:script_data"), "saved tag has the attachment: " + tag);
        Mob copy = EntityTypes.COW.create(level, EntitySpawnReason.LOAD);
        helper.assertTrue(copy != null, "no cow");
        helper.assertFalse(ScriptDataAttachment.get(copy).texts().containsKey("msm_test"), "a new cow has no data");
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
        helper.assertValueEqual(ScriptDataAttachment.get(copy).texts(), Map.of("msm_test", "{\"mob\":" + MOB_JSON + "}"), "loaded data");
        helper.succeed();
    }

    /** {@code copyOnDeath}: the player made by a respawn after death keeps the data (Fabric copies on AFTER_RESPAWN). */
    @GameTest
    public void playerDataSurviveRespawn(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerLevel level = helper.getLevel();
        ServerPlayer player = survivalPlayer(helper);
        act(host, "msm_test:data_write", EventContext.forEntity(level, helper.spawnWithNoFreeWill(EntityTypes.COW, AT), player));
        ServerPlayer respawned = level.getServer().getPlayerList().respawn(player, false, Entity.RemovalReason.KILLED);
        helper.assertTrue(respawned != player, "respawn made a new player");
        helper.assertValueEqual(ScriptDataAttachment.get(respawned).texts(), Map.of("msm_test", "{\"visits\":1}"), "respawned player data");
        act(host, "msm_test:data_read", EventContext.forItem(level, respawned));
        assertLogged(helper, host, DATA + "read [null,1,{\"by\":\"data_write\"}]");
        helper.succeed();
    }

    /** A mob moved to another dimension is a new entity; Fabric copies its attachments (ADR 0062 D5). */
    @GameTest
    public void mobDataSurviveDimensionChange(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerLevel level = helper.getLevel();
        ServerLevel nether = level.getServer().getLevel(Level.NETHER);
        helper.assertTrue(nether != null, "no nether");
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
        act(host, "msm_test:data_write", EventContext.forEntity(level, cow, survivalPlayer(helper)));
        Entity moved = cow.teleport(new TeleportTransition(nether, new Vec3(0.5, 80, 0.5), Vec3.ZERO, 0f, 0f, TeleportTransition.DO_NOTHING));
        helper.assertTrue(moved != null && moved != cow && moved.level() == nether, "the cow moved to the nether: " + moved);
        helper.assertValueEqual(ScriptDataAttachment.get(moved).texts(), Map.of("msm_test", "{\"mob\":" + MOB_JSON + "}"), "data in the nether");
        moved.discard();
        helper.succeed();
    }

    /** Data survive {@code END_DATA_PACK_RELOAD} (on a detached host) while its schedules are dropped (ADR 0062 D5). */
    @GameTest
    public void dataSurviveReloadWhileSchedulesDoNot(GameTestHelper helper) {
        ScriptHost host = ScriptHost.detached(helper.getLevel().getServer());
        EventContext ctx = EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), null);
        int schedules = host.pendingSchedules();
        host.action(id("data"), id("data"), id("data_reload"), ctx);
        double count = storage(helper).get("msm_test", "reload_count").getAsDouble();
        helper.assertValueEqual(host.pendingSchedules(), schedules + 1, "the handler's schedule is pending");
        host.reload();
        helper.assertValueEqual(host.pendingSchedules(), schedules, "schedules after reload");
        helper.assertValueEqual(storage(helper).get("msm_test", "reload_count").getAsDouble(), count, "msm.storage after reload");
        host.action(id("data"), id("data"), id("data_reload"), ctx);
        helper.assertValueEqual(storage(helper).get("msm_test", "reload_count").getAsDouble(), count + 1, "counted on after reload");
        helper.assertValueEqual(logged(host, DATA + "reload count " + (long) (count + 1)), 1L, "read back after reload");
        helper.succeed();
    }

    // ---- script API 1.1 (ADR 0065) ----------------------------------------------------------------------------

    private static final String API = "msm_test:api: ";
    private static final String PLAYER_EVENTS = "msm_test:player_events: ";

    /** Calls a {@code run_script} handler of {@code api.js} on the running host. */
    private static void api(ScriptHost host, String handler, EventContext ctx) {
        host.action(id("api"), id("api"), id(handler), ctx);
    }

    private static void assertNoApiErrors(GameTestHelper helper, ScriptHost host) {
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:api:")
                        || e.startsWith("script msm_test:player_events:")),
                "api.js or player_events.js errors: " + host.handlerErrors());
    }

    /** Every packet the recording connection saw that the script API 1.1 sends or causes, as text. */
    private static List<String> apiPackets(RecordingConnection connection) {
        List<String> out = new ArrayList<>();
        for (Packet<?> p : connection.sent) {
            switch (p) {
                case ClientboundSetTitlesAnimationPacket t -> out.add("times " + t.getFadeIn() + " " + t.getStay() + " " + t.getFadeOut());
                case ClientboundSetSubtitleTextPacket t -> out.add("subtitle " + t.text().getString());
                case ClientboundSetTitleTextPacket t -> out.add("title " + t.text().getString());
                case ClientboundSetActionBarTextPacket t -> out.add("actionbar " + t.text().getString());
                case ClientboundClearTitlesPacket t -> out.add("clear " + t.shouldResetTimes());
                case ClientboundSetExperiencePacket x -> out.add("xp level " + x.getExperienceLevel() + " total " + x.getTotalExperience());
                case ClientboundSetHealthPacket h -> out.add("food " + h.getFood() + " saturation " + h.getSaturation());
                case ClientboundGameEventPacket g when g.getEvent() == ClientboundGameEventPacket.CHANGE_GAME_MODE ->
                        out.add("game mode " + (int) g.getParam());
                case ClientboundBossEventPacket b -> b.dispatch(new ClientboundBossEventPacket.Handler() {
                    @Override
                    public void add(UUID id, Component name, float progress, BossEvent.BossBarColor color,
                            BossEvent.BossBarOverlay overlay, boolean darken, boolean music, boolean fog) {
                        out.add("boss add " + name.getString() + " " + progress + " " + color.getName() + " " + overlay.getName());
                    }

                    @Override
                    public void remove(UUID id) {
                        out.add("boss remove");
                    }

                    @Override
                    public void updateProgress(UUID id, float progress) {
                        out.add("boss progress " + progress);
                    }

                    @Override
                    public void updateName(UUID id, Component name) {
                        out.add("boss name " + name.getString());
                    }

                    @Override
                    public void updateStyle(UUID id, BossEvent.BossBarColor color, BossEvent.BossBarOverlay overlay) {
                        out.add("boss style " + color.getName() + " " + overlay.getName());
                    }
                });
                case ClientboundPlayerChatPacket c -> out.add("chat");
                case ClientboundDisguisedChatPacket c -> out.add("chat " + c.message().getString());
                case ClientboundSystemChatPacket c when !c.overlay() -> out.add("system " + c.content().getString());
                default -> { }
            }
        }
        return out;
    }

    /** Inventory get, set, count, remove and find over numbered and named slots, and mob and player equipment (D2). */
    @GameTest
    public void inventoryAndEquipment(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = survivalPlayer(helper);
        player.getInventory().setSelectedSlot(0);
        Mob zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, AT);
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            zombie.setItemSlot(slot, ItemStack.EMPTY);
        }
        api(host, "api_inventory", EventContext.forEntity(helper.getLevel(), zombie, player));
        assertLogged(helper, host, API + "inventory 36 0 minecraft:diamond 10 minecraft:emerald minecraft:iron_helmet "
                + "minecraft:shield minecraft:diamond true minecraft:diamond 12 35 0 -1 5 7 6 7 0 true true 0 true true 64 "
                + "36:RangeError neg:RangeError frac:RangeError body:RangeError unknownItem:TypeError minecraft:iron_sword "
                + "minecraft:golden_helmet true true minecraft:iron_helmet minecraft:shield mobSlot:RangeError");
        helper.assertTrue(player.getInventory().getItem(1).is(Items.STICK) && player.getInventory().getItem(1).getCount() == 64,
                "slot 1: " + player.getInventory().getItem(1));
        helper.assertTrue(player.getItemBySlot(EquipmentSlot.HEAD).is(Items.IRON_HELMET), "player head");
        helper.assertTrue(player.getItemBySlot(EquipmentSlot.OFFHAND).is(Items.SHIELD), "player off hand");
        helper.assertValueEqual(count(player, Items.DIAMOND), 0, "diamonds left");
        helper.assertTrue(zombie.getItemBySlot(EquipmentSlot.MAINHAND).is(Items.IRON_SWORD), "zombie main hand");
        helper.assertTrue(zombie.getItemBySlot(EquipmentSlot.HEAD).isEmpty(), "zombie head emptied");
        assertNoApiErrors(helper, host);
        helper.succeed();
    }

    /**
     * {@code ItemRef} reads, {@code getComponent} for a default and a patched component, {@code setComponent} writes
     * and removes, invalid values and the 64 KiB limit are errors that change nothing, {@code give} with an
     * {@code ItemSpec} (D1, D2, D9).
     */
    @GameTest
    public void itemComponents(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = survivalPlayer(helper);
        ItemStack huge = new ItemStack(Items.STICK);
        huge.set(DataComponents.CUSTOM_NAME, Component.literal("n".repeat(70_000)));
        player.getInventory().setItem(2, huge);
        api(host, "api_items", EventContext.forItem(helper.getLevel(), player));
        assertLogged(helper, host, API + "items Edge 1 5 1561 true true false 1561 \"Edge\" 5 true Renamed "
                + "{\"level\":3,\"tags\":[\"a\"]} Diamond Sword false badValue:TypeError invalidStack:TypeError "
                + "unknownComponent:TypeError notJson:TypeError setOver64k:RangeError specOver64k:RangeError "
                + "getOver64k:RangeError badSpec:TypeError noId:TypeError 5 1 true 70 4");
        ItemStack sword = player.getInventory().getItem(0);
        helper.assertTrue(sword.is(Items.DIAMOND_SWORD) && sword.getDamageValue() == 5 && sword.get(DataComponents.CUSTOM_NAME) == null
                && sword.get(DataComponents.CUSTOM_DATA) != null, "sword: " + sword.getComponentsPatch());
        helper.assertValueEqual(count(player, Items.STONE), 0, "no stone given by a failed give");
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack apple = player.getInventory().getItem(i);
            if (apple.is(Items.APPLE)) {
                helper.assertValueEqual(apple.getHoverName().getString(), "Gold", "given apple name in slot " + i);
                helper.assertTrue(apple.getCount() <= 64, "given apple stack " + apple.getCount());
            }
        }
        assertNoApiErrors(helper, host);
        helper.succeed();
    }

    /** XP, food and game mode writes change the server state, and the client is told (D3). */
    @GameTest
    public void playerStateReachesTheClient(GameTestHelper helper) {
        ScriptHost host = host(helper);
        Recorded r = recordingPlayer(helper, "msm-api-state");
        ServerPlayer player = r.player();
        player.doTick();
        r.connection().sent.clear();
        api(host, "api_state", EventContext.forItem(helper.getLevel(), player));
        assertLogged(helper, host, API + "state 5 7 10 0 5 5 20 5 17 3 survival true false adventure mode:TypeError");
        helper.assertValueEqual(player.experienceLevel, 7, "server xp level");
        helper.assertValueEqual(player.totalExperience, 10, "server total xp");
        helper.assertValueEqual(player.getFoodData().getFoodLevel(), 17, "server food");
        helper.assertValueEqual(player.getFoodData().getSaturationLevel(), 3f, "server saturation");
        helper.assertValueEqual(player.gameMode(), GameType.ADVENTURE, "server game mode");
        helper.assertValueEqual(apiPackets(r.connection()), List.of("game mode " + GameType.ADVENTURE.getId()), "sent at once");
        r.connection().sent.clear();
        player.doTick(); // mock players are not ticked by the server; vanilla sends XP and food from doTick
        List<String> sent = apiPackets(r.connection());
        helper.assertTrue(sent.contains("xp level 7 total 10") && sent.contains("food 17 saturation 3.0"),
                "sent on the next tick: " + sent);
        assertNoApiErrors(helper, host);
        helper.succeed();
    }

    /** Title, subtitle, times, action bar and clear packets with the default times 10, 70 and 20 (D4). */
    @GameTest
    public void titlesAndActionBar(GameTestHelper helper) {
        ScriptHost host = host(helper);
        Recorded r = recordingPlayer(helper, "msm-api-titles");
        api(host, "api_titles", EventContext.forItem(helper.getLevel(), r.player()));
        helper.assertValueEqual(apiPackets(r.connection()), List.of("times 10 40 20", "subtitle Get ready", "title Wave 3",
                "times 10 70 20", "subtitle ", "title Plain", "actionbar Mana: 7", "clear false"), "title packets");
        assertNoApiErrors(helper, host);
        helper.succeed();
    }

    /** Boss bar create, progress, name, style, add and remove player packets, errors, and 32 bars per namespace (D4). */
    @GameTest
    public void bossBars(GameTestHelper helper) {
        ScriptHost host = host(helper);
        Recorded r = recordingPlayer(helper, "msm-api-bar");
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
        api(host, "api_bossbar", EventContext.forEntity(helper.getLevel(), cow, r.player()));
        assertLogged(helper, host, API + "bossbar 1 true true true 0 colour:TypeError style:TypeError noTitle:TypeError "
                + "badId:TypeError notPlayer:TypeError 33rd:RangeError replace:ok true 0");
        helper.assertValueEqual(apiPackets(r.connection()), List.of("boss add Time left 0.5 red notched_10", "boss progress 0.25",
                "boss progress 1.0", "boss name Hurry", "boss style green notched_10", "boss style green progress", "boss remove",
                "boss add Hurry 1.0 green progress", "boss remove"), "boss bar packets");
        helper.assertValueEqual(host.bossBarCount("msm_test"), 0, "bars left");
        assertNoApiErrors(helper, host);
        helper.succeed();
    }

    /** A reload removes the bars, which hides them from their players (D4). */
    @GameTest
    public void bossBarsAreRemovedOnReload(GameTestHelper helper) {
        ScriptHost host = ScriptHost.detached(helper.getLevel().getServer());
        Recorded r = recordingPlayer(helper, "msm-api-bar-reload");
        host.action(id("api"), id("api"), id("api_bossbar_reload"), EventContext.forItem(helper.getLevel(), r.player()));
        helper.assertValueEqual(host.bossBarCount("msm_test"), 1, "bars before reload");
        helper.assertValueEqual(apiPackets(r.connection()), List.of("boss add Until reload 1.0 white progress"), "shown");
        r.connection().sent.clear();
        host.reload();
        helper.assertValueEqual(host.bossBarCount("msm_test"), 0, "bars after reload");
        helper.assertValueEqual(apiPackets(r.connection()), List.of("boss remove"), "hidden by the reload");
        helper.succeed();
    }

    private static int dropped(GameTestHelper helper, Entity around, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, around.getBoundingBox().inflate(3), e -> e.getItem().is(item))
                .stream().mapToInt(e -> e.getItem().getCount()).sum();
    }

    /**
     * {@code damage} with a player attacker gives kill credit (the breeze's {@code killed_by_player} pool drops its
     * rods); without options it stays generic and gives none; a project damage type applies; an unknown type is an
     * error (D5).
     */
    @GameTest
    public void typedDamageWithAnAttacker(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerLevel level = helper.getLevel();
        ServerPlayer player = survivalPlayer(helper);
        Mob credited = helper.spawnWithNoFreeWill(EntityTypes.BREEZE, AT);
        Mob plain = helper.spawnWithNoFreeWill(EntityTypes.BREEZE, AT.east(5));
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, AT.south(5));
        api(host, "api_damage_by_player", EventContext.forEntity(level, credited, player));
        helper.assertFalse(credited.isAlive(), "breeze killed by the script");
        helper.assertTrue(credited.getLastHurtByPlayer() == player, "kill credit: " + credited.getLastHurtByPlayer());
        helper.assertTrue(dropped(helper, credited, Items.BREEZE_ROD) >= 1, "killed_by_player pool dropped no breeze rod");
        api(host, "api_damage_plain", EventContext.forEntity(level, plain, player));
        helper.assertFalse(plain.isAlive(), "breeze killed by plain damage");
        helper.assertTrue(plain.getLastDamageSource() != null && plain.getLastDamageSource().is(DamageTypes.GENERIC),
                "plain damage type: " + plain.getLastDamageSource());
        helper.assertValueEqual(dropped(helper, plain, Items.BREEZE_ROD), 0, "rods without kill credit");
        api(host, "api_damage_typed", EventContext.forEntity(level, pig, null));
        assertLogged(helper, host, API + "damage 7 unknownType:TypeError badAttacker:TypeError");
        helper.assertTrue(pig.getLastDamageSource() != null && "msm_test:script_zap".equals(
                pig.getLastDamageSource().typeHolder().unwrapKey().map(k -> k.identifier().toString()).orElse("")),
                "project damage type: " + pig.getLastDamageSource());
        helper.assertValueEqual(pig.getHealth(), pig.getMaxHealth() - 3, "pig health");
        assertNoApiErrors(helper, host);
        helper.succeed();
    }

    /** Raycasts hit a block face, an entity, nothing; {@code ignore}, {@code entities: false}, the 128 limit (D6). */
    @GameTest
    public void raycasts(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT.east(3), Blocks.STONE);
        helper.setBlock(AT.east(3).above(), Blocks.STONE);
        helper.setBlock(AT.south(6), Blocks.STONE);
        helper.spawnWithNoFreeWill(EntityTypes.PIG, AT.south(3));
        ServerPlayer player = survivalPlayer(helper);
        Vec3 stand = Vec3.atBottomCenterOf(helper.absolutePos(AT.west()));
        player.snapTo(stand.x, stand.y, stand.z, -90f, 0f);
        player.setYHeadRot(-90f);
        api(host, "api_raycast", EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), player));
        assertLogged(helper, host, API + "raycast block minecraft:stone west 2.5 3 true true entity minecraft:pig true true true "
                + "block minecraft:stone north block 5.5 true 129:RangeError 128:ok negative:RangeError zero:TypeError "
                + "block minecraft:stone west eye129:RangeError");
        assertNoApiErrors(helper, host);
        helper.succeed();
    }

    /**
     * Teleport to another dimension for a mob and a player; the mob's wrapper follows the re-created mob; an unknown
     * dimension is an error; {@code msm.getWorld} and {@code msm.players} (D7).
     */
    @GameTest
    public void teleportAcrossDimensions(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerLevel level = helper.getLevel();
        Recorded r = recordingPlayer(helper, "msm-api-teleport");
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
        api(host, "api_teleport", EventContext.forEntity(level, cow, r.player()));
        assertLogged(helper, host, API + "teleport minecraft:the_nether true 120 minecraft:cow minecraft:the_nether 1.5 "
                + "minecraft:the_end 100 unknownDimension:TypeError badDimension:TypeError minecraft:the_nether true true true true");
        helper.assertTrue(cow.isRemoved() && cow.getRemovalReason() == Entity.RemovalReason.CHANGED_DIMENSION,
                "the cow was re-created in the nether: " + cow.getRemovalReason());
        helper.assertValueEqual(r.player().level().dimension(), Level.END, "player dimension");
        helper.assertValueEqual(r.player().getYRot(), 90f, "player yaw");
        assertNoApiErrors(helper, host);
        level.getServer().getPlayerList().remove(r.player());
        helper.succeed();
    }

    // ---- script API 1.1 events (ADR 0065 D8) ---------------------------------------------------------------------

    private static List<Long> playerTicks(ScriptHost host, String series, String name, long since) {
        Pattern line = Pattern.compile(Pattern.quote(PLAYER_EVENTS + "player.tick/" + series + " " + name + " at ") + "(\\d+)");
        List<Long> out = new ArrayList<>();
        for (String log : host.recentLogs()) {
            Matcher m = line.matcher(log);
            if (m.matches() && Long.parseLong(m.group(1)) >= since) {
                out.add(Long.parseLong(m.group(1)));
            }
        }
        return out;
    }

    private static void assertInterval(GameTestHelper helper, List<Long> ticks, ServerPlayer player, int interval, int atLeast) {
        helper.assertTrue(ticks.size() >= atLeast, player.getName().getString() + " every " + interval + ": " + ticks);
        for (int i = 0; i < ticks.size(); i++) {
            helper.assertValueEqual(Math.floorMod(ticks.get(i) + player.getId(), (long) interval), 0L,
                    "staggered by entity id " + player.getId() + ": " + ticks);
            if (i > 0) {
                helper.assertValueEqual(ticks.get(i) - ticks.get(i - 1), (long) interval, "interval: " + ticks);
            }
        }
    }

    /** {@code player.tick} at its interval (7), an interval under 5 counted as 5, staggered by entity id (D8). */
    @GameTest(maxTicks = 60)
    public void playerTickRunsAtItsInterval(GameTestHelper helper) {
        ScriptHost host = host(helper);
        long start = helper.getLevel().getServer().getTickCount() + 1;
        ServerPlayer a = recordingPlayer(helper, "msm-ev-tick-a").player();
        ServerPlayer b = recordingPlayer(helper, "msm-ev-tick-b").player();
        helper.runAfterDelay(45, () -> {
            for (ServerPlayer p : List.of(a, b)) {
                String name = p.getName().getString();
                assertInterval(helper, playerTicks(host, "7", name, start), p, 7, 5);
                assertInterval(helper, playerTicks(host, "1", name, start), p, 5, 7);
            }
            if (Math.floorMod(a.getId() - b.getId(), 7) != 0) {
                helper.assertFalse(playerTicks(host, "7", "msm-ev-tick-a", start).getFirst()
                        .equals(playerTicks(host, "7", "msm-ev-tick-b", start).getFirst()), "two players on the same tick");
            }
            assertNoApiErrors(helper, host);
            helper.succeed();
        });
    }

    /** {@code player.respawn} fires once for the new player (D8). */
    @GameTest
    public void playerRespawnFires(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = recordingPlayer(helper, "msm-ev-respawn").player();
        String line = PLAYER_EVENTS + "player.respawn msm-ev-respawn in minecraft:overworld health 20";
        long before = logged(host, line);
        helper.getLevel().getServer().getPlayerList().respawn(player, false, Entity.RemovalReason.KILLED);
        helper.assertValueEqual(logged(host, line) - before, 1L, "player.respawn; recent: " + tail(host));
        helper.succeed();
    }

    /** {@code player.leave} fires once when the player is removed from the player list (D8). */
    @GameTest
    public void playerLeaveFires(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerPlayer player = recordingPlayer(helper, "msm-ev-leave").player();
        String line = PLAYER_EVENTS + "player.leave msm-ev-leave in minecraft:overworld";
        long before = logged(host, line);
        helper.getLevel().getServer().getPlayerList().remove(player);
        helper.assertValueEqual(logged(host, line) - before, 1L, "player.leave; recent: " + tail(host));
        helper.succeed();
    }

    /** {@code player.changeDimension} fires once with {@code from} and {@code to} (D8). */
    @GameTest
    public void playerChangeDimensionFires(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerLevel level = helper.getLevel();
        ServerPlayer player = recordingPlayer(helper, "msm-ev-dim").player();
        ServerLevel nether = level.getServer().getLevel(Level.NETHER);
        helper.assertTrue(nether != null, "no nether");
        String line = PLAYER_EVENTS + "player.changeDimension msm-ev-dim minecraft:overworld -> minecraft:the_nether world "
                + "minecraft:the_nether now minecraft:the_nether";
        long before = logged(host, line);
        player.teleport(new TeleportTransition(nether, new Vec3(0.5, 100, 0.5), Vec3.ZERO, 0f, 0f, TeleportTransition.DO_NOTHING));
        helper.assertValueEqual(logged(host, line) - before, 1L, "player.changeDimension; recent: " + tail(host));
        level.getServer().getPlayerList().remove(player);
        helper.succeed();
    }

    /** {@code player.chat} sees the message; a cancelled message reaches nobody (D8). */
    @GameTest
    public void playerChatCancelStopsTheMessage(GameTestHelper helper) {
        ScriptHost host = host(helper);
        PlayerList players = helper.getLevel().getServer().getPlayerList();
        ServerPlayer sender = recordingPlayer(helper, "msm-ev-chat").player();
        Recorded listener = recordingPlayer(helper, "msm-chat-listener");
        listener.connection().sent.clear();
        players.broadcastChatMessage(PlayerChatMessage.system("hello there"), sender, ChatType.bind(ChatType.CHAT, sender));
        List<String> shown = apiPackets(listener.connection());
        helper.assertTrue(shown.stream().anyMatch(p -> p.startsWith("chat")), "the message reached the listener: " + shown);
        assertLogged(helper, host, PLAYER_EVENTS + "player.chat msm-ev-chat: hello there");
        listener.connection().sent.clear();
        players.broadcastChatMessage(PlayerChatMessage.system("a secret"), sender, ChatType.bind(ChatType.CHAT, sender));
        List<String> hidden = apiPackets(listener.connection());
        helper.assertTrue(hidden.stream().noneMatch(p -> p.startsWith("chat")), "a cancelled message reached the listener: " + hidden);
        assertLogged(helper, host, PLAYER_EVENTS + "player.chat msm-ev-chat: a secret");
        assertNoApiErrors(helper, host);
        helper.succeed();
    }

    /** {@code entity.damaged} carries the amount after armour; {@code entity.hurt} gains {@code source} and {@code direct}. */
    @GameTest
    public void entityDamagedCarriesTheFinalAmount(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerLevel level = helper.getLevel();
        ServerPlayer player = survivalPlayer(helper);
        Mob zombie = named(helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, AT), "msm-ev-damaged");
        zombie.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.DIAMOND_CHESTPLATE));
        float before = zombie.getHealth();
        zombie.hurtServer(level, level.damageSources().playerAttack(player), 10);
        float taken = before - zombie.getHealth();
        helper.assertTrue(taken > 0 && taken < 10, "armour reduced the damage: " + taken);
        Pattern line = Pattern.compile(Pattern.quote(PLAYER_EVENTS + "entity.damaged minecraft:zombie amount ") + "([0-9.]+)"
                + Pattern.quote(" source minecraft:player_attack attacker minecraft:player direct minecraft:player health ")
                + "([0-9.]+)");
        double[] seen = null;
        for (String log : host.recentLogs()) {
            Matcher m = line.matcher(log);
            if (m.matches()) {
                seen = new double[] {Double.parseDouble(m.group(1)), Double.parseDouble(m.group(2))};
            }
        }
        helper.assertTrue(seen != null, "entity.damaged not logged; recent: " + tail(host));
        helper.assertTrue(Math.abs(seen[0] - taken) < 1e-4 && Math.abs(seen[1] - zombie.getHealth()) < 1e-4,
                "final amount " + seen[0] + " and health " + seen[1] + ", expected " + taken + " and " + zombie.getHealth());

        Mob pig = named(helper.spawnWithNoFreeWill(EntityTypes.PIG, AT.east(3)), "msm-ev-hurt");
        Arrow arrow = helper.spawn(EntityTypes.ARROW, AT.east(3).above(2));
        pig.hurtServer(level, level.damageSources().arrow(arrow, player), 1);
        assertLogged(helper, host, PLAYER_EVENTS + "entity.hurt minecraft:pig source minecraft:arrow attacker minecraft:player "
                + "direct minecraft:arrow");
        arrow.discard();
        assertNoApiErrors(helper, host);
        helper.succeed();
    }
}
