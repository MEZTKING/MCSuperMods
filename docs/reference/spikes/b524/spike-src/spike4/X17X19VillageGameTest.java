package dev.mcsupermods.runtime.gametest.spike4;

import static dev.mcsupermods.runtime.gametest.spike4.B524Help.R;
import static dev.mcsupermods.runtime.gametest.spike4.X15X16TradeGameTest.YARD;
import static dev.mcsupermods.runtime.gametest.spike4.X15X16TradeGameTest.costs;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.ai.village.poi.PoiTypes;
import net.minecraft.world.entity.monster.zombie.ZombieVillager;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerType;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;

/**
 * B524 spike (throwaway), X17 (a trader walking to a barrel to restock), X18 (project beds as villager homes: the POI
 * map before and after our states join vanilla's home type; a villager claiming and sleeping in the bed) and X19 (a
 * project villager type: registration, the biome map, finalizeSpawn in the biome, saving).
 */
public class X17X19VillageGameTest {
    static void command(GameTestHelper helper, String command) {
        MinecraftServer server = helper.getLevel().getServer();
        server.getCommands().performPrefixedCommand(server.createCommandSourceStack().withSuppressedOutput(), command);
    }

    @GameTest(structure = YARD, maxTicks = 400)
    public void x17WorkSite(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        helper.setBlock(new BlockPos(14, 1, 8), Blocks.BARREL);
        SpikeMob trader = helper.spawn(B524Mod.workTrader, new BlockPos(2, 1, 8));
        R.section("X17.setup", () -> {
            for (MerchantOffer o : trader.driver().trader().getOffers()) {
                while (!o.isOutOfStock()) {
                    o.increaseUses();
                }
            }
            m.put("usedUp", costs(trader.driver().trader().getOffers()));
            trader.wantsRestock = true;
        });
        List<String> path = new ArrayList<>();
        int[] t = {0};
        helper.onEachTick(() -> {
            t[0]++;
            if (t[0] % 20 == 0) {
                path.add(t[0] + ": " + helper.relativePos(trader.blockPosition()).toShortString());
            }
        });
        helper.runAfterDelay(360, () -> {
            m.put("path", path);
            m.put("events", trader.events);
            m.put("restockedAtTick", trader.restockedAtTick);
            m.put("restockedAt", trader.restockedAt == null ? null : helper.relativePos(trader.restockedAt).toShortString());
            m.put("after", costs(trader.driver().trader().getOffers()));
            R.put("X17", m);
            helper.succeed();
        });
    }

    static BlockPos placeBed(GameTestHelper helper, Block bed, BlockPos foot, Direction facing) {
        BlockState f = bed.defaultBlockState().setValue(HorizontalDirectionalBlock.FACING, facing).setValue(BedBlock.PART, BedPart.FOOT);
        helper.setBlock(foot, f);
        helper.setBlock(foot.relative(facing), f.setValue(BedBlock.PART, BedPart.HEAD));
        return foot.relative(facing);
    }

    @SuppressWarnings("unchecked")
    @GameTest(structure = YARD, maxTicks = 2400)
    public void x18Beds(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        Block bed = BuiltInRegistries.BLOCK.getValue(Identifier.fromNamespaceAndPath("msm_test", "furniture_bed"));
        BlockState head = bed.defaultBlockState().setValue(BedBlock.PART, BedPart.HEAD);
        BlockState foot = bed.defaultBlockState().setValue(BedBlock.PART, BedPart.FOOT);
        BlockState redHead = Blocks.BED.red().defaultBlockState().setValue(BedBlock.PART, BedPart.HEAD);
        BlockState redFoot = Blocks.BED.red().defaultBlockState().setValue(BedBlock.PART, BedPart.FOOT);
        m.put("projectBed", BuiltInRegistries.BLOCK.getKey(bed) + " class " + bed.getClass().getSimpleName() + " states "
                + bed.getStateDefinition().getPossibleStates().size() + " inBedsTag " + head.is(BlockTags.BEDS));
        m.put("before.forState", "head " + PoiTypes.forState(head).flatMap(Holder::unwrapKey) + " foot " + PoiTypes.forState(foot).flatMap(Holder::unwrapKey));
        m.put("vanilla.forState", "head " + PoiTypes.forState(redHead).flatMap(Holder::unwrapKey) + " foot " + PoiTypes.forState(redFoot).flatMap(Holder::unwrapKey));
        Holder<PoiType> home = PoiTypes.forState(redHead).orElseThrow();
        BlockPos firstHead = placeBed(helper, bed, new BlockPos(2, 1, 2), Direction.EAST);
        m.put("before.poiRecord", String.valueOf(level.getPoiManager().getType(helper.absolutePos(firstHead)).flatMap(Holder::unwrapKey)));
        helper.setBlock(firstHead, Blocks.AIR);
        helper.setBlock(new BlockPos(2, 1, 2), Blocks.AIR);
        R.section("X18.map", () -> {
            Field f = PoiTypes.class.getDeclaredField("TYPE_BY_STATE");
            f.setAccessible(true);
            Map<BlockState, Holder<PoiType>> map = (Map<BlockState, Holder<PoiType>>) f.get(null);
            m.put("map.class", map.getClass().getName());
            int added = 0;
            for (BlockState s : bed.getStateDefinition().getPossibleStates()) {
                if (s.getValue(BedBlock.PART) == BedPart.HEAD) {
                    map.put(s, home);
                    added++;
                }
            }
            m.put("map.added", added);
            m.put("home.is(projectHead)", home.value().is(head));
            m.put("after.forState", "head " + PoiTypes.forState(head).flatMap(Holder::unwrapKey) + " hasPoi " + PoiTypes.hasPoi(head));
        });
        BlockPos bedHead = placeBed(helper, bed, new BlockPos(12, 1, 8), Direction.EAST);
        m.put("after.poiRecord", String.valueOf(level.getPoiManager().getType(helper.absolutePos(bedHead)).flatMap(Holder::unwrapKey)));
        Villager v = helper.spawn(EntityTypes.VILLAGER, new BlockPos(5, 1, 8));
        command(helper, "time set 1000");
        int[] t = {0};
        int[] homeAt = {-1};
        int[] sleptAt = {-1};
        boolean[] night = {false};
        helper.onEachTick(() -> {
            t[0]++;
            Optional<GlobalPos> h = v.getBrain().getMemory(MemoryModuleType.HOME);
            if (homeAt[0] < 0 && h.isPresent()) {
                homeAt[0] = t[0];
                m.put("home.memory", h.get().pos().equals(helper.absolutePos(bedHead)) ? "the project bed's head" : h.get().toString());
                m.put("home.freeTickets", "record " + level.getPoiManager().getType(helper.absolutePos(bedHead)).flatMap(Holder::unwrapKey));
            }
            if (homeAt[0] > 0 && !night[0] && t[0] > homeAt[0] + 20) {
                night[0] = true;
                command(helper, "time set 13000");
                m.put("night.at", t[0]);
            }
            if (sleptAt[0] < 0 && v.isSleeping()) {
                sleptAt[0] = t[0];
                m.put("sleeping.pos", v.getSleepingPos().map(p -> helper.relativePos(p).toShortString()).orElse("none"));
                m.put("sleeping.bedOccupied", String.valueOf(level.getBlockState(helper.absolutePos(bedHead)).getValue(BedBlock.OCCUPIED)));
            }
            if (t[0] == 2300 || sleptAt[0] > 0 && t[0] == sleptAt[0] + 40) {
                m.put("home.tick", homeAt[0]);
                m.put("slept.tick", sleptAt[0]);
                m.put("stillSleeping", v.isSleeping());
                m.put("villager.at", helper.relativePos(v.blockPosition()).toShortString());
                command(helper, "time set 1000");
                R.put("X18", m);
                helper.succeed();
            }
        });
    }

