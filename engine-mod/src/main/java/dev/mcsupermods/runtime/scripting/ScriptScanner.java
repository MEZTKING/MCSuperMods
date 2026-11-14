package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.dev.DevMode;
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

/**
 * Finds {@code msm/<namespace>/script/**}{@code /*.js} in every mod container, in mod id then path order. In dev mode
 * (ADR 0084 D6) the dev folder's {@code overlay/msm/<ns>/script/**}{@code /*.js} of the session's namespaces follow: a
 * script with the id of a jar script takes its place (and its mod), a new id is added after the jar scripts.
 */
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
        DevMode.State dev = DevMode.current();
        if (dev != null) {
            addOverlay(dev, mods, found, errors);
        }
        for (String error : errors) {
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, error);
        }
        return new Result(List.copyOf(found), List.copyOf(errors));
    }

    private static void addOverlay(DevMode.State dev, List<ModContainer> mods, List<ScriptSource> found, List<String> errors) {
        Path root = dev.overlayMsm();
        if (!Files.isDirectory(root)) {
            return;
        }
        List<Path> files;
        try (Stream<Path> walk = Files.walk(root)) {
            files = walk.filter(p -> p.getFileName() != null && p.getFileName().toString().endsWith(".js") && Files.isRegularFile(p))
                    .filter(p -> {
                        Path rel = root.relativize(p);
                        return rel.getNameCount() >= 3 && rel.getName(1).toString().equals("script");
                    })
                    .sorted(Comparator.comparing(Path::toString))
                    .toList();
        } catch (IOException e) {
            errors.add("msm-dev/overlay/msm: cannot list the folder: " + e.getMessage());
            return;
        }
        for (Path file : files) {
            Path rel = root.relativize(file);
            String namespace = rel.getName(0).toString();
            String fileName = "msm-dev/overlay/msm/" + rel.toString().replace('\\', '/');
            if (!dev.info().namespaces().contains(namespace)) {
                errors.add(fileName + ": namespace " + namespace + " is not one of this dev session's; ignored");
                continue;
            }
            String path = rel.subpath(2, rel.getNameCount()).toString().replace('\\', '/');
            path = path.substring(0, path.length() - ".js".length());
            Identifier id = Identifier.tryBuild(namespace, path);
            if (id == null) {
                errors.add(fileName + ": invalid id " + namespace + ":" + path);
                continue;
            }
            String source;
            try {
                source = Files.readString(file, StandardCharsets.UTF_8);
            } catch (IOException | RuntimeException e) {
                errors.add(fileName + ": " + e.getMessage());
                continue;
            }
            int at = -1;
            for (int n = 0; n < found.size(); n++) {
                if (found.get(n).id().equals(id)) {
                    at = n;
                    break;
                }
            }
            if (at >= 0) {
                found.set(at, new ScriptSource(found.get(at).modId(), id, fileName, source));
            } else {
                found.add(new ScriptSource(modFor(namespace, mods, found), id, fileName, source));
            }
        }
    }

    /** The mod of a new overlay script: the mod of another script of its namespace, else a mod with msm/<ns>, else the runtime. */
    private static String modFor(String namespace, List<ModContainer> mods, List<ScriptSource> found) {
        for (ScriptSource s : found) {
            if (s.id().getNamespace().equals(namespace)) {
                return s.modId();
            }
        }
        for (ModContainer mod : mods) {
            Optional<Path> dir = mod.findPath("msm/" + namespace);
            if (dir.isPresent() && Files.isDirectory(dir.get())) {
                return mod.getMetadata().getId();
            }
        }
        return MsmRuntime.MOD_ID;
    }
}
