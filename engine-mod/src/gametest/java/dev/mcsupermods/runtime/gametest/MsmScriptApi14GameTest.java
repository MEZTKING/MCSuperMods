package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.animal.sheep.Sheep;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.saveddata.WeatherData;
import net.minecraft.world.phys.AABB;

/**
 * Script API 1.4 (ADR 0082 D5; plan B370): {@code World.dayTime}, {@code isRaining}, {@code isThundering},
 * {@code setWeather}, {@code explode}, {@code dropItem} and {@code breakBlock}, and {@code Entity.remove}, through the
 * {@code run_script} handlers of {@code msm/msm_test/script/world_api14.js}, called directly with {@code e.pos} at the
 * block under test. Weather is server-wide, so one test changes it and puts clear weather back.
 */
public class MsmScriptApi14GameTest {
    private static final BlockPos AT = new BlockPos(1, 2, 1);
    private static final String LOG = "msm_test:world_api14: ";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static ScriptHost host(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost: SERVER_STARTING did not load scripts");
        return host;
    }

    private static void run(GameTestHelper helper, String handler, EventContext ctx) {
        ScriptHost host = host(helper);
        host.action(id("world_api14"), id("world_api14"), id(handler), ctx);
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:world_api14:")),
                "world_api14.js errors: " + host.handlerErrors());
    }

    private static void run(GameTestHelper helper, String handler) {
        run(helper, handler, EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), null));
    }

    /** The last {@code msm.log} line of world_api14.js that starts with {@code start}, without the script prefix. */
    private static String logged(GameTestHelper helper, String start) {
        List<String> logs = ScriptLogs.of(host(helper));
        for (int i = logs.size() - 1; i >= 0; i--) {
            if (logs.get(i).startsWith(LOG + start)) {
                return logs.get(i).substring(LOG.length());
            }
        }
        return null;
    }

    private static List<ItemEntity> items(GameTestHelper helper, Item item) {
        BlockPos at = helper.absolutePos(AT);
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(at).inflate(3), e -> e.getItem().is(item));
    }

    private static int total(List<ItemEntity> items) {
        return items.stream().mapToInt(e -> e.getItem().getCount()).sum();
    }

    @GameTest
    public void weatherAndTimeOfDay(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        WeatherData weather = server.getWeatherData();
        ServerLevel level = helper.getLevel();
        try {
            run(helper, "api14_rain");
            helper.assertTrue(weather.isRaining() && !weather.isThundering(), "rain: raining and not thundering");
            helper.assertValueEqual(weather.getRainTime(), 600, "rain time (30 s)");
            helper.assertValueEqual(weather.getClearWeatherTime(), 0, "clear time while raining");
            run(helper, "api14_report");
            long day = Math.floorMod(level.dimensionType().defaultClock().isPresent() ? level.getDefaultClockTime()
                    : level.getOverworldClockTime(), 24000L);
            String nether = server.getLevel(Level.NETHER) == null ? "none" : "false false";
            helper.assertValueEqual(logged(helper, "report "), "report true false " + day + " nether " + nether, "report in rain");

            run(helper, "api14_thunder");
            helper.assertTrue(weather.isRaining() && weather.isThundering(), "thunder: raining and thundering");
            helper.assertTrue(weather.getThunderTime() > 0 && weather.getRainTime() == weather.getThunderTime(),
                    "a length the game picked: rain " + weather.getRainTime() + ", thunder " + weather.getThunderTime());
            run(helper, "api14_report");
            helper.assertTrue(logged(helper, "report ").startsWith("report true true "), "report in thunder: " + logged(helper, "report "));

            run(helper, "api14_clear");
            helper.assertTrue(!weather.isRaining() && !weather.isThundering(), "clear: neither");
            helper.assertValueEqual(weather.getClearWeatherTime(), 10, "clear time (0.5 s)");
            run(helper, "api14_report");
            helper.assertTrue(logged(helper, "report ").startsWith("report false false "), "report when clear: " + logged(helper, "report "));
            String[] parts = logged(helper, "report ").split(" ");
            long dayTime = Long.parseLong(parts[3]);
            helper.assertTrue(dayTime >= 0 && dayTime < 24000, "dayTime " + dayTime + " is 0 to 23999");
        } finally {
            server.setWeatherParameters(6000, 0, false, false);
        }
        helper.succeed();
    }

    @GameTest
    public void explosionsBreakBlocksOrNot(GameTestHelper helper) {
        BlockPos side = AT.east();
        helper.setBlock(AT, Blocks.DIRT);
        helper.setBlock(side, Blocks.DIRT);
        Sheep sheep = helper.spawn(EntityTypes.SHEEP, AT.west().above());
        sheep.setNoAi(true);
        float before = sheep.getHealth();
        run(helper, "api14_explode_soft");
        helper.assertBlockPresent(Blocks.DIRT, AT);
        helper.assertBlockPresent(Blocks.DIRT, side);
        helper.assertTrue(sheep.getHealth() < before || !sheep.isAlive(), "the sheep was not hurt: " + sheep.getHealth());
        run(helper, "api14_explode_hard");
        helper.assertBlockNotPresent(Blocks.DIRT, AT);
        helper.succeed();
    }

    @GameTest
    public void dropItemSplitsIntoStacks(GameTestHelper helper) {
        run(helper, "api14_drop");
        List<ItemEntity> diamonds = items(helper, Items.DIAMOND);
        helper.assertValueEqual(diamonds.size(), 2, "diamond stacks");
        helper.assertValueEqual(total(diamonds), 70, "diamonds");
        helper.assertValueEqual(total(items(helper, Items.ENDER_PEARL)), 1, "ender pearls");
        for (ItemEntity e : diamonds) {
            helper.assertTrue(e.hasPickUpDelay(), "a dropped item has the normal pick-up delay");
        }
        helper.succeed();
    }

    @GameTest
    public void breakBlockWithAndWithoutDrops(GameTestHelper helper) {
        helper.setBlock(AT, Blocks.DIRT);
        run(helper, "api14_break");
        helper.assertValueEqual(logged(helper, "break "), "break drops:true air:false", "break line");
        helper.assertBlockPresent(Blocks.AIR, AT);
        helper.assertValueEqual(total(items(helper, Items.DIRT)), 1, "dirt dropped");
        items(helper, Items.DIRT).forEach(Entity::discard);

        helper.setBlock(AT, Blocks.COBBLESTONE);
        run(helper, "api14_break_clean");
        helper.assertValueEqual(logged(helper, "clean "), "clean true", "clean line");
        helper.assertBlockPresent(Blocks.AIR, AT);
        helper.assertValueEqual(items(helper, Items.COBBLESTONE).size(), 0, "nothing dropped without drops");
        helper.succeed();
    }

    @GameTest
    public void removeDiscardsMobsButNotPlayers(GameTestHelper helper) {
        Sheep sheep = helper.spawn(EntityTypes.SHEEP, AT);
        sheep.setNoAi(true);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        run(helper, "api14_remove", EventContext.forEntity(helper.getLevel(), sheep, player));
        helper.assertValueEqual(logged(helper, "remove "), "remove mob:ok alive:false player:TypeError", "remove line");
        helper.assertTrue(sheep.isRemoved() && sheep.getRemovalReason() == Entity.RemovalReason.DISCARDED,
                "removal reason " + sheep.getRemovalReason());
        helper.assertTrue(!sheep.isDeadOrDying(), "the sheep did not die");
        BlockPos at = helper.absolutePos(AT);
        helper.assertValueEqual(helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(at).inflate(3)).size(), 0, "no loot");
        helper.assertTrue(!player.isRemoved() && player.isAlive(), "the player is still there");
        helper.succeed();
    }

    @GameTest
    public void errors(GameTestHelper helper) {
        run(helper, "api14_errors");
        helper.assertValueEqual(logged(helper, "errors "), "errors power11:RangeError powerNeg:RangeError powerNaN:TypeError "
                + "power0:ok snow:TypeError seconds0:RangeError secondsBig:RangeError tooMany:RangeError "
                + "unknownItem:TypeError badOptions:TypeError", "error line");
        helper.succeed();
    }
}
