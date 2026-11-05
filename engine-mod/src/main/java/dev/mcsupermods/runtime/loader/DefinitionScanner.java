package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.MsmRuntime;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.minecraft.resources.Identifier;

/** Walks {@code msm/<namespace>/<kind>/**}{@code /*.json} in every loaded mod container. */
public final class DefinitionScanner {
    private static final List<String> KINDS = List.of("block", "item", "entity");

    private DefinitionScanner() {}

    public static LoadReport scanAllMods() {
        List<RawDefinition> found = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        int files = 0;
        List<ModContainer> mods = new ArrayList<>(FabricLoader.getInstance().getAllMods());
        mods.sort(Comparator.comparing(m -> m.getMetadata().getId()));
        for (ModContainer mod : mods) {
            Optional<Path> root = mod.findPath("msm");
            if (root.isEmpty() || !Files.isDirectory(root.get())) {
                continue;
            }
            String modId = mod.getMetadata().getId();
            List<Path> jsonFiles;
            try (Stream<Path> walk = Files.walk(root.get())) {
                jsonFiles = walk.filter(p -> p.getFileName() != null && p.getFileName().toString().endsWith(".json"))
                        .sorted(Comparator.comparing(Path::toString))
                        .toList();
            } catch (IOException e) {
                errors.add("cannot list msm/ in mod " + modId + ": " + e.getMessage());
                continue;
            }
            for (Path file : jsonFiles) {
                files++;
                Path rel = root.get().relativize(file);
                if (rel.getNameCount() < 3) {
                    errors.add("msm/" + rel + " (mod " + modId + "): expected msm/<namespace>/<kind>/<path>.json");
                    continue;
                }
                String namespace = rel.getName(0).toString();
                String kind = rel.getName(1).toString();
                if (!KINDS.contains(kind)) {
                    MsmRuntime.LOGGER.warn("[{}] ignoring msm/{} (mod {}): unknown kind '{}'", MsmRuntime.MOD_ID, rel, modId, kind);
                    continue;
                }
                String path = rel.subpath(2, rel.getNameCount()).toString().replace('\\', '/');
                path = path.substring(0, path.length() - ".json".length());
                Identifier id;
                try {
                    id = Identifier.fromNamespaceAndPath(namespace, path);
                } catch (RuntimeException e) {
                    errors.add("msm/" + rel + " (mod " + modId + "): invalid id " + namespace + ":" + path);
                    continue;
                }
                try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                    JsonElement json = JsonParser.parseReader(reader);
                    if (!json.isJsonObject()) {
                        errors.add("msm/" + rel + " (mod " + modId + "): top level must be an object");
                        continue;
                    }
                    found.add(new RawDefinition(modId, kind, id, json.getAsJsonObject()));
                } catch (IOException | RuntimeException e) {
                    errors.add("msm/" + rel + " (mod " + modId + "): " + e.getMessage());
                }
            }
        }
        for (String error : errors) {
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, error);
        }
        return new LoadReport(files, List.copyOf(found), List.of(), List.of(), List.of(), List.copyOf(errors), List.of());
    }
}
