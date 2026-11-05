package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.MobCategory;

/**
 * Spike parser for {@code msm/<ns>/entity/*.json} (B110, ADR 0028 D2 subset), Gson only, like the
 * Phase 4 spike. B113 replaces it with Codecs aligned with {@code definition.mcdoc}.
 */
public record EntitySpikeDefinition(
        MobCategory category,
        float width,
        float height,
        double maxHealth,
        double speed,
        double attackDamage,
        List<Goal> goals,
        Optional<AnimatedModel> animatedModel,
        Optional<Spawn> spawn,
        boolean spawnEgg) {

    /** One AI goal of the spike subset. */
    public sealed interface Goal {
        record Wander(double speed) implements Goal {}

        record LookAtPlayer(float distance) implements Goal {}

        record MeleeAttack(double speed, List<Identifier> targets) implements Goal {}
    }

    public record AnimatedModel(Identifier model, Optional<Identifier> animations, Identifier texture, String idle, String walk,
            String attack) {}

    public record Spawn(List<String> biomes, int weight, int minGroup, int maxGroup) {}

    public static EntitySpikeDefinition parse(JsonObject json) throws DefinitionException {
        int format = integer(json, "format", -1);
        if (format != 1) {
            throw new DefinitionException("format " + format + " is not supported (this runtime reads format 1)");
        }
        String categoryName = string(json, "category", "creature");
        MobCategory category;
        try {
            category = MobCategory.valueOf(categoryName.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new DefinitionException("category: unknown mob category '" + categoryName + "'");
        }
        JsonObject size = object(json, "size").orElseThrow(() -> new DefinitionException("size: missing"));
        float width = (float) number(size, "width", -1);
        float height = (float) number(size, "height", -1);
        if (width <= 0 || height <= 0) {
            throw new DefinitionException("size: width and height must be positive");
        }
        JsonObject components = object(json, "components").orElse(new JsonObject());
        double maxHealth = object(components, "msm:health").map(o -> number(o, "max", 20)).orElse(20.0);
        double speed = object(components, "msm:movement").map(o -> number(o, "speed", 0.25)).orElse(0.25);
        double damage = object(components, "msm:attack").map(o -> number(o, "damage", 0)).orElse(0.0);

        List<Goal> goals = new ArrayList<>();
        Optional<JsonObject> ai = object(components, "msm:ai_goals");
        if (ai.isPresent() && ai.get().get("goals") instanceof JsonArray list) {
            for (JsonElement e : list) {
                if (!(e instanceof JsonObject goal)) {
                    throw new DefinitionException("msm:ai_goals: goals: entries must be objects");
                }
                String type = string(goal, "type", "");
                goals.add(switch (type) {
                    case "wander" -> new Goal.Wander(number(goal, "speed", 1.0));
                    case "look_at_player" -> new Goal.LookAtPlayer((float) number(goal, "distance", 8.0));
                    case "melee_attack" -> new Goal.MeleeAttack(number(goal, "speed", 1.0), ids(goal, "targets"));
                    default -> throw new DefinitionException("msm:ai_goals: goals: type '" + type + "' is not in the spike subset");
                });
            }
        }

        Optional<AnimatedModel> model = Optional.empty();
        Optional<JsonObject> m = object(components, "msm:animated_model");
        if (m.isPresent()) {
            JsonObject o = m.get();
            Identifier modelId = id(o, "model").orElseThrow(() -> new DefinitionException("msm:animated_model: model: missing"));
            Identifier texture = id(o, "texture").orElseThrow(() -> new DefinitionException("msm:animated_model: texture: missing"));
            model = Optional.of(new AnimatedModel(modelId, id(o, "animations"), texture, string(o, "idle", "idle"),
                    string(o, "walk", "walk"), string(o, "attack", "attack")));
        }

        Optional<Spawn> spawn = Optional.empty();
        Optional<JsonObject> s = object(json, "spawn");
        if (s.isPresent()) {
            JsonObject o = s.get();
            List<String> biomes = new ArrayList<>();
            if (o.get("biomes") instanceof JsonArray arr) {
                arr.forEach(b -> biomes.add(b.getAsString()));
            }
            spawn = Optional.of(new Spawn(List.copyOf(biomes), integer(o, "weight", 1), integer(o, "min_group", 1),
                    integer(o, "max_group", 1)));
        }
        boolean egg = !(json.get("spawn_egg") instanceof JsonPrimitive p && p.isBoolean() && !p.getAsBoolean());
        return new EntitySpikeDefinition(category, width, height, maxHealth, speed, damage, List.copyOf(goals), model, spawn, egg);
    }

    private static Optional<JsonObject> object(JsonObject parent, String key) {
        return parent.get(key) instanceof JsonObject o ? Optional.of(o) : Optional.empty();
    }

    private static String string(JsonObject o, String key, String fallback) {
        return o.get(key) instanceof JsonPrimitive p && p.isString() ? p.getAsString() : fallback;
    }

    private static double number(JsonObject o, String key, double fallback) {
        return o.get(key) instanceof JsonPrimitive p && p.isNumber() ? p.getAsDouble() : fallback;
    }

    private static int integer(JsonObject o, String key, int fallback) {
        return o.get(key) instanceof JsonPrimitive p && p.isNumber() ? p.getAsInt() : fallback;
    }

    private static Optional<Identifier> id(JsonObject o, String key) throws DefinitionException {
        if (!(o.get(key) instanceof JsonPrimitive p && p.isString())) {
            return Optional.empty();
        }
        Identifier parsed = Identifier.tryParse(p.getAsString());
        if (parsed == null) {
            throw new DefinitionException(key + ": invalid id '" + p.getAsString() + "'");
        }
        return Optional.of(parsed);
    }

    private static List<Identifier> ids(JsonObject o, String key) throws DefinitionException {
        List<Identifier> out = new ArrayList<>();
        if (o.get(key) instanceof JsonArray arr) {
            for (JsonElement e : arr) {
                Identifier parsed = Identifier.tryParse(e.getAsString());
                if (parsed == null) {
                    throw new DefinitionException(key + ": invalid id '" + e.getAsString() + "'");
                }
                out.add(parsed);
            }
        }
        return List.copyOf(out);
    }
}
