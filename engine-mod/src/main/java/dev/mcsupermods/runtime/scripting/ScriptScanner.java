package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.MsmRuntime;
import java.io.IOException;
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

/** Finds {@code msm/<namespace>/script/**}{@code /*.js} in every mod container, in mod id then path order. */
public final class ScriptScanner {
    private ScriptScanner() {}

    public record Result(List<ScriptSource> scripts, List<String> errors) {}

    public static Result scanAllMods() {
        List<ScriptSource> found = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        List<ModContainer> mods = new ArrayList<>(FabricLoader.getInstance().getAllMods());
        mods.sort(Comparator.comparing(m -> m.getMetadata().getId()));
        for (ModContainer mod : mods) {
            Optional<Path> root = mod.findPath("msm");
            if (root.isEmpty() || !Files.isDirectory(root.get())) {
                continue;
            }
            String modId = mod.getMetadata().getId();
            List<Path> files;
            try (Stream<Path> walk = Files.walk(root.get())) {
                files = walk.filter(p -> p.getFileName() != null && p.getFileName().toString().endsWith(".js"))
                        .filter(p -> {
                            Path rel = root.get().relativize(p);
                            return rel.getNameCount() >= 3 && rel.getName(1).toString().equals("script");
                        })
                        .sorted(Comparator.comparing(Path::toString))
                        .toList();
            } catch (IOException e) {
                errors.add("cannot list msm/ in mod " + modId + ": " + e.getMessage());
                continue;
            }
            for (Path file : files) {
                Path rel = root.get().relativize(file);
                String namespace = rel.getName(0).toString();
                String path = rel.subpath(2, rel.getNameCount()).toString().replace('\\', '/');
                path = path.substring(0, path.length() - ".js".length());
                String fileName = "msm/" + rel.toString().replace('\\', '/');
                Identifier id;
                try {
                    id = Identifier.fromNamespaceAndPath(namespace, path);
                } catch (RuntimeException e) {
                    errors.add(fileName + " (mod " + modId + "): invalid id " + namespace + ":" + path);
                    continue;
                }
                try {
                    found.add(new ScriptSource(modId, id, fileName, Files.readString(file, StandardCharsets.UTF_8)));
                } catch (IOException | RuntimeException e) {
                    errors.add(fileName + " (mod " + modId + "): " + e.getMessage());
                }
            }
        }
        for (String error : errors) {
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, error);
        }
        return new Result(List.copyOf(found), List.copyOf(errors));
    }
}
