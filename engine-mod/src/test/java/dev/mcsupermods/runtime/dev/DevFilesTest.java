package dev.mcsupermods.runtime.dev;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** The dev file formats of B366 as the runtime reads them (ADR 0084 D3), the decision of D4 and the overlay key check of D6. */
class DevFilesTest {
    private static final String VALID = "{\n  \"appVersion\": \"1.4.0\",\n  \"format\": 1,\n  \"namespaces\": [\"ruby\", \"ruby_extra\"],\n"
            + "  \"target\": \"mc-26.3\",\n  \"world\": \"msm-test-ruby\"\n}\n";

    @Test
    void devInfoAsTheAppWritesIt() {
        DevFiles.DevInfo info = DevFiles.parseDevInfo(VALID).orElseThrow();
        assertEquals(List.of("ruby", "ruby_extra"), info.namespaces());
        assertEquals("mc-26.3", info.target());
        assertEquals("msm-test-ruby", info.world());
        assertEquals("1.4.0", info.appVersion());
    }

    @Test
    void invalidDevInfoIsEmpty() {
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(null));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(""));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo("not json {"));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo("[]"));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(VALID.replace("\"format\": 1", "\"format\": 2")));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(VALID.replace("\"format\": 1,", "")));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(VALID.replace("[\"ruby\", \"ruby_extra\"]", "[]")));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(VALID.replace("\"ruby_extra\"", "\"Ruby\"")));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(VALID.replace("\"ruby_extra\"", "3")));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(VALID.replace("msm-test-ruby", "../saves")));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(VALID.replace("msm-test-ruby", "a/b")));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(VALID.replace("\"mc-26.3\"", "null")));
        assertEquals(Optional.empty(), DevFiles.parseDevInfo(VALID.replace("  \"appVersion\": \"1.4.0\",\n", "")));
    }

    @Test
    void worldFolders() {
        assertTrue(DevFiles.isWorldFolder("msm-test-ruby"));
        assertTrue(DevFiles.isWorldFolder("msm-test-ruby-old-2"));
        assertFalse(DevFiles.isWorldFolder(".."));
        assertFalse(DevFiles.isWorldFolder("-x"));
        assertFalse(DevFiles.isWorldFolder("a\\b"));
        assertFalse(DevFiles.isWorldFolder(null));
    }

    @Test
    void setupFunctionSections() {
        String text = "# MCSuperMods test world (written by MCSuperMods; changes are replaced at the next Play)\n"
                + "say before any marker\n" + DevFiles.SETUP_SECTION + "\ntime set 6000\n\ngamerule advance_time false\r\n"
                + "# a comment\n" + DevFiles.REFILL_SECTION + "\n/execute unless block ~-4 ~ ~-2 minecraft:chest run setblock ~-4 ~ ~-2 minecraft:chest\n"
                + "  item replace block ~-4 ~ ~-2 container.0 with minecraft:air  \n";
        DevFiles.SetupFunction fn = DevFiles.parseSetupFunction(text);
        assertEquals(List.of("time set 6000", "gamerule advance_time false"), fn.setup());
        assertEquals(List.of("/execute unless block ~-4 ~ ~-2 minecraft:chest run setblock ~-4 ~ ~-2 minecraft:chest",
                "item replace block ~-4 ~ ~-2 container.0 with minecraft:air"), fn.refill());
        assertEquals(DevFiles.SetupFunction.EMPTY, DevFiles.parseSetupFunction(null));
        assertEquals(DevFiles.SetupFunction.EMPTY, DevFiles.parseSetupFunction("say no markers\n"));
        DevFiles.SetupFunction refillOnly = DevFiles.parseSetupFunction(DevFiles.REFILL_SECTION + "\nsay hi\n");
        assertEquals(List.of(), refillOnly.setup());
        assertEquals(List.of("say hi"), refillOnly.refill());
    }

    @Test
    void decisionNeverReadsForADedicatedServer() {
        Path game = Path.of("game");
        List<Path> reads = new ArrayList<>();
        DevMode.Decision dedicated = DevMode.decide(false, true, false, game, null, p -> {
            reads.add(p);
            return VALID;
        });
        assertTrue(dedicated.state().isEmpty());
        assertNull(dedicated.problem());
        DevMode.Decision rootWithoutGameTest = DevMode.decide(false, true, false, game, "root", p -> {
            reads.add(p);
            return VALID;
        });
        assertTrue(rootWithoutGameTest.state().isEmpty());
        DevMode.Decision server = DevMode.decide(false, false, false, game, null, p -> {
            reads.add(p);
            return VALID;
        });
        assertTrue(server.state().isEmpty());
        assertEquals(List.of(), reads);
        DevMode.Decision client = DevMode.decide(true, false, false, game, null, p -> p.equals(game.resolve("msm-dev/dev.json")) ? VALID : null);
        assertEquals(game.resolve("msm-dev"), client.state().orElseThrow().root());
        assertEquals(game.resolve("msm-dev/overlay/msm"), client.state().orElseThrow().overlayMsm());
        DevMode.Decision missing = DevMode.decide(true, false, false, game, null, p -> null);
        assertTrue(missing.state().isEmpty());
        assertNull(missing.problem());
        DevMode.Decision invalid = DevMode.decide(true, false, false, game, null, p -> "{}");
        assertTrue(invalid.state().isEmpty());
        assertNotNull(invalid.problem());
        DevMode.Decision clientDedicated = DevMode.decide(true, true, false, game, null, p -> VALID);
        assertTrue(clientDedicated.state().isEmpty());
        DevMode.Decision test = DevMode.decide(false, true, true, game, "root", p -> p.equals(Path.of("root/dev.json")) ? VALID : null);
        assertEquals(Path.of("root"), test.state().orElseThrow().root());
    }

    @Test
    void overlayKeysOutsideEvents() {
        JsonObject jar = JsonParser.parseString("{\"format\":1,\"type\":\"slab\",\"components\":{\"msm:on_interact\":{\"event\":\"a:b\"},"
                + "\"msm:light_emitter\":{\"level\":4}},\"events\":{\"a:b\":{\"actions\":[]}}}").getAsJsonObject();
        JsonObject same = JsonParser.parseString("{\"components\":{\"msm:light_emitter\":{\"level\":4},\"msm:on_interact\":{\"event\":\"a:b\"}},"
                + "\"events\":{\"a:b\":{\"actions\":[{\"type\":\"heal\",\"amount\":1}]}},\"format\":1,\"type\":\"slab\"}").getAsJsonObject();
        assertEquals(List.of(), EventOverlay.changedOutsideEvents(jar, same));
        JsonObject eventsOnly = JsonParser.parseString("{\"events\":{}}").getAsJsonObject();
        assertEquals(List.of(), EventOverlay.changedOutsideEvents(jar, eventsOnly));
        JsonObject changed = JsonParser.parseString("{\"type\":\"stairs\",\"name\":\"X\",\"components\":{\"msm:on_interact\":{\"event\":\"a:c\"},"
                + "\"msm:on_place\":{\"event\":\"a:b\"}}}").getAsJsonObject();
        assertEquals(List.of("msm:light_emitter removed", "msm:on_interact changed", "msm:on_place added", "name added", "type changed"),
                EventOverlay.changedOutsideEvents(jar, changed));
    }
}