    @GameTest(structure = YARD, maxTicks = 100)
    public void x19VillagerType(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        m.put("init", B524Mod.INIT);
        R.section("X19", () -> {
            Holder<VillagerType> ours = BuiltInRegistries.VILLAGER_TYPE.getOrThrow(B524Mod.villagerType);
            m.put("registry", BuiltInRegistries.VILLAGER_TYPE.keySet().toString());
            Holder<Biome> cherry = level.registryAccess().lookupOrThrow(Registries.BIOME).getOrThrow(B524Mod.TYPE_BIOME);
            Holder<Biome> plains = level.registryAccess().lookupOrThrow(Registries.BIOME).getOrThrow(Biomes.PLAINS);
            m.put("byBiome", "cherry_grove " + VillagerType.byBiome(cherry).identifier() + ", plains " + VillagerType.byBiome(plains).identifier());
            BlockPos a = helper.absolutePos(new BlockPos(0, 0, 0));
            BlockPos b = helper.absolutePos(new BlockPos(16, 9, 16));
            command(helper, "fillbiome " + a.getX() + " " + a.getY() + " " + a.getZ() + " " + b.getX() + " " + b.getY() + " " + b.getZ() + " minecraft:cherry_grove");
            BlockPos at = new BlockPos(8, 1, 8);
            m.put("biomeHere", level.getBiome(helper.absolutePos(at)).unwrapKey().map(k -> k.identifier().toString()).orElse("?"));
            Villager natural = EntityTypes.VILLAGER.spawn(level, helper.absolutePos(at), EntitySpawnReason.NATURAL);
            m.put("villager.natural", natural.getVillagerData().type().unwrapKey().map(k -> k.identifier().toString()).orElse("?"));
            Villager breedSpawn = EntityTypes.VILLAGER.spawn(level, helper.absolutePos(at.east()), EntitySpawnReason.BREEDING);
            m.put("villager.breeding", breedSpawn.getVillagerData().type().unwrapKey().map(k -> k.identifier().toString()).orElse("?"));
            ZombieVillager zombie = EntityTypes.ZOMBIE_VILLAGER.spawn(level, helper.absolutePos(at.west()), EntitySpawnReason.NATURAL);
            m.put("zombieVillager.natural", zombie.getVillagerData().type().unwrapKey().map(k -> k.identifier().toString()).orElse("?"));
            Villager set = helper.spawn(EntityTypes.VILLAGER, new BlockPos(4, 1, 4));
            set.setVillagerData(set.getVillagerData().withType(ours));
            TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
            set.saveWithoutId(out);
            CompoundTag tag = out.buildResult();
            m.put("saved.VillagerData", String.valueOf(tag.get("VillagerData")));
            Villager copy = EntityTypes.VILLAGER.create(level, EntitySpawnReason.LOAD);
            copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
            m.put("loaded.type", copy.getVillagerData().type().unwrapKey().map(k -> k.identifier().toString()).orElse("?"));
            // Curing a project-type zombie villager keeps the type (vanilla copies the data).
            zombie.setVillagerData(zombie.getVillagerData().withType(ours));
            m.put("zombie.setType", zombie.getVillagerData().type().unwrapKey().map(k -> k.identifier().toString()).orElse("?"));
        });
        R.put("X19", m);
        helper.succeed();
    }
}
