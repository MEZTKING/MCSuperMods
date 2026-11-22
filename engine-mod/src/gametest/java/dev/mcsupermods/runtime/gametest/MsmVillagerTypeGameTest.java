package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.VillagerTypeParser;
import dev.mcsupermods.runtime.registry.mob.VillagerTypes;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.Difficulty;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.entity.monster.zombie.ZombieVillager;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerDataHolder;
import net.minecraft.world.entity.npc.villager.VillagerType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Project villager types (ADR 0107 D5 as amended after the B524 spike; B528): {@code vt_blossom} (the cherry grove by
 * id), {@code vt_marsh} (the tag {@code #msm_test:vt_marsh}, the mangrove swamp), {@code vt_lost} (a biome id and a tag
 * the world does not have), {@code vt_zdupe} (the cherry grove again, which {@code vt_blossom} keeps, and the bamboo
 * jungle, taken from vanilla's jungle type). Villagers spawn with
 * {@code EntityType.spawn} and a spawn reason, as natural spawning and breeding call it; the zombie conversion is
 * vanilla's {@code Zombie.convertVillagerToZombieVillager} and the cure a player's golden apple on a weakened zombie
 * villager. The conversion test runs in the test environment {@code msm_runtime_gametest:b528_normal} (difficulty
 * normal, put back afterwards): the GameTest world is peaceful, which removes zombie villagers.
 */
public class MsmVillagerTypeGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static String type(VillagerDataHolder holder) {
        return holder.getVillagerData().type().unwrapKey().map(k -> k.identifier().toString()).orElse("(unnamed)");
    }

    private static String byBiome(ServerLevel level, ResourceKey<Biome> biome) {
        Holder<Biome> holder = level.registryAccess().lookupOrThrow(Registries.BIOME).getOrThrow(biome);
        return VillagerType.byBiome(holder).identifier().toString();
    }

    /** Fills the test box with {@code biome}, as {@code /fillbiome} does. */
    private static void fillBiome(GameTestHelper helper, String biome) {
        BlockPos a = helper.absolutePos(new BlockPos(0, 0, 0));
        BlockPos b = helper.absolutePos(new BlockPos(10, 3, 10));
        MsmTrader2GameTest.command(helper.getLevel().getServer(), "fillbiome " + a.getX() + " " + a.getY() + " " + a.getZ() + " "
                + b.getX() + " " + b.getY() + " " + b.getZ() + " " + biome);
    }

    @GameTest
    public void projectTypesRegisterWithTheirBiomes(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        helper.assertValueEqual(MsmRuntime.report().villagerTypes(), List.of(id("vt_blossom"), id("vt_lost"), id("vt_marsh"), id("vt_zdupe")),
                "registered villager types (logged as 'registered 4 villager type(s)')");
        for (String path : List.of("vt_blossom", "vt_lost", "vt_marsh", "vt_zdupe")) {
            helper.assertTrue(BuiltInRegistries.VILLAGER_TYPE.containsKey(id(path)), path + " is not in the registry");
            helper.assertTrue(VillagerTypes.registered().containsKey(id(path)), path + " not kept");
        }
        helper.assertValueEqual(BuiltInRegistries.VILLAGER_TYPE.keySet().stream().filter(k -> k.getNamespace().equals("minecraft")).count(),
                7L, "vanilla's villager types");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertFalse(errors.stream().anyMatch(e -> e.contains("/villager_type/")), "villager type errors: " + errors);
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("vt_zdupe.json") && w.contains("minecraft:cherry_grove")
                && w.contains("msm_test:vt_blossom")), "no warning for the cherry grove named twice: " + warnings);
        List<String> late = VillagerTypes.serverWarnings();
        helper.assertTrue(late.stream().anyMatch(w -> w.contains("vt_lost") && w.contains("msm_test:no_such_biome") && w.contains("not a biome")),
                "no warning for the unknown biome: " + late);
        helper.assertTrue(late.stream().anyMatch(w -> w.contains("vt_lost") && w.contains("#msm_test:no_such_tag") && w.contains("not a biome tag")),
                "no warning for the unknown tag: " + late);

        helper.assertValueEqual(byBiome(level, Biomes.CHERRY_GROVE), "msm_test:vt_blossom", "the cherry grove (by id)");
        helper.assertValueEqual(byBiome(level, Biomes.MANGROVE_SWAMP), "msm_test:vt_marsh", "the mangrove swamp (by tag)");
        helper.assertValueEqual(byBiome(level, Biomes.BAMBOO_JUNGLE), "msm_test:vt_zdupe", "the bamboo jungle (taken from vanilla)");
        helper.assertValueEqual(byBiome(level, Biomes.PLAINS), "minecraft:plains", "the plains keep vanilla's type");
        helper.assertValueEqual(byBiome(level, Biomes.DESERT), "minecraft:desert", "the desert keeps vanilla's type");

        Identifier blossom = id("vt_blossom");
        helper.assertValueEqual(VillagerTypeParser.VillagerType.villagerTexture(blossom),
                Identifier.fromNamespaceAndPath("msm_test", "textures/entity/villager/type/vt_blossom.png"), "villager picture");
        helper.assertValueEqual(VillagerTypeParser.VillagerType.zombieVillagerTexture(blossom),
                Identifier.fromNamespaceAndPath("msm_test", "textures/entity/zombie_villager/type/vt_blossom.png"), "zombie villager picture");
        helper.succeed();
    }

    @GameTest(structure = ARENA, maxTicks = 100)
    public void villagersSpawnAndAreBornWithTheirBiomesType(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        fillBiome(helper, "minecraft:cherry_grove");
        BlockPos at = new BlockPos(5, 1, 5);
        helper.assertValueEqual(level.getBiome(helper.absolutePos(at)).unwrapKey().map(k -> k.identifier().toString()).orElse("?"),
                "minecraft:cherry_grove", "biome after fillbiome");
        Villager natural = EntityTypes.VILLAGER.spawn(level, helper.absolutePos(at), EntitySpawnReason.NATURAL);
        Villager born = EntityTypes.VILLAGER.spawn(level, helper.absolutePos(at.east()), EntitySpawnReason.BREEDING);
        ZombieVillager zombie = EntityTypes.ZOMBIE_VILLAGER.spawn(level, helper.absolutePos(at.west()), EntitySpawnReason.NATURAL);
        helper.assertValueEqual(type(natural), "msm_test:vt_blossom", "a villager spawned in the cherry grove");
        helper.assertValueEqual(type(born), "msm_test:vt_blossom", "a villager born in the cherry grove");
        helper.assertValueEqual(type(zombie), "msm_test:vt_blossom", "a zombie villager spawned in the cherry grove");
        zombie.discard();

        fillBiome(helper, "minecraft:mangrove_swamp");
        Villager marsh = EntityTypes.VILLAGER.spawn(level, helper.absolutePos(at.north()), EntitySpawnReason.NATURAL);
        helper.assertValueEqual(type(marsh), "msm_test:vt_marsh", "a villager spawned in the mangrove swamp (by tag)");

        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        natural.saveWithoutId(out);
        CompoundTag tag = out.buildResult();
        Villager copy = EntityTypes.VILLAGER.create(level, EntitySpawnReason.LOAD);
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
        helper.assertValueEqual(type(copy), "msm_test:vt_blossom", "the type after saving and loading (" + tag.get("VillagerData") + ")");
        helper.succeed();
    }

    @GameTest(structure = ARENA, maxTicks = 400, environment = "msm_runtime_gametest:b528_normal")
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    public void aProjectTypeLastsThroughZombieConversionAndCure(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        helper.assertValueEqual(level.getDifficulty(), Difficulty.NORMAL, "the test environment's difficulty");
        fillBiome(helper, "minecraft:cherry_grove");
        BlockPos at = new BlockPos(5, 1, 5);
        Villager villager = EntityTypes.VILLAGER.spawn(level, helper.absolutePos(at), EntitySpawnReason.NATURAL);
        helper.assertValueEqual(type(villager), "msm_test:vt_blossom", "the villager's type");
        Zombie zombie = helper.spawn(EntityTypes.ZOMBIE, new BlockPos(2, 1, 2));
        helper.assertTrue(zombie.convertVillagerToZombieVillager(level, villager), "the villager was not converted");
        zombie.discard();
        AABB box = new AABB(helper.absolutePos(at)).inflate(2);
        List<ZombieVillager> zombies = level.getEntitiesOfClass(ZombieVillager.class, box);
        helper.assertValueEqual(zombies.size(), 1, "zombie villagers after the conversion");
        ZombieVillager zv = zombies.getFirst();
        helper.assertValueEqual(type(zv), "msm_test:vt_blossom", "the zombie villager's type");

        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(at.east())));
        zv.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, 1200));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GOLDEN_APPLE));
        player.interactOn(zv, InteractionHand.MAIN_HAND, Vec3.ZERO);
        server.getPlayerList().remove(player);
        helper.assertTrue(zv.isConverting(), "the golden apple did not start the cure");
        zv.setVillagerConversionTime(1);
        helper.succeedWhen(() -> {
            helper.assertTrue(zv.isRemoved(), "the zombie villager is not cured yet");
            List<Villager> cured = level.getEntitiesOfClass(Villager.class, box);
            helper.assertValueEqual(cured.size(), 1, "villagers after the cure");
            helper.assertValueEqual(type(cured.getFirst()), "msm_test:vt_blossom", "the cured villager's type");
        });
    }
}
