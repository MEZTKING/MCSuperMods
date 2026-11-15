package dev.mcsupermods.runtime.controls;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mcsupermods.runtime.controls.KeyBinds.RuntimeKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * The runtime keys' defaults (ADR 0088 D5) equal {@code TargetFacts.controls.runtimeKeys} of every target (B410), read in
 * place from {@code packages/targets/mc-<version>/src/controls.ts}, and their ids and names are the ones the plan names.
 */
class RuntimeKeysTest {
    private static final Path TARGETS = Path.of(System.getProperty("msm.targets", "../packages/targets"));
    private static final Map<String, RuntimeKey> BY_FACT = Map.of(
            "fire", RuntimeKey.FIRE, "second", RuntimeKey.SECOND, "horn", RuntimeKey.HORN, "descend", RuntimeKey.DESCEND);

    private static Map<String, String> runtimeKeys(String target) throws IOException {
        String source = Files.readString(TARGETS.resolve(target).resolve("src/controls.ts"), StandardCharsets.UTF_8);
        Matcher block = Pattern.compile("runtimeKeys:\\s*\\{([^}]*)}").matcher(source);
        assertTrue(block.find(), "no runtimeKeys in " + target);
        Map<String, String> out = new LinkedHashMap<>();
        Matcher entry = Pattern.compile("(\\w+):\\s*'([^']+)'").matcher(block.group(1));
        while (entry.find()) {
            out.put(entry.group(1), entry.group(2));
        }
        return out;
    }

    @Test
    void defaultsMatchEveryTarget() throws IOException {
        for (String target : new String[] {"mc-26.3", "mc-26.4"}) {
            Map<String, String> facts = runtimeKeys(target);
            assertEquals(BY_FACT.keySet(), facts.keySet(), target + " runtime key names");
            facts.forEach((name, key) -> assertEquals(key, BY_FACT.get(name).defaultKey(), target + " " + name));
        }
    }

    @Test
    void idsAndNamesAreTheRuntimes() {
        assertEquals("msm_runtime:vehicle_fire", RuntimeKey.FIRE.id().toString());
        assertEquals("msm_runtime:vehicle_fire_second", RuntimeKey.SECOND.id().toString());
        assertEquals("msm_runtime:vehicle_horn", RuntimeKey.HORN.id().toString());
        assertEquals("msm_runtime:vehicle_descend", RuntimeKey.DESCEND.id().toString());
        assertEquals("key.msm_runtime.vehicle_fire", RuntimeKey.FIRE.translationKey());
        assertEquals("msm_runtime:vehicles", KeyBinds.RUNTIME_CATEGORY.toString());
    }
}
