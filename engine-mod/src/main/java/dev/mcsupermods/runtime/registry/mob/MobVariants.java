package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Variants, ADR 0071 D4 ({@code msm:variants}). The variant is an index into the definition's list, kept in the body's
 * {@code DATA_VARIANT} (synched, so the client's renderer sees it) and saved as the variant's {@code id} string under
 * {@code Variant}, so {@code /summon <id> ~ ~ ~ {Variant:"red"}} and {@code /data} work and reordering the list does not
 * repaint saved mobs; an unknown saved id falls back to the first variant. The pick runs in {@code finalizeSpawn}
 * (natural, egg, spawner or command spawn without data); a mob that already has a variant from saved data or a parent
 * is never re-picked. Babies take a random parent's variant through {@link #inheritFrom}. A mob without the component
 * saves nothing and its index stays 0.
 */
public final class MobVariants {
    /** The save key (ADR 0071 D4). */
    public static final String KEY = "Variant";

    private final MsmMob mob;
    private final EntityDefinition definition;
    /** Set once a variant came from saved data, a parent or a pick, so a later {@code finalizeSpawn} keeps it. */
    private boolean chosen;

    MobVariants(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    private Optional<EntityComponents.Variants> component() {
        return definition == null ? Optional.empty() : definition.components().variants();
    }

    /** The variant index ({@code DATA_VARIANT}). */
    public int variant() {
        return mob.asMob().getEntityData().get(mob.variantData());
    }

    /** The current variant (an index out of range reads as the first); empty without {@code msm:variants}. */
    public Optional<EntityComponents.Variant> current() {
        return component().map(c -> c.variants().get(clamp(variant(), c.variants().size())));
    }

    /** The current variant's id; empty without {@code msm:variants}. */
    public Optional<String> id() {
        return current().map(EntityComponents.Variant::id);
    }

    /**
     * The texture both renderers draw in place of {@code msm:animated_model.texture} (ADR 0071 D4); empty without
     * {@code msm:variants}. Works on both sides: the index is synched and the definition is read on each side.
     */
    public Optional<Identifier> texture() {
        return current().map(EntityComponents.Variant::texture);
    }

    /** Sets the variant by index (out of range: the first); ignored without {@code msm:variants}. */
    public void set(int index) {
        component().ifPresent(c -> {
            mob.asMob().getEntityData().set(mob.variantData(), clamp(index, c.variants().size()));
            chosen = true;
        });
    }

    /** Sets the variant by id; an unknown id selects the first variant. Ignored without {@code msm:variants}. */
    public void setById(String id) {
        component().ifPresent(c -> set(indexOf(c.variants(), id)));
    }

    /**
     * The call {@code MobBreeding} makes for a baby (ADR 0071 D2; on the child, after {@code getBreedOffspring}): the
     * child takes the variant of one of the two parents, picked at random with the child's random source. A parent that
     * is not a runtime mob of the child's type is skipped; when neither is, the child keeps what it has.
     */
    public void inheritFrom(Entity first, Entity second) {
        if (component().isEmpty()) {
            return;
        }
        List<MsmMob> parents = new ArrayList<>(2);
        for (Entity parent : new Entity[] {first, second}) {
            if (parent instanceof MsmMob p && parent.getType() == mob.asMob().getType()) {
                parents.add(p);
            }
        }
        if (!parents.isEmpty()) {
            MsmMob parent = parents.get(mob.asMob().getRandom().nextInt(parents.size()));
            set(parent.driver().variants().variant());
        }
    }

    /** Before {@code msm:on_spawn}: picks the variant unless the mob already has one (saved data, a parent). */
    public void finalizeSpawn(ServerLevelAccessor accessor, DifficultyInstance difficulty, EntitySpawnReason reason) {
        if (chosen) {
            return;
        }
        component().ifPresent(c -> {
            Predicate<String> matches = c.choose() == EntityComponents.VariantChoice.BIOME
                    ? biomeMatcher(accessor.getBiome(mob.asMob().blockPosition()))
                    : null;
            set(pick(c, matches, mob.asMob().getRandom()));
        });
    }

    public void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {}

    public void addAdditionalSaveData(ValueOutput output) {
        id().ifPresent(id -> output.putString(KEY, id));
    }

    /** A saved {@code Variant} wins (unknown: the first); without the key the mob keeps its index. */
    public void readAdditionalSaveData(ValueInput input) {
        input.getString(KEY).ifPresent(this::setById);
    }

    // Pure helpers, public for the GameTests

    /** Index of the variant with {@code id}, or 0 (the first) when none has it. */
    public static int indexOf(List<EntityComponents.Variant> variants, String id) {
        for (int i = 0; i < variants.size(); i++) {
            if (variants.get(i).id().equals(id)) {
                return i;
            }
        }
        return 0;
    }

    /**
     * The pick of ADR 0071 D4. {@code matches} null ({@code choose: random}): a weighted pick over every variant.
     * {@code choose: biome} ({@code matches} tests one {@code biomes} entry against the spawn position's biome): a
     * weighted pick among the variants with a matching entry; when none matches, among the variants without
     * {@code biomes} (the fallback pool); when there are none of those either, among every variant.
     */
    public static int pick(EntityComponents.Variants component, Predicate<String> matches, RandomSource random) {
        List<EntityComponents.Variant> all = component.variants();
        List<Integer> pool = new ArrayList<>();
        if (matches != null) {
            for (int i = 0; i < all.size(); i++) {
                if (all.get(i).biomes().stream().anyMatch(matches)) {
                    pool.add(i);
                }
            }
            if (pool.isEmpty()) {
                for (int i = 0; i < all.size(); i++) {
                    if (all.get(i).biomes().isEmpty()) {
                        pool.add(i);
                    }
                }
            }
        }
        if (pool.isEmpty()) {
            for (int i = 0; i < all.size(); i++) {
                pool.add(i);
            }
        }
        int total = 0;
        for (int i : pool) {
            total += weight(all.get(i));
        }
        int roll = random.nextInt(total);
        for (int i : pool) {
            roll -= weight(all.get(i));
            if (roll < 0) {
                return i;
            }
        }
        return pool.getLast();
    }

    /** Matches a {@code biomes} entry ({@code #}-prefixed biome tag or biome id, as written) against one biome. */
    public static Predicate<String> biomeMatcher(Holder<Biome> biome) {
        return entry -> {
            Identifier id = Identifier.tryParse(entry.startsWith("#") ? entry.substring(1) : entry);
            if (id == null) {
                return false; // the Codec already checked the form; a stray entry simply does not match
            }
            return entry.startsWith("#") ? biome.is(TagKey.create(Registries.BIOME, id)) : biome.is(id);
        };
    }

    /** The Codec keeps weights at 1 or more; guard anyway so a pick never divides by nothing. */
    private static int weight(EntityComponents.Variant variant) {
        return Math.max(1, variant.weight());
    }

    private static int clamp(int index, int size) {
        return index < 0 || index >= size ? 0 : index;
    }
}
