package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import java.util.List;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** The pure {@code sounds.json} key reader of ADR 0057 D1. */
class SoundScannerTest {
    private static SoundScanner.Source source(String namespace, String json) {
        return new SoundScanner.Source(namespace, "assets/" + namespace + "/sounds.json (mod m)", JsonParser.parseString(json));
    }

    private static List<Identifier> ids(String... ids) {
        return java.util.Arrays.stream(ids).map(Identifier::parse).toList();
    }

    @Test
    void keysAreNamespacedSortedAndDistinct() {
        SoundScanner.Keys keys = SoundScanner.read(List.of(
                source("b_mod", "{\"z.last\": {\"sounds\": []}, \"golem.ambient\": {\"sounds\": [\"mob/irongolem/hit1\"]}}"),
                source("a_mod", "{\"chime\": {}}"),
                source("b_mod", "{\"golem.ambient\": {}}")));
        assertEquals(ids("a_mod:chime", "b_mod:golem.ambient", "b_mod:z.last"), keys.ids(), "a duplicate key is one id");
        assertEquals(List.of(), keys.warnings());
    }

    @Test
    void minecraftNamespaceIsSkippedSilently() {
        SoundScanner.Keys keys = SoundScanner.read(List.of(source("minecraft", "{\"block.stone.break\": {}, \"new.one\": {}}"),
                source("minecraft", "[]")));
        assertEquals(List.of(), keys.ids());
        assertEquals(List.of(), keys.warnings());
    }

    @Test
    void invalidIdIsAWarningAndTheRestStays() {
        SoundScanner.Keys keys = SoundScanner.read(List.of(source("t", "{\"Bad Key\": {}, \"good\": {}, \"x:y\": {}}")));
        assertEquals(ids("t:good"), keys.ids());
        assertEquals(2, keys.warnings().size(), keys.warnings().toString());
        assertTrue(keys.warnings().getFirst().contains("invalid sound event id t:Bad Key"), keys.warnings().toString());
        assertTrue(keys.warnings().getFirst().startsWith("assets/t/sounds.json (mod m)"), keys.warnings().toString());
    }

    @Test
    void invalidNamespaceAndNonObjectFilesAreWarnings() {
        SoundScanner.Keys keys = SoundScanner.read(List.of(source("Bad NS", "{\"a\": {}}"), source("t", "[\"a\"]"), source("u", "\"a\"")));
        assertEquals(List.of(), keys.ids());
        assertEquals(3, keys.warnings().size(), keys.warnings().toString());
        assertTrue(keys.warnings().get(0).contains("invalid namespace 'Bad NS'"), keys.warnings().toString());
        assertTrue(keys.warnings().get(1).contains("top level must be an object"), keys.warnings().toString());
    }
}
