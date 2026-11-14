package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.ComponentPassthrough;
import dev.mcsupermods.runtime.registry.MsmAdditions;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.fabricmc.fabric.api.loot.v3.LootTableSource;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.HolderSet;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.random.Weighted;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.Compostable;
import net.minecraft.world.item.component.CookingFuel;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.block.AbstractFurnaceBlock;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ComposterBlock;
import net.minecraft.world.level.block.entity.AbstractFurnaceBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.GenerationStep;
import net.minecraft.world.level.levelgen.placement.PlacedFeature;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.attribute.EnvironmentAttributes;

/**
 * Additions to vanilla content (ADR 0060) on {@code msm/msm_test/biome_addition/*.json},
 * {@code msm/msm_test/loot_addition/*.json}, the item {@code fuel_gem} and the block {@code fuel_block}: placed features
 * in the selected biomes only (by id and by tag), a vanilla mob's spawn, late warnings for unknown ids with the server
 * still running, extra drops in the zombie table next to its vanilla pools, the source rule, a broken pool, and fuel and
 * compost components through {@code msm:components} on an item and on a block item.
 */
public class MsmAdditionGameTest {
    private static final BlockPos AT = new BlockPos(1, 1, 1);
    private static final ResourceKey<LootTable> ZOMBIE = table("entities/zombie");
    /** Vanilla 26.3 and 26.4 zombie tables have four pools (rotten flesh, mushroom, rare drops, music disc). */
    private static final int VANILLA_ZOMBIE_POOLS = 4;

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static ResourceKey<LootTable> table(String path) {
        return ResourceKey.create(Registries.LOOT_TABLE, Identifier.withDefaultNamespace(path));
    }

    private static Biome biome(GameTestHelper helper, ResourceKey<Biome> key) {
        return helper.getLevel().registryAccess().lookupOrThrow(Registries.BIOME).getOrThrow(key).value();
    }

    private static boolean hasFeature(Biome biome, GenerationStep.Decoration step, String path) {
        List<HolderSet<PlacedFeature>> features = biome.getGenerationSettings().features();
        if (step.ordinal() >= features.size()) {
            return false;
        }
        ResourceKey<PlacedFeature> key = ResourceKey.create(Registries.PLACED_FEATURE, id(path));
        return features.get(step.ordinal()).stream().anyMatch(h -> h.is(key));
    }

    private static boolean hasFeatureInAnyStep(Biome biome, String path) {
        for (GenerationStep.Decoration step : GenerationStep.Decoration.values()) {
            if (hasFeature(biome, step, path)) {
                return true;
            }
        }
        return false;
    }

    /** As {@code MsmEntityGameTest.spawn}: on 26.3 natural spawns live in the {@code natural_mob_spawns} attribute. */
    private static Weighted<MobSpawnSettings.SpawnerData> spawn(Biome biome, MobCategory category, EntityType<?> type, int weight) {
        MobSpawnSettings spawns = biome.getAttributes().applyModifier(EnvironmentAttributes.NATURAL_MOB_SPAWNS,
                EnvironmentAttributes.NATURAL_MOB_SPAWNS.defaultValue());
        return spawns.getMobsInCategory(category).unwrap().stream().filter(w -> w.value().type() == type && w.weight() == weight)
                .findFirst().orElse(null);
    }

    private static HolderLookup.Provider registries(GameTestHelper helper) {
        return helper.getLevel().registryAccess();
    }

    /** The table as JSON, to count and read its pools. */
    private static JsonObject json(GameTestHelper helper, LootTable table) {
        JsonElement out = LootTable.DIRECT_CODEC.encodeStart(RegistryOps.create(JsonOps.INSTANCE, registries(helper)), table).getOrThrow();
        return out.getAsJsonObject();
    }

    private static int pools(GameTestHelper helper, LootTable table) {
        JsonObject json = json(helper, table);
        return json.has("pools") ? json.getAsJsonArray("pools").size() : 0;
    }

    private static LootTable live(GameTestHelper helper, ResourceKey<LootTable> key) {
        return helper.getLevel().getServer().reloadableRegistries().getLootTable(key);
    }

    // Loading

