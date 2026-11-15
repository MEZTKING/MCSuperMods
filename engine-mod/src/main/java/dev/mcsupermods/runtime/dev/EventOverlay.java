package dev.mcsupermods.runtime.dev;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.Events;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.EffectDefinition;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import dev.mcsupermods.runtime.loader.KeyBindDefinition;
import dev.mcsupermods.runtime.loader.KeyBindParser;
import dev.mcsupermods.runtime.loader.ParseResult;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * Event overlays (ADR 0084 D6): {@code <dev folder>/overlay/msm/<ns>/<kind>/<path>.json} replaces the event action lists of
 * a definition the installed mods already registered, and nothing else. Read at server start and on every
 * {@code END_DATA_PACK_RELOAD} while dev mode is on; the new map is swapped in whole.
 *
 * <p>An overlay file is a definition file: keys it leaves out are taken from the installed definition, {@code events} is
 * taken from the overlay, and every other key it has must equal the installed one (components, triggers, properties and
 * block types are frozen at start). The merged definition goes through the definition's own parser
 * ({@link DefinitionParser}), so a component naming a missing event, an unknown action or a bad {@code trigger_event} is
 * refused. A refused file logs one error and keeps the events in use before (the previous overlay's or the jar's); a
 * removed file falls back to the jar's events. Only the kinds with events ({@link #KINDS_WITH_EVENTS}) and the dev
 * session's namespaces are read; {@code overlay/msm/<ns>/script/} is the script scanner's.
 */
public final class EventOverlay {
    /** Definition kinds with {@code events} (a subset of {@code DefinitionScanner}'s kinds). */
    public static final List<String> KINDS_WITH_EVENTS = List.of("block", "item", "entity", "effect", "key_bind");
    /**
     * Definition kinds an overlay cannot change: they have no events, or (vehicles, ADR 0090 plan limit V5) their events
     * live with a type fixed at start; HUD elements (ADR 0089 D3) are indexed by both sides at start. An overlay for one needs a restart. Keep in step with {@code DefinitionScanner}.
     */
    public static final List<String> KINDS_WITHOUT_EVENTS = List.of("potion", "particle", "biome_addition", "loot_addition", "vehicle", "hud");

    /** One applied overlay: {@code original} is the installed definition's events, matched at fire time. */
    record Entry(String kind, Identifier id, Events original, Events replacement) {}

    private static volatile Map<Identifier, List<Entry>> byId = Map.of();
    private static volatile List<String> lastErrors = List.of();

    private EventOverlay() {}

    /**
     * The events to run for {@code owner}: the overlay's when one replaced exactly these installed events, else
     * {@code events}. Without dev mode the map is empty and this returns {@code events} at once.
     */
    public static Events resolve(Identifier owner, Events events) {
        Map<Identifier, List<Entry>> map = byId;
        if (map.isEmpty()) {
            return events;
        }
        List<Entry> entries = map.get(owner);
        if (entries == null) {
            return events;
        }
        for (Entry entry : entries) {
            if (entry.original() == events || entry.original().equals(events)) {
                return entry.replacement();
            }
        }
        return events;
    }

    /** The errors of the last {@link #reload}, one per refused file (GameTests). */
    public static List<String> lastErrors() {
        return lastErrors;
    }

    /** How many definitions have overlay events now (GameTests, diagnostics). */
    public static int size() {
        return byId.values().stream().mapToInt(List::size).sum();
    }

    static void clear() {
        byId = Map.of();
        lastErrors = List.of();
    }

    /** Reads the overlay folder of {@code state} and swaps the map in. */
    static void reload(DevMode.State state) {
        Map<String, Entry> previous = new HashMap<>();
        byId.values().forEach(list -> list.forEach(e -> previous.put(key(e.kind(), e.id()), e)));
        Map<String, RawDefinition> installed = new HashMap<>();
        for (RawDefinition raw : MsmRuntime.report().definitions()) {
            installed.putIfAbsent(key(raw.kind(), raw.id()), raw);
        }
        List<String> errors = new ArrayList<>();
        Map<String, Entry> next = new LinkedHashMap<>();
        Path msm = state.overlayMsm();
        List<Path> files = List.of();
        if (Files.isDirectory(msm)) {
            try (Stream<Path> walk = Files.walk(msm)) {
                files = walk.filter(p -> p.getFileName() != null && p.getFileName().toString().endsWith(".json") && Files.isRegularFile(p))
                        .sorted(Comparator.comparing(Path::toString))
                        .toList();
            } catch (IOException e) {
                errors.add("overlay/msm: cannot list the folder: " + e.getMessage());
            }
        }
        for (Path file : files) {
            Path rel = msm.relativize(file);
            String name = "overlay/msm/" + rel.toString().replace('\\', '/');
            if (rel.getNameCount() < 3) {
                errors.add(name + ": expected overlay/msm/<namespace>/<kind>/<path>.json; ignored");
                continue;
            }
            String namespace = rel.getName(0).toString();
            String kind = rel.getName(1).toString();
            if (kind.equals("script")) {
                continue;
            }
            if (!state.info().namespaces().contains(namespace)) {
                errors.add(name + ": namespace " + namespace + " is not one of this dev session's (" + String.join(", ",
                        state.info().namespaces()) + "); ignored");
                continue;
            }
            if (KINDS_WITHOUT_EVENTS.contains(kind)) {
                errors.add(name + (kind.equals("vehicle") ? ": a vehicle type is fixed at start"
                        : kind.equals("hud") ? ": a HUD element is fixed at start" : ": a " + kind + " has no events")
                        + "; changes to it need a restart");
                continue;
            }
            if (!KINDS_WITH_EVENTS.contains(kind)) {
                errors.add(name + ": unknown kind '" + kind + "'; ignored");
                continue;
            }
            String path = rel.subpath(2, rel.getNameCount()).toString().replace('\\', '/');
            path = path.substring(0, path.length() - ".json".length());
            Identifier id = Identifier.tryBuild(namespace, path);
            if (id == null) {
                errors.add(name + ": invalid id " + namespace + ":" + path + "; ignored");
                continue;
            }
            String k = key(kind, id);
            RawDefinition jar = installed.get(k);
            String problem;
            Entry entry = null;
            if (jar == null) {
                problem = "no " + kind + " " + id + " was registered at start; a new " + kind + " needs a restart";
            } else {
                Object result = apply(kind, id, jar, file);
                if (result instanceof Entry e) {
                    entry = e;
                    problem = null;
                } else {
                    problem = (String) result;
                }
            }
            if (entry != null) {
                next.put(k, entry);
            } else {
                errors.add(name + ": " + problem + "; the events in use are kept");
                Entry kept = previous.get(k);
                if (kept != null) {
                    next.put(k, kept);
                }
            }
        }
        Map<Identifier, List<Entry>> map = new HashMap<>();
        next.values().forEach(e -> map.computeIfAbsent(e.id(), x -> new ArrayList<>()).add(e));
        map.replaceAll((id, list) -> List.copyOf(list));
        byId = Map.copyOf(map);
        lastErrors = List.copyOf(errors);
        for (String error : errors) {
            MsmRuntime.LOGGER.error("[{}] dev overlay {}", MsmRuntime.MOD_ID, error);
        }
        if (!files.isEmpty()) {
            MsmRuntime.LOGGER.info("[{}] dev overlay: events of {} definition(s) replaced; {} error(s)", MsmRuntime.MOD_ID, size(),
                    errors.size());
        }
    }

