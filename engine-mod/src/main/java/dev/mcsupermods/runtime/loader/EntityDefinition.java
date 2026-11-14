package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.datafixers.util.Either;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventDefinition;
import dev.mcsupermods.runtime.events.Events;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import net.minecraft.resources.Identifier;

/**
 * Entity definition v1 ({@code ::msm::definition::Entity}, ADR 0028 D2). The enums are the
 * runtime's own (like {@link MsmRarity}) so that parsing touches no game class with registry
 * state; the registrar maps them onto the vanilla constants of the same name.
 *
 * @param spawnEgg the spawn egg; empty when the file says {@code "spawn_egg": false}
 * @param sounds   the mob sounds (ADR 0057 D6); empty, or an absent field inside, means vanilla's
 */
public record EntityDefinition(
        int format,
        Base base,
        Category category,
        Size size,
        Optional<Float> eyeHeight,
        Optional<Identifier> lootTable,
        Optional<SpawnEgg> spawnEgg,
        Optional<Spawn> spawn,
        EntityComponents components,
        Events events,
        Optional<Sounds> sounds) {

    public static final List<String> KEYS = List.of("format", "base", "category", "size", "eye_height", "loot_table", "spawn_egg", "spawn",
            "components", "events", "sounds");

    /** The GeckoLib controller that {@code play_animation} uses by default and that plays the {@code attack} animation. */
    public static final String TRIGGERED_CONTROLLER = "msm_triggered";
    /** The GeckoLib controller that loops {@code idle} and {@code walk}. */
    public static final String MAIN_CONTROLLER = "msm_main";

    /**
     * The vanilla class the mob builds on (ADR 0070 D1, {@code ::msm::definition::EntityBase}); absent means {@link #MOB},
     * the {@code PathfinderMob} of every entity before ADR 0070. The registrar picks the body class from it.
     */
    public enum Base {
        MOB, ANIMAL, MONSTER;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Base> CODEC = MsmCodecs.named("entity base", values(), Base::serialName);
    }

    /** {@code MobCategory} in lower case; each maps onto the vanilla constant of the same name. */
    public enum Category {
        MONSTER, CREATURE, AMBIENT, WATER_CREATURE, WATER_AMBIENT, UNDERGROUND_WATER_CREATURE, AXOLOTLS, MISC;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Category> CODEC = MsmCodecs.named("mob category", values(), Category::serialName);
    }

    /** {@code SpawnPlacementTypes}. */
    public enum Placement {
        ON_GROUND, IN_WATER, IN_LAVA, NO_RESTRICTIONS;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Placement> CODEC = MsmCodecs.named("spawn placement", values(), Placement::serialName);
    }

    /** {@code Heightmap.Types}. */
    public enum HeightmapType {
        MOTION_BLOCKING_NO_LEAVES, MOTION_BLOCKING, WORLD_SURFACE, OCEAN_FLOOR;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<HeightmapType> CODEC = MsmCodecs.named("heightmap", values(), HeightmapType::serialName);
    }

    /**
     * The vanilla spawn check of a natural spawn. {@code animal} and {@code water_animal} (ADR 0070 D6) repeat vanilla's
     * class-bound checks for any base.
     */
    public enum Rule {
        MOB, MONSTER, SURFACE_MONSTER, ANY_LIGHT_MONSTER, ALWAYS, ANIMAL, WATER_ANIMAL;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Rule> CODEC = MsmCodecs.named("spawn rule", values(), Rule::serialName);
    }

    /** Hitbox in blocks. */
    public record Size(float width, float height) {
        public static final Codec<Size> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("width", floatRange(0.1f, 8.0f)).forGetter(Size::width),
                required("height", floatRange(0.1f, 8.0f)).forGetter(Size::height)).apply(i, Size::new));
    }

    /** The spawn egg {@code <ns>:<path>_spawn_egg}; absent tab means {@code minecraft:spawn_eggs}. */
    public record SpawnEgg(Optional<Identifier> creativeTab) {
        public static final SpawnEgg DEFAULT = new SpawnEgg(Optional.empty());
        public static final Codec<SpawnEgg> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("creative_tab", ID).forGetter(SpawnEgg::creativeTab)).apply(i, SpawnEgg::new));
    }

    /**
     * Mob sounds (ADR 0057 D6, {@code ::msm::definition::EntitySounds}): sound event ids, vanilla or project keys,
     * resolved when played (an unknown id keeps vanilla's sound and is a warning after start-up); the ambient interval
     * in ticks, at least 20. Unknown keys are errors (the struct is closed).
     */
    public record Sounds(Optional<Identifier> ambient, Optional<Identifier> hurt, Optional<Identifier> death, Optional<Identifier> step,
            Optional<Integer> ambientIntervalTicks) {
        public static final List<String> KEYS = List.of("ambient", "hurt", "death", "step", "ambient_interval_ticks");
        public static final Codec<Sounds> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("ambient", ID).forGetter(Sounds::ambient),
                optional("hurt", ID).forGetter(Sounds::hurt),
                optional("death", ID).forGetter(Sounds::death),
                optional("step", ID).forGetter(Sounds::step),
                optional("ambient_interval_ticks", intAtLeast(20)).forGetter(Sounds::ambientIntervalTicks)).apply(i, Sounds::new)), KEYS);

        /** The ids named, for the start-up check. */
        public List<Identifier> ids() {
            return java.util.stream.Stream.of(ambient, hurt, death, step).flatMap(Optional::stream).toList();
        }
    }

    /** A biome id, or a biome tag written {@code #ns:path}. */
    private static final Codec<String> BIOME = Codec.STRING.validate(s -> Identifier.tryParse(s.startsWith("#") ? s.substring(1) : s) != null
            ? DataResult.success(s)
            : DataResult.error(() -> "invalid biome or biome tag '" + s + "'"));

    /** Natural spawning; {@code biomes} entries starting with {@code #} are tags, the others ids, and the spawn applies to their union. */
    public record Spawn(List<String> biomes, int weight, int minGroup, int maxGroup, Placement placement, HeightmapType heightmap,
            Rule rule) {
        public static final Codec<Spawn> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("biomes", BIOME.listOf()).forGetter(Spawn::biomes),
                required("weight", intAtLeast(1)).forGetter(Spawn::weight),
                required("min_group", intAtLeast(1)).forGetter(Spawn::minGroup),
                required("max_group", intAtLeast(1)).forGetter(Spawn::maxGroup),
                optional("placement", Placement.CODEC, Placement.ON_GROUND).forGetter(Spawn::placement),
                optional("heightmap", HeightmapType.CODEC, HeightmapType.MOTION_BLOCKING_NO_LEAVES).forGetter(Spawn::heightmap),
                optional("rule", Rule.CODEC, Rule.MOB).forGetter(Spawn::rule)).apply(i, Spawn::new));
    }

    /** {@code SpawnEgg | false}: {@code false} is no egg; {@code true} is an error. */
    private static final Codec<Optional<SpawnEgg>> SPAWN_EGG = Codec.either(Codec.BOOL, SpawnEgg.CODEC).comapFlatMap(
            either -> either.map(
                    b -> b ? DataResult.error(() -> "must be an object or false") : DataResult.success(Optional.<SpawnEgg>empty()),
                    s -> DataResult.success(Optional.of(s))),
            opt -> opt.<Either<Boolean, SpawnEgg>>map(Either::right).orElse(Either.left(false)));

    public static final Codec<EntityDefinition> CODEC = RecordCodecBuilder.create(i -> i.group(
            required("format", intRange(1, 1)).forGetter(EntityDefinition::format),
            optional("base", Base.CODEC, Base.MOB).forGetter(EntityDefinition::base),
            required("category", Category.CODEC).forGetter(EntityDefinition::category),
            required("size", Size.CODEC).forGetter(EntityDefinition::size),
            optional("eye_height", floatAtLeast(0)).forGetter(EntityDefinition::eyeHeight),
            optional("loot_table", ID).forGetter(EntityDefinition::lootTable),
            optional("spawn_egg", SPAWN_EGG, Optional.of(SpawnEgg.DEFAULT)).forGetter(EntityDefinition::spawnEgg),
            optional("spawn", Spawn.CODEC).forGetter(EntityDefinition::spawn),
            required("components", EntityComponents.CODEC).forGetter(EntityDefinition::components),
            optional("events", Events.CODEC, Events.NONE).forGetter(EntityDefinition::events),
            optional("sounds", Sounds.CODEC).forGetter(EntityDefinition::sounds)).apply(i, EntityDefinition::new));

    /** A copy with other components (the parser drops components the base does not allow). */
    public EntityDefinition withComponents(EntityComponents other) {
        return new EntityDefinition(format, base, category, size, eyeHeight, lootTable, spawnEgg, spawn, other, events, sounds);
    }

    /**
     * Animation names to register as triggerable, by controller: the {@code idle}, {@code walk} and
     * {@code attack} names on {@link #TRIGGERED_CONTROLLER}, plus every {@code play_animation} name on
     * its controller. Whether a name exists in the animation file is not known on the server
     * (GeckoLib reads animations on the client); an unknown name plays nothing.
     */
    public Map<String, Set<String>> triggerableAnimations() {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        Set<String> triggered = out.computeIfAbsent(TRIGGERED_CONTROLLER, k -> new LinkedHashSet<>());
        EntityComponents.AnimatedModel model = components.animatedModel();
        model.idle().ifPresent(triggered::add);
        model.walk().ifPresent(triggered::add);
        model.attack().ifPresent(triggered::add);
        for (EventDefinition event : events.byId().values()) {
            for (Action action : event.actions()) {
                if (action instanceof Action.PlayAnimation p) {
                    out.computeIfAbsent(p.controller(), k -> new LinkedHashSet<>()).add(p.animation());
                }
            }
        }
        return out;
    }
}
