package dev.mcsupermods.runtime.client.dev;

import dev.mcsupermods.runtime.dev.DevFiles;
import java.util.Optional;
import java.util.regex.Pattern;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
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
 *
 * <p>Play my game (ADR 0116 D1, B554) makes {@code msm-game-<ns>} instead: the world setup's world preset (from the
 * content jar's data, or from a dev data pack placed in the world folder before creation, B547 Y15), its game mode and
 * difficulty, structures on, no bonus chest, a random seed, commands on (the maker's own copy of the game; a map keeps
 * the author's world settings, ADR 0116), no test area, chests or game rule changes (the server side runs no setup
 * function in a game world).
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
    /** The start of Play my game's folder names ({@code @msm/interop} {@code gameWorldFolder}: {@code msm-game-<ns>}). */
    public static final String GAME_FOLDER_PREFIX = DevFiles.GAME_WORLD_FOLDER_PREFIX;
    public static final boolean GAME_GENERATE_STRUCTURES = true;
    public static final boolean GAME_BONUS_CHEST = false;
    public static final boolean GAME_HARDCORE = false;
    public static final boolean GAME_ALLOW_COMMANDS = true;

    /**
     * The translation key of the experimental settings screen's "I Know What I'm Doing!" button (seen by B547 in the
     * screen's widgets; a game world with its own world type shows that screen each time it is opened).
     */
    public static final String BACKUP_SKIP_BUTTON_KEY = "selectWorld.backupJoinSkipButton";

    private static final Pattern PRESET_ID = Pattern.compile("[a-z0-9_.-]{1,64}:[a-z0-9_./-]{1,256}");

    /**
     * The world of a Play my game request ({@code play.json} {@code kind: "game"}).
     *
     * @param preset   the world preset id, {@code <ns>:<path>} (the world setup's own id, or {@code minecraft:normal})
     * @param gameType the world setup's game mode
     * @param difficulty the world setup's difficulty
     */
    public record GameWorld(String preset, GameType gameType, Difficulty difficulty) {}

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
     * A Play my game world from {@code play.json}'s names, as {@code @msm/interop} writes them ({@code survival},
     * {@code creative}, {@code adventure}, {@code spectator}; {@code peaceful}, {@code easy}, {@code normal},
     * {@code hard}); empty when any is missing or not one of those.
     */
    public static Optional<GameWorld> gameWorld(String preset, String gameMode, String difficulty) {
        if (preset == null || !PRESET_ID.matcher(preset).matches() || preset.contains("//") || preset.endsWith("/")) {
            return Optional.empty();
        }
        GameType type = switch (gameMode == null ? "" : gameMode) {
            case "survival" -> GameType.SURVIVAL;
            case "creative" -> GameType.CREATIVE;
            case "adventure" -> GameType.ADVENTURE;
            case "spectator" -> GameType.SPECTATOR;
            default -> null;
        };
        Difficulty level = switch (difficulty == null ? "" : difficulty) {
            case "peaceful" -> Difficulty.PEACEFUL;
            case "easy" -> Difficulty.EASY;
            case "normal" -> Difficulty.NORMAL;
            case "hard" -> Difficulty.HARD;
            default -> null;
        };
        return type == null || level == null ? Optional.empty() : Optional.of(new GameWorld(preset, type, level));
    }

    /** Whether {@code worldFolder} is a Play my game world ({@code msm-game-<ns>}). */
    public static boolean isGameFolder(String worldFolder) {
        return DevFiles.isGameWorldFolder(worldFolder);
    }

    /**
     * The name shown in the world list: {@code MCSuperMods test (<namespace>)} for {@code msm-test-<namespace>}, else
     * {@code MCSuperMods test (<folder>)}; {@code MCSuperMods game (<namespace>)} for {@code msm-game-<namespace>}.
     */
    public static String levelName(String worldFolder) {
        if (worldFolder.startsWith(GAME_FOLDER_PREFIX) && worldFolder.length() > GAME_FOLDER_PREFIX.length()) {
            return "MCSuperMods game (" + worldFolder.substring(GAME_FOLDER_PREFIX.length()) + ")";
        }
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

    /** The level settings of a new Play my game world in {@code worldFolder}. */
    public static LevelSettings gameLevelSettings(String worldFolder, GameWorld game) {
        return new LevelSettings(levelName(worldFolder), game.gameType(),
                new LevelSettings.DifficultySettings(game.difficulty(), GAME_HARDCORE, false), GAME_ALLOW_COMMANDS,
                WorldDataConfiguration.DEFAULT);
    }

    /** The world options of a new Play my game world: {@code seed} (random, from the caller), structures on, no bonus chest. */
    public static WorldOptions gameWorldOptions(long seed) {
        return new WorldOptions(seed, GAME_GENERATE_STRUCTURES, GAME_BONUS_CHEST);
    }

    /** A random seed for a new Play my game world, as the Create World screen picks one. */
    public static long randomSeed() {
        return WorldOptions.randomSeed();
    }

    /** The world preset key of {@code game}. */
    public static ResourceKey<WorldPreset> gamePreset(GameWorld game) {
        return ResourceKey.create(Registries.WORLD_PRESET, Identifier.parse(game.preset()));
    }

    /**
     * The dimensions of {@code game}'s world preset in the registries of the world being made: the content jar's data and
     * any pack in the world folder's {@code datapacks/} (enabled at creation, B547 Y15).
     *
     * @throws IllegalStateException when the preset is in neither (the world is then not made)
     */
    public static WorldDimensions gameDimensions(HolderLookup.Provider registries, GameWorld game) {
        ResourceKey<WorldPreset> key = gamePreset(game);
        return registries.lookupOrThrow(Registries.WORLD_PRESET).get(key)
                .orElseThrow(() -> new IllegalStateException("the world type " + game.preset()
                        + " is not in the game's data (not in the mod jar or the world's data packs)"))
                .value().createWorldDimensions();
    }
}