    @GameTest
    public void additionsLoadWithoutErrors(GameTestHelper helper) {
        helper.assertTrue(MsmRuntime.report().biomeAdditions().containsAll(List.of(id("plains_ore"), id("badlands_tag"), id("desert_fox"),
                id("missing_feature"))), "biome additions in the report: " + MsmRuntime.report().biomeAdditions());
        helper.assertTrue(MsmRuntime.report().lootAdditions().containsAll(List.of(id("zombie_gem"), id("broken"))),
                "loot additions in the report: " + MsmRuntime.report().lootAdditions());
        helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("_addition/") || e.contains("fuel_")),
                "addition or fuel errors: " + MsmRuntime.report().errors());
        helper.succeed();
    }

    // Biome additions (ADR 0060 D2)

    @GameTest
    public void placedFeatureReachesTheSelectedBiomeOnly(GameTestHelper helper) {
        helper.assertTrue(hasFeature(biome(helper, Biomes.PLAINS), GenerationStep.Decoration.UNDERGROUND_ORES, "addition_ore"),
                "plains has no msm_test:addition_ore at underground_ores");
        helper.assertFalse(hasFeature(biome(helper, Biomes.PLAINS), GenerationStep.Decoration.VEGETAL_DECORATION, "addition_ore"),
                "plains has msm_test:addition_ore at another step");
        for (ResourceKey<Biome> other : List.of(Biomes.DESERT, Biomes.FOREST, Biomes.SUNFLOWER_PLAINS)) {
            helper.assertFalse(hasFeatureInAnyStep(biome(helper, other), "addition_ore"), other.identifier() + " has msm_test:addition_ore");
        }
        helper.succeed();
    }

    @GameTest
    public void tagSelectorReachesEveryTaggedBiome(GameTestHelper helper) {
        for (ResourceKey<Biome> badlands : List.of(Biomes.BADLANDS, Biomes.ERODED_BADLANDS, Biomes.WOODED_BADLANDS)) {
            helper.assertTrue(hasFeature(biome(helper, badlands), GenerationStep.Decoration.UNDERGROUND_DECORATION, "addition_tag_ore"),
                    badlands.identifier() + " has no msm_test:addition_tag_ore");
        }
        helper.assertFalse(hasFeatureInAnyStep(biome(helper, Biomes.PLAINS), "addition_tag_ore"), "plains has msm_test:addition_tag_ore");
        helper.succeed();
    }

    @GameTest
    public void vanillaMobSpawnIsAdded(GameTestHelper helper) {
        Weighted<MobSpawnSettings.SpawnerData> fox = spawn(biome(helper, Biomes.DESERT), MobCategory.CREATURE, EntityTypes.FOX, 7);
        helper.assertTrue(fox != null, "desert has no fox spawn of weight 7");
        helper.assertValueEqual(fox.value().count().minInclusive(), 1, "min_group");
        helper.assertValueEqual(fox.value().count().maxInclusive(), 3, "max_group");
        helper.assertTrue(spawn(biome(helper, Biomes.SAVANNA), MobCategory.CREATURE, EntityTypes.FOX, 7) == null,
                "savanna (outside the selector) has the fox spawn");
        helper.succeed();
    }

    /** Fabric's addFeature throws for a missing key; the runtime skips it, so the server starts and warns once. */
    @GameTest
    public void unknownFeatureAndEntityWarnAfterStartup(GameTestHelper helper) {
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("biome_addition/missing_feature.json")
                && w.contains("unknown placed feature msm_test:missing_feature")), "no warning for the unknown feature: " + warnings);
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("biome_addition/missing_feature.json")
                && w.contains("unknown entity type msm_test:missing_mob")), "no warning for the unknown entity type: " + warnings);
        helper.assertFalse(warnings.stream().anyMatch(w -> w.contains("_addition/") && (w.contains("addition_ore")
                || w.contains("addition_tag_ore") || w.contains("minecraft:fox") || w.contains("is_badlands")
                || w.contains("entities/zombie"))), "known ids reported unknown: " + warnings);
        helper.assertFalse(hasFeatureInAnyStep(biome(helper, Biomes.SAVANNA), "missing_feature"), "the missing feature was added");
        helper.succeed();
    }

    // Loot additions (ADR 0060 D3)

    @GameTest
    public void zombieTableKeepsVanillaPoolsAndRollsTheGem(GameTestHelper helper) {
        LootTable table = live(helper, ZOMBIE);
        JsonObject json = json(helper, table);
        String text = json.toString();
        helper.assertValueEqual(pools(helper, table), VANILLA_ZOMBIE_POOLS + 1, "zombie pools");
        helper.assertTrue(text.contains("minecraft:rotten_flesh"), "vanilla rotten flesh pool missing: " + text);
        // The added pool names a project item and an enchantment: both resolved when the pool decoded.
        JsonObject added = json.getAsJsonArray("pools").get(VANILLA_ZOMBIE_POOLS).getAsJsonObject();
        helper.assertTrue(added.toString().contains("msm_test:fuel_gem") && added.toString().contains("minecraft:looting"),
                "the added pool is last and names the gem and looting: " + added);
        Zombie zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, AT);
        LootParams params = new LootParams.Builder(helper.getLevel())
                .withParameter(LootContextParams.THIS_ENTITY, zombie)
                .withParameter(LootContextParams.ORIGIN, zombie.position())
                .withParameter(LootContextParams.DAMAGE_SOURCE, helper.getLevel().damageSources().generic())
                .create(LootContextParamSets.ENTITY);
        Item gem = BuiltInRegistries.ITEM.getValue(id("fuel_gem"));
        int rolls = 0;
        for (int i = 0; i < 8; i++) {
            List<ItemStack> drops = table.getRandomItems(params);
            rolls += drops.stream().filter(s -> s.is(gem)).mapToInt(ItemStack::getCount).sum() > 0 ? 1 : 0;
        }
        zombie.discard();
        helper.assertValueEqual(rolls, 8, "rolls with the gem (the pool is guaranteed: one roll, one entry)");
        helper.succeed();
    }

    /**
     * Each loot table load (start-up or {@code /reload}) runs {@code MODIFY} on a freshly parsed table. Two loads are
     * simulated on fresh builders, since a real {@code /reload} would reset the scripts of the tests running alongside.
     */
    @GameTest
    public void eachLoadAddsThePoolOnce(GameTestHelper helper) {
        for (int load = 1; load <= 2; load++) {
            LootTable.Builder builder = LootTable.lootTable();
            LootTableEvents.MODIFY.invoker().modifyLootTable(ZOMBIE, builder, LootTableSource.VANILLA, registries(helper));
            helper.assertValueEqual(pools(helper, builder.build()), 1, "added pools in load " + load);
        }
        helper.assertValueEqual(pools(helper, live(helper, ZOMBIE)), VANILLA_ZOMBIE_POOLS + 1, "live zombie pools");
        helper.succeed();
    }

    @GameTest
    public void dataPackTablesAreLeftAlone(GameTestHelper helper) {
        for (LootTableSource source : LootTableSource.values()) {
            LootTable.Builder builder = LootTable.lootTable();
            MsmAdditions.modifyLootTable(ZOMBIE, builder, source, registries(helper));
            helper.assertValueEqual(pools(helper, builder.build()), source.isBuiltin() ? 1 : 0, "pools added for source " + source);
        }
        helper.succeed();
    }

    @GameTest
    public void brokenPoolIsOneErrorAndSkipped(GameTestHelper helper) {
        List<String> errors = MsmAdditions.lastLootLoadErrors();
        helper.assertValueEqual(errors.stream().filter(e -> e.contains("loot_addition/broken.json")).count(), 1L,
                "errors for the broken pool (two tables, one load): " + errors);
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("pools[0]") && e.contains("not added")), "error text: " + errors);
        for (ResourceKey<LootTable> key : List.of(table("entities/husk"), table("entities/drowned"))) {
            helper.assertFalse(json(helper, live(helper, key)).toString().contains("minecraft:stick"), key.identifier() + " got the broken pool");
        }
        helper.succeed();
    }

    // Fuel and compost through msm:components (ADR 0060 D4)

    /** V7: both components decode at initialisation over the static registries, so they need no DELAYED entry. */
    @GameTest
    public void fuelAndCompostDecodeAtInitialisation(GameTestHelper helper) {
        helper.assertFalse(ComponentPassthrough.DELAYED.contains(Identifier.withDefaultNamespace("cooking_fuel"))
                || ComponentPassthrough.DELAYED.contains(Identifier.withDefaultNamespace("compostable")), "fuel or compost is delayed");
        Item gem = BuiltInRegistries.ITEM.getValue(id("fuel_gem"));
        helper.assertValueEqual(gem.components().get(DataComponents.COOKING_FUEL),
                CookingFuel.CODEC.parse(JsonOps.INSTANCE, com.google.gson.JsonParser.parseString("{\"burn_time\": 400, \"speed_multiplier\": 1}")).getOrThrow(),
                "fuel_gem cooking_fuel");
        helper.assertValueEqual(gem.components().get(DataComponents.COMPOSTABLE),
                Compostable.CODEC.parse(JsonOps.INSTANCE, com.google.gson.JsonParser.parseString(
                        "{\"layers\": \"minecraft:compostable/always_add_one\"}")).getOrThrow(), "fuel_gem compostable");
        helper.succeed();
    }

    @GameTest
    public void blockItemCarriesItsComponents(GameTestHelper helper) {
        Item item = BuiltInRegistries.ITEM.getValue(id("fuel_block"));
        helper.assertTrue(item instanceof BlockItem, "fuel_block has no block item");
        helper.assertValueEqual(item.components().get(DataComponents.COOKING_FUEL),
                CookingFuel.CODEC.parse(JsonOps.INSTANCE, com.google.gson.JsonParser.parseString("{\"burn_time\": 1600, \"speed_multiplier\": 1}")).getOrThrow(),
                "fuel_block cooking_fuel");
        helper.assertTrue(item.components().has(DataComponents.COMPOSTABLE), "fuel_block is not compostable");
        helper.assertValueEqual(item.getDefaultMaxStackSize(), 16, "the block item's own max_stack_size still applies");
        helper.assertFalse(BuiltInRegistries.ITEM.getValue(Identifier.fromNamespaceAndPath("msm_test", "defaults")).components()
                .has(DataComponents.COOKING_FUEL), "a block without components got a fuel value");
        helper.succeed();
    }

    @GameTest(maxTicks = 320)
    public void fuelItemLightsAFurnaceAndSmelts(GameTestHelper helper) {
        helper.setBlock(AT, Blocks.FURNACE);
        AbstractFurnaceBlockEntity furnace = helper.getBlockEntity(AT, AbstractFurnaceBlockEntity.class);
        furnace.setItem(0, new ItemStack(Items.COBBLESTONE));
        furnace.setItem(1, new ItemStack(BuiltInRegistries.ITEM.getValue(id("fuel_gem"))));
        helper.runAfterDelay(10, () -> {
            helper.assertTrue(helper.getBlockState(AT).getValue(AbstractFurnaceBlock.LIT), "the furnace is not lit");
            helper.assertTrue(furnace.getItem(1).isEmpty(), "the fuel was not used");
        });
        helper.succeedWhen(() -> {
            helper.assertTrue(furnace.getItem(2).is(Items.STONE), "no stone in the output slot yet: " + furnace.getItem(2));
            helper.assertTrue(helper.getBlockState(AT).getValue(AbstractFurnaceBlock.LIT), "the furnace went out early (burn time 400)");
        });
    }

    /** {@code always_add_one} ("100%"): every insert raises the level, also above the empty composter's guaranteed first. */
    @GameTest
    public void compostableAlwaysRaisesTheComposter(GameTestHelper helper) {
        helper.setBlock(AT, Blocks.COMPOSTER);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        Item gem = BuiltInRegistries.ITEM.getValue(id("fuel_gem"));
        for (int level = 0; level < ComposterBlock.MAX_LEVEL; level++) {
            BlockState state = helper.getBlockState(AT);
            helper.assertValueEqual(state.getValue(ComposterBlock.LEVEL), level, "level before insert " + (level + 1));
            BlockState after = ComposterBlock.insertItem(player, state, helper.getLevel(), new ItemStack(gem), helper.absolutePos(AT));
            helper.assertValueEqual(after.getValue(ComposterBlock.LEVEL), level + 1, "level after insert " + (level + 1));
        }
        helper.succeed();
    }
}
