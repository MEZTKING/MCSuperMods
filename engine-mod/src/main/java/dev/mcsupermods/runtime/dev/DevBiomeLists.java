package dev.mcsupermods.runtime.dev;

import dev.mcsupermods.runtime.MsmRuntime;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.TreeSet;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.SharedConstants;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterList;

/**
 * The resolved biome parameter lists of vanilla's {@code multi_noise} presets, written in dev mode only (ADR 0119 D4,
 * reserve B592). The jar's {@code multi_noise_biome_source_parameter_list} files hold only a preset name (spike B574,
 * WS9), so the app's live world generation preview cannot draw vanilla's overworld and Nether biomes from data. On a
 * dev-mode server ({@link DevMode#active()}: a client's integrated server with a valid {@code msm-dev/dev.json}, never a
 * dedicated server), at {@code SERVER_STARTED}, this asks vanilla's own accessor
 * ({@link MultiNoiseBiomeSourceParameterList#knownPresets()}) for the lists and writes them to
 * {@code <dev folder>/}{@value #FILE}, which the app reads as it reads a save. The file stays on the user's machine; the
 * runtime never ships, sends or exports it.
 *
 * <p>Format {@value #FORMAT} (sorted keys, one point per line):
 *
 * <pre>
 * {
 *   "format": 1,
 *   "minecraftVersion": "&lt;WorldVersion.id()&gt;",
 *   "presets": {
 *     "minecraft:nether": {
 *       "biomes": ["minecraft:basalt_deltas", ...],
 *       "points": [[biome, tMin, tMax, hMin, hMax, cMin, cMax, eMin, eMax, dMin, dMax, wMin, wMax, offset], ...]
 *     },
 *     ...
 *   }
 * }
 * </pre>
 *
 * {@code biomes} is the sorted palette of biome ids; each point's first number is an index into it, then the six climate
 * parameters (temperature, humidity, continentalness, erosion, depth, weirdness) as min and max, then the offset, all as
 * vanilla's quantized whole numbers (the data pack value times 10,000), in the list's own order. Written only when its text
 * changed.
 */
public final class DevBiomeLists {
    /** The file's name in the dev folder. */
    public static final String FILE = "biome-lists.json";
    /** The format number written in the file. */
    public static final int FORMAT = 1;

    private DevBiomeLists() {}

    /** Registers the {@code SERVER_STARTED} listener (from {@link DevMode#register()}). */
    static void register() {
        ServerLifecycleEvents.SERVER_STARTED.register(server -> writeFor(DevMode.current()));
    }

    /**
     * What {@link #write} did.
     *
     * @param file    the file
     * @param written true when the file was written, false when it already held the same text
     * @param presets the presets in the file
     * @param points  the points over all presets
     */
    public record Result(Path file, boolean written, int presets, int points) {}

    /**
     * {@code SERVER_STARTED}: writes the lists into {@code state}'s dev folder when dev mode is on ({@code state} not null);
     * with dev mode off (always on a dedicated server) nothing is read or written. Never throws: a failure is logged.
     */
    public static Optional<Result> writeFor(DevMode.State state) {
        if (state == null) {
            return Optional.empty();
        }
        try {
            Result result = write(state.root());
            if (result.written()) {
                MsmRuntime.LOGGER.info("[{}] dev mode: wrote {} biome list(s) with {} point(s) to {}", MsmRuntime.MOD_ID,
                        result.presets(), result.points(), result.file());
            }
            return Optional.of(result);
        } catch (IOException | RuntimeException e) {
            MsmRuntime.LOGGER.warn("[{}] dev mode: could not write {}: {}", MsmRuntime.MOD_ID, FILE, e.toString());
            return Optional.empty();
        }
    }

    /** Writes vanilla's resolved lists for the running version to {@code root/}{@value #FILE} when they changed. */
    public static Result write(Path root) throws IOException {
        Map<MultiNoiseBiomeSourceParameterList.Preset, Climate.ParameterList<ResourceKey<Biome>>> known =
                MultiNoiseBiomeSourceParameterList.knownPresets();
        String text = render(SharedConstants.getCurrentVersion().id(), known);
        int points = known.values().stream().mapToInt(list -> list.values().size()).sum();
        Path file = root.resolve(FILE);
        if (text.equals(DevMode.readOrNull(file))) {
            return new Result(file, false, known.size(), points);
        }
        Files.createDirectories(root);
        Path temp = root.resolve(FILE + ".tmp");
        Files.writeString(temp, text, StandardCharsets.UTF_8);
        try {
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
        }
        return new Result(file, true, known.size(), points);
    }

    /** The file's text for {@code version} and the lists by preset (see the class comment). */
    public static String render(String version,
            Map<MultiNoiseBiomeSourceParameterList.Preset, Climate.ParameterList<ResourceKey<Biome>>> presets) {
        Map<String, Climate.ParameterList<ResourceKey<Biome>>> byId = new TreeMap<>();
        presets.forEach((preset, list) -> byId.put(preset.id().toString(), list));
        StringBuilder out = new StringBuilder(1 << 20);
        out.append("{\n  \"format\": ").append(FORMAT).append(",\n  \"minecraftVersion\": ").append(quote(version))
                .append(",\n  \"presets\": {");
        boolean firstPreset = true;
        for (Map.Entry<String, Climate.ParameterList<ResourceKey<Biome>>> entry : byId.entrySet()) {
            List<com.mojang.datafixers.util.Pair<Climate.ParameterPoint, ResourceKey<Biome>>> values = entry.getValue().values();
            TreeSet<String> sorted = new TreeSet<>();
            for (var pair : values) {
                sorted.add(pair.getSecond().identifier().toString());
            }
            List<String> palette = new ArrayList<>(sorted);
            Map<String, Integer> index = new TreeMap<>();
            for (int i = 0; i < palette.size(); i++) {
                index.put(palette.get(i), i);
            }
            out.append(firstPreset ? "\n" : ",\n").append("    ").append(quote(entry.getKey())).append(": {\n      \"biomes\": [");
            firstPreset = false;
            for (int i = 0; i < palette.size(); i++) {
                out.append(i == 0 ? "" : ", ").append(quote(palette.get(i)));
            }
            out.append("],\n      \"points\": [");
            boolean firstPoint = true;
            for (var pair : values) {
                Climate.ParameterPoint p = pair.getFirst();
                out.append(firstPoint ? "\n" : ",\n").append("        [").append(index.get(pair.getSecond().identifier().toString()));
                firstPoint = false;
                for (Climate.Parameter parameter : List.of(p.temperature(), p.humidity(), p.continentalness(), p.erosion(), p.depth(),
                        p.weirdness())) {
                    out.append(", ").append(parameter.min()).append(", ").append(parameter.max());
                }
                out.append(", ").append(p.offset()).append(']');
            }
            out.append(firstPoint ? "]\n    }" : "\n      ]\n    }");
        }
        out.append(firstPreset ? "}\n}\n" : "\n  }\n}\n");
        return out.toString();
    }

    private static String quote(String text) {
        StringBuilder out = new StringBuilder(text.length() + 2).append('"');
        for (char c : text.toCharArray()) {
            if (c == '"' || c == '\\') {
                out.append('\\').append(c);
            } else if (c < 0x20) {
                out.append(String.format("\\u%04x", (int) c));
            } else {
                out.append(c);
            }
        }
        return out.append('"').toString();
    }
}
