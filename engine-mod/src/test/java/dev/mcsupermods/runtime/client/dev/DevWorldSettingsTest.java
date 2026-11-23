package dev.mcsupermods.runtime.client.dev;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;
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

    // ---- Play my game (ADR 0116 D1, B554) ----

    private static final DevWorldSettings.GameWorld SKY =
            new DevWorldSettings.GameWorld("ruby:sky_block", GameType.ADVENTURE, Difficulty.HARD);

    @Test
    void gameWorldsFromTheAppsNames() {
        assertEquals(Optional.of(SKY), DevWorldSettings.gameWorld("ruby:sky_block", "adventure", "hard"));
        assertEquals(GameType.SURVIVAL, DevWorldSettings.gameWorld("minecraft:normal", "survival", "normal").orElseThrow().gameType());
        assertEquals(GameType.CREATIVE, DevWorldSettings.gameWorld("a:b", "creative", "easy").orElseThrow().gameType());
        assertEquals(GameType.SPECTATOR, DevWorldSettings.gameWorld("a:b/c", "spectator", "peaceful").orElseThrow().gameType());
        assertEquals(Difficulty.PEACEFUL, DevWorldSettings.gameWorld("a:b", "survival", "peaceful").orElseThrow().difficulty());
        assertEquals(Difficulty.EASY, DevWorldSettings.gameWorld("a:b", "survival", "easy").orElseThrow().difficulty());
    }

    @Test
    void badGameWorldsAreEmpty() {
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld(null, "survival", "normal"));
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld("sky", "survival", "normal"));
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld("Ruby:sky", "survival", "normal"));
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld("ruby:sky/", "survival", "normal"));
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld("ruby:a//b", "survival", "normal"));
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld("ruby:sky", "hardcore", "normal"));
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld("ruby:sky", "Survival", "normal"));
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld("ruby:sky", null, "normal"));
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld("ruby:sky", "survival", "extreme"));
        assertEquals(Optional.empty(), DevWorldSettings.gameWorld("ruby:sky", "survival", null));
    }

    @Test
    void gameLevelSettingsFollowTheWorldSetup() {
        LevelSettings settings = DevWorldSettings.gameLevelSettings("msm-game-ruby", SKY);
        assertEquals("MCSuperMods game (ruby)", settings.levelName());
        assertEquals(GameType.ADVENTURE, settings.gameType());
        assertEquals(Difficulty.HARD, settings.difficultySettings().difficulty());
        assertFalse(settings.difficultySettings().hardcore());
        assertFalse(settings.difficultySettings().locked());
        assertTrue(settings.allowCommands());
        assertEquals(WorldDataConfiguration.DEFAULT, settings.dataConfiguration());
    }

    @Test
    void gameWorldOptionsHaveTheSeedAndStructures() {
        WorldOptions options = DevWorldSettings.gameWorldOptions(42L);
        assertEquals(42L, options.seed());
        assertTrue(options.generateStructures());
        assertFalse(options.generateBonusChest());
    }

    @Test
    void gamePresetIsTheWorldSetupsId() {
        assertEquals("ruby:sky_block", DevWorldSettings.gamePreset(SKY).identifier().toString());
        assertEquals(WorldPresets.NORMAL,
                DevWorldSettings.gamePreset(new DevWorldSettings.GameWorld("minecraft:normal", GameType.SURVIVAL, Difficulty.NORMAL)));
    }

    @Test
    void gameFolders() {
        assertTrue(DevWorldSettings.isGameFolder("msm-game-ruby"));
        assertFalse(DevWorldSettings.isGameFolder("msm-game-"));
        assertFalse(DevWorldSettings.isGameFolder("msm-test-ruby"));
        assertFalse(DevWorldSettings.isGameFolder(null));
        assertEquals("MCSuperMods game (ruby_extra)", DevWorldSettings.levelName("msm-game-ruby_extra"));
        assertEquals("MCSuperMods test (msm-game-)", DevWorldSettings.levelName("msm-game-"));
        assertEquals("msm-game-", DevWorldSettings.GAME_FOLDER_PREFIX);
    }
}
