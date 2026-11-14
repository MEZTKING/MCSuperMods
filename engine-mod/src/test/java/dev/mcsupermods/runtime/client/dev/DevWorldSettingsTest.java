package dev.mcsupermods.runtime.client.dev;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import org.junit.jupiter.api.Test;

/** The test world of ADR 0084 D2 and the dev client's timings (B366's numbers). */
class DevWorldSettingsTest {
    @Test
    void levelSettingsAreCreativeEasyWithCommands() {
        LevelSettings settings = DevWorldSettings.levelSettings("msm-test-ruby");
        assertEquals("MCSuperMods test (ruby)", settings.levelName());
        assertEquals(GameType.CREATIVE, settings.gameType());
        assertEquals(Difficulty.EASY, settings.difficultySettings().difficulty());
        assertFalse(settings.difficultySettings().hardcore());
        assertFalse(settings.difficultySettings().locked());
        assertTrue(settings.allowCommands());
        assertEquals(WorldDataConfiguration.DEFAULT, settings.dataConfiguration());
    }

    @Test
    void worldOptionsHaveAFixedSeedAndNoStructures() {
        WorldOptions options = DevWorldSettings.worldOptions();
        assertEquals(DevWorldSettings.SEED, options.seed());
        assertEquals(DevWorldSettings.SEED, DevWorldSettings.worldOptions().seed());
        assertFalse(options.generateStructures());
        assertFalse(options.generateBonusChest());
    }

    @Test
    void flatPreset() {
        assertEquals(WorldPresets.FLAT, DevWorldSettings.PRESET);
    }

    @Test
    void levelNames() {
        assertEquals("MCSuperMods test (ruby_extra)", DevWorldSettings.levelName("msm-test-ruby_extra"));
        assertEquals("MCSuperMods test (msm-test-)", DevWorldSettings.levelName("msm-test-"));
        assertEquals("MCSuperMods test (other)", DevWorldSettings.levelName("other"));
    }

    @Test
    void timingsMatchTheApp() {
        // @msm/interop fabric/dev-session.ts: REQUEST_POLL_TICKS 10, STATUS_WRITE_TICKS 40 (2 s; the app's 10 s staleness).
        assertEquals(10, DevWorldSettings.REQUEST_POLL_TICKS);
        assertEquals(40, DevWorldSettings.STATUS_WRITE_TICKS);
        assertTrue(DevWorldSettings.STATUS_WRITE_TICKS * 50 < 10_000);
    }
}
