package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Scripting spike (B130, ADR 0031): {@code msm/msm_spike/script/} in this test mod holds {@code glow.js} (hand-written
 * ES5 CommonJS in TypeScript's output shape), {@code broken.js} (syntax error) and {@code loop.js} (endless loop).
 * Interactions go through {@code ServerPlayerGameMode} so the Fabric API events fire; {@code GameTestHelper.useBlock}
 * calls the block directly and bypasses {@code UseBlockCallback}.
 */
public class MsmScriptSpikeGameTest {
    private static final Identifier ORE = Identifier.fromNamespaceAndPath("msm_spike", "glow_ore");
    private static final Identifier SHARD = Identifier.fromNamespaceAndPath("msm_spike", "shard");
    private static final BlockPos AT = new BlockPos(1, 2, 1);

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
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
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

    private static boolean logged(ScriptHost host, String line) {
        return host.recentLogs().contains(line);
    }

    @GameTest
    public void scriptsLoadWithOneError(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.assertValueEqual(host.summary(), "[msm_runtime] loaded 3 script(s); 1 error(s)", "load summary");
        helper.assertValueEqual(host.loadErrors().size(), 1, "load errors");
        String error = host.loadErrors().getFirst();
        helper.assertTrue(error.startsWith("script msm_spike:broken: ") && error.contains("(msm/msm_spike/script/broken.js#5)"),
                "broken.js error: " + error);
        MsmRuntime.LOGGER.info("[msm_runtime] script spike: {}; error: {}", host.summary(), error);
        helper.succeed();
    }

    @GameTest
    public void interactCancelsVanillaUse(GameTestHelper helper) {
        ScriptHost host = host(helper);
        Block ore = BuiltInRegistries.BLOCK.getValue(ORE);
        Item shard = BuiltInRegistries.ITEM.getValue(SHARD);
        helper.setBlock(AT, ore);
        ServerPlayer player = survivalPlayer(helper);
        List<String> events = new ArrayList<>();
        EventListener recorder = new EventListener() {
            @Override
            public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
                events.add(owner + " " + event);
            }
        };
        InteractionResult result;
        EventRunner.setListener(recorder);
        try {
            result = use(helper, player, AT);
        } finally {
            EventRunner.setListener(null);
        }
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        helper.assertBlockPresent(Blocks.GLOWSTONE, AT.above());
        helper.assertValueEqual(count(player, shard), 1, "shards given by the script");
        // Without the FAIL, vanilla's useItemOn would run the block's msm:on_interact (shimmer: 2 shards).
        helper.assertTrue(events.isEmpty(), "the block's own on_interact ran: " + events);
        MsmRuntime.LOGGER.info("[msm_runtime] script spike: block.interact on {} returned {}, placed glowstone, gave 1 x {}; host {}",
                ORE, result, SHARD, host.summary());
        helper.succeed();
    }

    @GameTest
    public void breakingGlowstoneIsCancelled(GameTestHelper helper) {
        host(helper);
        BlockPos stone = AT.east();
        helper.setBlock(AT, Blocks.GLOWSTONE);
        helper.setBlock(stone, Blocks.STONE);
        ServerPlayer player = survivalPlayer(helper);
        boolean glowstoneBroken = player.gameMode.destroyBlock(helper.absolutePos(AT));
        boolean stoneBroken = player.gameMode.destroyBlock(helper.absolutePos(stone));
        helper.assertTrue(!glowstoneBroken, "destroyBlock on glowstone returned true");
        helper.assertBlockPresent(Blocks.GLOWSTONE, AT);
        helper.assertTrue(stoneBroken, "control: stone was not broken");
        helper.assertBlockPresent(Blocks.AIR, stone);
        MsmRuntime.LOGGER.info("[msm_runtime] script spike: block.break of glowstone cancelled, stone broken");
        helper.succeed();
    }

    @GameTest
    public void throwingHandlerIsLoggedOnce(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.DIAMOND_BLOCK);
        ServerPlayer player = survivalPlayer(helper);
        int before = host.handlerErrors().size();
        InteractionResult first = use(helper, player, AT);
        InteractionResult second = use(helper, player, AT);
        List<String> errors = host.handlerErrors();
        helper.assertValueEqual(errors.size() - before, 1, "logged handler errors (rate-limited)");
        String error = errors.getLast();
        helper.assertTrue(error.startsWith("script msm_spike:glow: block.interact handler: ")
                && error.contains("(msm/msm_spike/script/glow.js#"), "handler error: " + error);
        helper.assertTrue(!(first instanceof InteractionResult.Fail) && !(second instanceof InteractionResult.Fail),
                "a throwing handler cancelled the interaction");
        MsmRuntime.LOGGER.info("[msm_runtime] script spike: throwing handler logged once: {}", error);
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
        String error = host.handlerErrors().stream().filter(e -> e.startsWith("script msm_spike:loop: ")).findFirst().orElse("");
        helper.assertTrue(error.contains("ran for more than 2000 ms and was stopped (msm/msm_spike/script/loop.js)"),
                "loop error: " + host.handlerErrors());
        helper.assertTrue(!(result instanceof InteractionResult.Fail), "aborted handler cancelled the interaction");
        MsmRuntime.LOGGER.info("[msm_runtime] script spike: endless loop stopped after {} ms: {}", ms, error);
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void scheduleRunsAfterTicks(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.TARGET);
        ServerPlayer player = survivalPlayer(helper);
        long scheduledAt = helper.getLevel().getServer().getTickCount();
        InteractionResult result = use(helper, player, AT);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        helper.assertBlockNotPresent(Blocks.GOLD_BLOCK, AT.above());
        helper.runAfterDelay(3, () -> helper.assertBlockNotPresent(Blocks.GOLD_BLOCK, AT.above()));
        helper.runAfterDelay(8, () -> {
            helper.assertBlockPresent(Blocks.GOLD_BLOCK, AT.above());
            helper.assertTrue(logged(host, "[schedule] msm_spike:glow ran after 5 tick(s)"), "schedule note: " + host.recentLogs());
            helper.assertTrue(logged(host, "msm_spike:glow: schedule(5) at load ran"), "load-time schedule: " + host.recentLogs());
            MsmRuntime.LOGGER.info("[msm_runtime] script spike: schedule(5) from server tick {} placed gold by server tick {}",
                    scheduledAt, helper.getLevel().getServer().getTickCount());
            helper.succeed();
        });
    }

    /** Named groups need {@code RegExpLoader}, which Rhino finds through {@code ServiceLoader}. */
    @GameTest
    public void namedRegexGroupWorks(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.assertTrue(logged(host, "msm_spike:glow: regex msm_spike/glow_ore"), "regex log: " + host.recentLogs());
        MsmRuntime.LOGGER.info("[msm_runtime] script spike: named regex groups work in scripts");
        helper.succeed();
    }

    @GameTest
    public void sandboxHidesJava(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.assertTrue(logged(host, "msm_spike:glow: sandbox java=undefined Packages=undefined JavaAdapter=undefined"),
                "sandbox log: " + host.recentLogs());
        MsmRuntime.LOGGER.info("[msm_runtime] script spike: typeof java, Packages, JavaAdapter are undefined");
        helper.succeed();
    }

    /** Plan threshold (PHASE6-PLAN, Waves): more than 0.2 ms per trivial call drops {@code server.tick} from API v1. */
    @GameTest
    public void trivialHandlerBenchmark(GameTestHelper helper) {
        ScriptHost host = host(helper);
        double shared = host.benchmarkTrivialHandler(20_000, 10_000);
        double perCall = host.benchmarkTrivialHandlerWithContextPerCall(20_000, 10_000);
        MsmRuntime.LOGGER.info("[msm_runtime] script spike: 10000 trivial server.tick calls: mean {} us (one context), {} us (context per call)",
                String.format("%.2f", shared / 1000.0), String.format("%.2f", perCall / 1000.0));
        helper.assertTrue(shared < 1_000_000 && perCall < 1_000_000, "a trivial handler call takes more than 1 ms");
        helper.succeed();
    }
}
