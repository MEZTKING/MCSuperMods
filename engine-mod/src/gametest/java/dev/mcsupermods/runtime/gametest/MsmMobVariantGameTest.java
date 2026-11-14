package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.mob.MobVariants;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BiomeTags;
import net.minecraft.util.ProblemReporter;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;

/**
 * Variants (ADR 0071 D4, B294) on the {@code vb_*} definitions in {@code msm/msm_test/entity/}: the {@code Variant}
 * save field by id, the fallback to the first variant, the weighted pick in {@code finalizeSpawn}, the biome pick,
 * inheritance and the texture accessor. The biome of a GameTest is not fixed: Loom's {@code runGameTest} runs Fabric's
 * GameTests on a dedicated server with a default (noise) world and a random seed, far from the origin (vanilla's
 * {@code GameTestServer} with its flat preset is not used), so the spawn test expects the variant of whatever biome it
 * stands in, and every other biome goes through {@link MobVariants#pick} with a matcher of a real biome holder.
 */
public class MsmMobVariantGameTest {
    private static final BlockPos AT = new BlockPos(1, 1, 1);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static <T extends Mob> EntityType<T> type(String path) {
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static MobVariants variants(Entity mob) {
        return ((MsmMob) mob).driver().variants();
    }

    private static String idOf(Entity mob) {
        return variants(mob).id().orElse("none");
    }

    private static EntityComponents.Variants component(String path) {
        return MsmEntityRegistrar.definition(type(path)).orElseThrow().components().variants().orElseThrow();
    }

    private static List<String> errorsOf(String path) {
        String file = "msm/msm_test/entity/" + path + ".json";
        return MsmRuntime.report().errors().stream().filter(e -> e.contains(file)).toList();
    }

    /** A spawn that runs {@code finalizeSpawn}, as a spawn egg does ({@code GameTestHelper.spawn} does not). */
    private static Mob spawnFinalized(GameTestHelper helper, String path) {
        Mob mob = type(path).spawn(helper.getLevel(), helper.absolutePos(AT), EntitySpawnReason.SPAWN_ITEM_USE);
        helper.assertTrue(mob != null, "no " + path + " spawned; errors " + errorsOf(path));
        return mob;
    }

    private static CompoundTag save(ServerLevel level, Entity mob) {
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        mob.saveWithoutId(out);
        return out.buildResult();
    }

    private static Mob load(ServerLevel level, String path, CompoundTag tag) {
        Mob copy = type(path).create(level, EntitySpawnReason.LOAD);
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
        return copy;
    }

    @GameTest
    public void summonedVariantKeepsItsIdThroughSaveAndLoad(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(AT);
        level.getServer().getCommands().performPrefixedCommand(
                level.getServer().createCommandSourceStack().withLevel(level).withSuppressedOutput(),
                "summon msm_test:vb_coloured " + abs.getX() + " " + abs.getY() + " " + abs.getZ()
                        + " {Variant:\"red\",Tags:[\"vb_summoned\"]}");
        List<Mob> found = helper.getEntities(type("vb_coloured")).stream()
                .map(e -> (Mob) e).filter(e -> e.entityTags().contains("vb_summoned")).toList();
        helper.assertValueEqual(found.size(), 1, "summoned vb_coloured");
        Mob mob = found.getFirst();
        helper.assertValueEqual(idOf(mob), "red", "variant after /summon");
        helper.assertValueEqual(variants(mob).variant(), 0, "red's index");
        helper.assertValueEqual(variants(mob).texture().map(Identifier::toString).orElse("none"), "msm_test:entity/vb_red", "texture");
        CompoundTag tag = save(level, mob);
        helper.assertValueEqual(tag.getStringOr(MobVariants.KEY, "missing"), "red", "saved Variant");
        Mob copy = load(level, "vb_coloured", tag);
        helper.assertValueEqual(idOf(copy), "red", "variant after load");
        // blue is second in the list: the saved id decides the index
        variants(copy).setById("blue");
        Mob blue = load(level, "vb_coloured", save(level, copy));
        helper.assertValueEqual(variants(blue).variant(), 1, "blue's index after load");
        helper.assertValueEqual(variants(blue).texture().map(Identifier::toString).orElse("none"), "msm_test:entity/vb_blue", "blue texture");
        mob.discard();
        helper.succeed();
    }

    @GameTest
    public void unknownSavedIdFallsBackToTheFirst(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Mob mob = spawnFinalized(helper, "vb_coloured");
        variants(mob).setById("blue");
        CompoundTag tag = save(level, mob);
        tag.putString(MobVariants.KEY, "purple");
        Mob copy = load(level, "vb_coloured", tag);
        helper.assertValueEqual(idOf(copy), "red", "unknown id loads as the first variant");
        helper.assertValueEqual(variants(copy).variant(), 0, "index");
        mob.discard();
        helper.succeed();
    }

    @GameTest
    public void weightedPickOnlyPicksListedIds(GameTestHelper helper) {
        Map<String, Integer> counts = new HashMap<>();
        for (int i = 0; i < 50; i++) {
            Mob mob = spawnFinalized(helper, "vb_coloured");
            counts.merge(idOf(mob), 1, Integer::sum);
            mob.discard();
        }
        helper.assertTrue(counts.keySet().stream().allMatch(k -> k.equals("red") || k.equals("blue")), "picked ids " + counts);
        // weights 1 and 3: missing either over 50 spawns has a chance below 1e-6
        helper.assertTrue(counts.containsKey("red") && counts.containsKey("blue"), "both picked " + counts);
        // the pure pick with a fixed seed: 4000 draws land near 1:3
        EntityComponents.Variants component = component("vb_coloured");
        RandomSource random = RandomSource.create(42);
        int blue = 0;
        for (int i = 0; i < 4000; i++) {
            blue += MobVariants.pick(component, null, random);
        }
        helper.assertTrue(blue > 2800 && blue < 3200, "blue picks of 4000 (weight 3 of 4): " + blue);
        helper.succeed();
    }

    @GameTest
    public void mobWithoutVariantsSavesNothing(GameTestHelper helper) {
        Mob mob = spawnFinalized(helper, "minimal");
        helper.assertTrue(variants(mob).texture().isEmpty(), "minimal has a variant texture");
        helper.assertFalse(save(helper.getLevel(), mob).contains(MobVariants.KEY), "minimal saved a Variant");
        mob.discard();
        helper.succeed();
    }

    @GameTest
    public void biomeVariantIsPickedInItsBiome(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Holder<Biome> here = level.getBiome(helper.absolutePos(AT));
        // vb_biome: sand in minecraft:desert, grass in minecraft:plains or #minecraft:is_jungle, else the fallback
        String expected = here.is(Biomes.DESERT) ? "sand"
                : here.is(Biomes.PLAINS) || here.is(BiomeTags.IS_JUNGLE) ? "grass" : "fallback";
        for (int i = 0; i < 30; i++) {
            Mob mob = spawnFinalized(helper, "vb_biome");
            helper.assertValueEqual(idOf(mob), expected, "variant in " + here.getRegisteredName());
            mob.discard();
        }
        EntityComponents.Variants component = component("vb_biome");
        RandomSource random = RandomSource.create(7);
        HolderLookup.RegistryLookup<Biome> biomes = level.registryAccess().lookupOrThrow(Registries.BIOME);
        helper.assertTrue(biomes.getOrThrow(Biomes.JUNGLE).is(BiomeTags.IS_JUNGLE), "jungle is in #minecraft:is_jungle");
        Predicate<String> desert = MobVariants.biomeMatcher(biomes.getOrThrow(Biomes.DESERT));
        Predicate<String> jungle = MobVariants.biomeMatcher(biomes.getOrThrow(Biomes.JUNGLE));
        Predicate<String> ocean = MobVariants.biomeMatcher(biomes.getOrThrow(Biomes.OCEAN));
        for (int i = 0; i < 30; i++) {
            helper.assertValueEqual(MobVariants.pick(component, desert, random), 0, "desert picks sand");
            helper.assertValueEqual(MobVariants.pick(component, jungle, random), 1, "#minecraft:is_jungle picks grass");
            helper.assertValueEqual(MobVariants.pick(component, ocean, random), 2, "no match picks the fallback pool");
        }
        helper.succeed();
    }

    @GameTest
    public void savedVariantIsNotRepickedBySpawn(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Mob mob = spawnFinalized(helper, "vb_biome");
        CompoundTag tag = save(level, mob);
        tag.putString(MobVariants.KEY, "sand");
        Mob copy = load(level, "vb_biome", tag);
        copy.finalizeSpawn(level, level.getCurrentDifficultyAt(helper.absolutePos(AT)), EntitySpawnReason.COMMAND, null);
        helper.assertValueEqual(idOf(copy), "sand", "finalizeSpawn after load keeps the saved variant");
        mob.discard();
        helper.succeed();
    }

    @GameTest
    public void babyInheritsAParentsVariant(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Mob red = spawnFinalized(helper, "vb_coloured");
        Mob blue = spawnFinalized(helper, "vb_coloured");
        variants(red).setById("red");
        variants(blue).setById("blue");
        Map<String, Integer> counts = new HashMap<>();
        for (int i = 0; i < 40; i++) {
            Mob child = type("vb_coloured").create(level, EntitySpawnReason.BREEDING);
            variants(child).inheritFrom(red, blue);
            counts.merge(idOf(child), 1, Integer::sum);
        }
        helper.assertTrue(counts.containsKey("red") && counts.containsKey("blue") && counts.size() == 2,
                "children take either parent's variant: " + counts);
        Mob lone = type("vb_coloured").create(level, EntitySpawnReason.BREEDING);
        variants(lone).inheritFrom(blue, type("minimal").create(level, EntitySpawnReason.BREEDING));
        helper.assertValueEqual(idOf(lone), "blue", "a parent of another type is skipped");
        red.discard();
        blue.discard();
        helper.succeed();
    }
}
