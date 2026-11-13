package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
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
import java.util.TreeSet;
import java.util.stream.Stream;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.metadata.ModDependency;
import net.minecraft.resources.Identifier;

/**
 * Finds the sound event keys of {@code assets/<ns>/sounds.json} (ADR 0057 D1, D2). A mod opts in when it has an
 * {@code msm/} folder or declares {@code depends} on {@code msm_runtime}; every content jar does both. Keys of the
 * namespace {@code minecraft} are skipped silently (overrides of vanilla sounds stay resource-pack only); an invalid
 * id or an unreadable file is a warning. The result is sorted, so client and server register the same ids in the
 * same order.
 */
public final class SoundScanner {
    /** The resource pack file this scanner reads, per namespace. */
    public static final String FILE = "sounds.json";

    /** One {@code sounds.json}: {@code where} names it in warnings. */
    public record Source(String namespace, String where, JsonElement json) {}

    /** The sorted, distinct ids found, and warnings for what was skipped. */
    public record Keys(List<Identifier> ids, List<String> warnings) {}

    private SoundScanner() {}

    /**
     * Pure: the sound event ids of the given files. A key appearing in several files (or several mods) is one id. A
     * file whose top level is not an object, an invalid namespace and an invalid key are warnings; the namespace
     * {@code minecraft} is skipped without one.
     */
    public static Keys read(List<Source> sources) {
        TreeSet<Identifier> ids = new TreeSet<>();
        List<String> warnings = new ArrayList<>();
        for (Source source : sources) {
            if (source.namespace().equals(Identifier.DEFAULT_NAMESPACE)) {
                continue;
            }
            if (!Identifier.isValidNamespace(source.namespace())) {
                warnings.add(source.where() + ": invalid namespace '" + source.namespace() + "'; no sound events registered from it");
                continue;
            }
            if (!(source.json() instanceof JsonObject object)) {
                warnings.add(source.where() + ": top level must be an object; no sound events registered from it");
                continue;
            }
            for (String key : new TreeSet<>(object.keySet())) {
                Identifier id = Identifier.tryBuild(source.namespace(), key);
                if (id == null) {
                    warnings.add(source.where() + ": invalid sound event id " + source.namespace() + ":" + key + "; skipped");
                    continue;
                }
                ids.add(id);
            }
        }
        return new Keys(List.copyOf(ids), List.copyOf(warnings));
    }

    /** Whether the runtime reads this mod's {@code sounds.json} files. */
    static boolean optsIn(ModContainer mod) {
        Optional<Path> msm = mod.findPath("msm");
        if (msm.isPresent() && Files.isDirectory(msm.get())) {
            return true;
        }
        for (ModDependency dependency : mod.getMetadata().getDependencies()) {
            if (dependency.getKind() == ModDependency.Kind.DEPENDS && dependency.getModId().equals(MsmRuntime.MOD_ID)) {
                return true;
            }
        }
        return false;
    }

    /** Reads {@code assets/<ns>/sounds.json} of every opted-in mod, in mod id then namespace order. */
    public static Keys scanAllMods() {
        List<Source> sources = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<ModContainer> mods = new ArrayList<>(FabricLoader.getInstance().getAllMods());
        mods.sort(Comparator.comparing(m -> m.getMetadata().getId()));
        for (ModContainer mod : mods) {
            String modId = mod.getMetadata().getId();
            if (modId.equals(MsmRuntime.MOD_ID) || !optsIn(mod)) {
                continue;
            }
            Optional<Path> assets = mod.findPath("assets");
            if (assets.isEmpty() || !Files.isDirectory(assets.get())) {
                continue;
            }
            List<Path> namespaces;
            try (Stream<Path> list = Files.list(assets.get())) {
                namespaces = list.filter(Files::isDirectory)
                        .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                        .toList();
            } catch (IOException e) {
                warnings.add("cannot list assets/ in mod " + modId + ": " + e.getMessage());
                continue;
            }
            for (Path dir : namespaces) {
                String namespace = dir.getFileName().toString();
                Path file = dir.resolve(FILE);
                if (!Files.isRegularFile(file)) {
                    continue;
                }
                String where = "assets/" + namespace + "/" + FILE + " (mod " + modId + ")";
                try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                    sources.add(new Source(namespace, where, JsonParser.parseReader(reader)));
                } catch (IOException | RuntimeException e) {
                    warnings.add(where + ": " + e.getMessage() + "; no sound events registered from it");
                }
            }
        }
        Keys keys = read(sources);
        warnings.addAll(keys.warnings());
        for (String warning : warnings) {
            MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, warning);
        }
        return new Keys(keys.ids(), List.copyOf(warnings));
    }
}
