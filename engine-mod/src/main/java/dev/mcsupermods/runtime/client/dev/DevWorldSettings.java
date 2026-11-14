package dev.mcsupermods.runtime.client.dev;

import net.minecraft.core.HolderLookup;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldDimensions;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPreset;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

/**
 * The test world of one-click Play (ADR 0084 D2) and the dev client's timings, as plain values. Pure: no client state, so
 * JUnit covers it. The world is made with the game's own {@code WorldOpenFlows.createFreshLevel} (fact F3, the same on
 * 26.3 and 26.4): the {@code minecraft:flat} world preset with its default layers, creative, commands on, easy, not
 * hardcore, no structures, no bonus chest and a fixed seed. Game rules, the test area and the chests come from the app's
 * setup function, which the server side runs on the first join ({@code dev.DevSetup}).
 */
public final class DevWorldSettings {
    /** The fixed seed of every test world. */
    public static final long SEED = 20_261_114L;
    public static final GameType GAME_TYPE = GameType.CREATIVE;
    public static final Difficulty DIFFICULTY = Difficulty.EASY;
    public static final boolean HARDCORE = false;
    public static final boolean ALLOW_COMMANDS = true;
    public static final boolean GENERATE_STRUCTURES = false;
    public static final boolean BONUS_CHEST = false;
    /** The world preset, from the {@code world_preset} registry of the world being made. */
    public static final ResourceKey<WorldPreset> PRESET = WorldPresets.FLAT;
    /** The start of the folder names the app writes ({@code @msm/interop} {@code devWorldFolder}: {@code msm-test-<ns>}). */
    public static final String WORLD_FOLDER_PREFIX = "msm-test-";

    /** How often {@code dev.json}, {@code play.json} and {@code request.json} are looked at, in client ticks (B366). */
    public static final int REQUEST_POLL_TICKS = 10;
    /** How often {@code status.json} is written, in client ticks (B366; 2 seconds). */
    public static final int STATUS_WRITE_TICKS = 40;
    /** How long opening or creating the test world may take before the request fails (5 minutes). */
    public static final int OPEN_TIMEOUT_TICKS = 6_000;
    /** How long a reload (data packs, then resource packs) may take before the request fails (2 minutes). */
    public static final int RELOAD_TIMEOUT_TICKS = 2_400;
    /** Back on the title screen with no world this long after starting to open one: the opening failed. */
    public static final int OPEN_FAILED_GRACE_TICKS = 40;

    private DevWorldSettings() {}

    /**
     * The name shown in the world list: {@code MCSuperMods test (<namespace>)} for {@code msm-test-<namespace>}, else
     * {@code MCSuperMods test (<folder>)}.
     */
    public static String levelName(String worldFolder) {
        String shown = worldFolder.startsWith(WORLD_FOLDER_PREFIX) && worldFolder.length() > WORLD_FOLDER_PREFIX.length()
                ? worldFolder.substring(WORLD_FOLDER_PREFIX.length())
                : worldFolder;
        return "MCSuperMods test (" + shown + ")";
    }

    /** The level settings of a new test world in {@code worldFolder}. */
    public static LevelSettings levelSettings(String worldFolder) {
        return new LevelSettings(levelName(worldFolder), GAME_TYPE, new LevelSettings.DifficultySettings(DIFFICULTY, HARDCORE, false),
                ALLOW_COMMANDS, WorldDataConfiguration.DEFAULT);
    }

    /** The world options of a new test world: the fixed seed, no structures, no bonus chest. */
    public static WorldOptions worldOptions() {
        return new WorldOptions(SEED, GENERATE_STRUCTURES, BONUS_CHEST);
    }

    /** The dimensions of {@link #PRESET} in the registries of the world being made. */
    public static WorldDimensions dimensions(HolderLookup.Provider registries) {
        return registries.lookupOrThrow(Registries.WORLD_PRESET).getOrThrow(PRESET).value().createWorldDimensions();
    }
}