    private static String key(String kind, Identifier id) {
        return kind + " " + id;
    }

    /** An {@link Entry}, or the reason the file is refused. */
    private static Object apply(String kind, Identifier id, RawDefinition jar, Path file) {
        JsonObject overlay;
        try {
            JsonElement json = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8));
            if (!json.isJsonObject()) {
                return "top level must be an object";
            }
            overlay = json.getAsJsonObject();
        } catch (IOException | RuntimeException e) {
            return "cannot read the file: " + e.getMessage();
        }
        if (!(overlay.get("events") instanceof JsonObject)) {
            return "no events object";
        }
        List<String> changed = changedOutsideEvents(jar.json(), overlay);
        if (!changed.isEmpty()) {
            return "changes more than events (" + String.join(", ", changed) + "); components, triggers and properties need a restart";
        }
        JsonObject merged = jar.json().deepCopy();
        merged.add("events", overlay.get("events").deepCopy());
        return switch (kind) {
            case "block" -> entry(kind, id, jar.json(), merged, DefinitionParser::parseBlock, BlockDefinition::events);
            case "item" -> entry(kind, id, jar.json(), merged, DefinitionParser::parseItem, ItemDefinition::events);
            case "entity" -> entry(kind, id, jar.json(), merged, DefinitionParser::parseEntity, EntityDefinition::events);
            case "effect" -> entry(kind, id, jar.json(), merged, DefinitionParser::parseEffect, EffectDefinition::events);
            case "key_bind" -> entry(kind, id, jar.json(), merged, KeyBindParser::parse, KeyBindDefinition::events);
            default -> "unknown kind '" + kind + "'";
        };
    }

    private static <T> Object entry(String kind, Identifier id, JsonObject jarJson, JsonObject merged,
            Function<JsonElement, ParseResult<T>> parser, Function<T, Events> events) {
        ParseResult<T> before = parser.apply(jarJson);
        ParseResult<T> after = parser.apply(merged);
        if (before.definition().isEmpty()) {
            return "the installed " + kind + " did not register";
        }
        if (after.definition().isEmpty()) {
            return after.errors().isEmpty() ? "the definition does not decode" : after.errors().get(0);
        }
        Set<String> known = Set.copyOf(before.errors());
        for (String error : after.errors()) {
            if (!known.contains(error)) {
                return error;
            }
        }
        return new Entry(kind, id, events.apply(before.definition().get()), events.apply(after.definition().get()));
    }

    /** Top-level keys of {@code overlay} other than {@code events} and {@code format} that differ from {@code jar}. */
    static List<String> changedOutsideEvents(JsonObject jar, JsonObject overlay) {
        List<String> out = new ArrayList<>();
        for (String key : new TreeSet<>(overlay.keySet())) {
            if (key.equals("events") || key.equals("format")) {
                continue;
            }
            JsonElement mine = overlay.get(key);
            JsonElement theirs = jar.get(key);
            if (Objects.equals(mine, theirs)) {
                continue;
            }
            if (key.equals("components") && mine instanceof JsonObject a && theirs instanceof JsonObject b) {
                Set<String> names = new TreeSet<>(a.keySet());
                names.addAll(b.keySet());
                for (String c : names) {
                    if (!b.has(c)) {
                        out.add(c + " added");
                    } else if (!a.has(c)) {
                        out.add(c + " removed");
                    } else if (!a.get(c).equals(b.get(c))) {
                        out.add(c + " changed");
                    }
                }
            } else {
                out.add(key + (theirs == null ? " added" : " changed"));
            }
        }
        return out;
    }
}
