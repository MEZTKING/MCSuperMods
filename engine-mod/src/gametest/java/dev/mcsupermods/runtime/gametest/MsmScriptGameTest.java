package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
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
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Runtime v1 scripting GameTests (ADR 0031, ADR 0032) on the hand-written ES5 CommonJS scripts in
 * {@code msm/msm_test/script/} of this test mod: one per game event, the World, Entity and Player API, schedules,
 * relative {@code require}, the {@code run_script} action of {@code msm/msm_test/block/scripted.json}, isolation and
 * the sandbox, errors and the time budget.
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
        helper.assertValueEqual(host.summary(), "[msm_runtime] loaded 17 script(s); 2 error(s)", "load summary");
        helper.assertValueEqual(host.loadErrors(), List.of(
                "script msm_test:broken: syntax error (msm/msm_test/script/broken.js#5)",
                "script msm_test:events: unknown event 'no.such.event' (msm/msm_test/script/events.js)"), "load errors");
        ScriptHost.Report report = host.report();
        helper.assertValueEqual(report.scripts().size(), 17, "scripts found");
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
        ServerLevel level = helper.getLevel();
        CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), "msm-resync"), false);
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
}
