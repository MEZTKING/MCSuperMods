package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;

import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.SpawnerBlockEntity;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;

/**
 * B503 spike (throwaway), X14: vanilla's spawner set to a project mob ({@code msm_test:minimal}) spawns it with a player
 * near; a project spawn egg used on a spawner in survival and in creative sets it.
 */
public class X14SpawnerGameTest {
    static final String TALL = X01PlantClassesGameTest.TALL;
    static final Identifier MOB = Identifier.fromNamespaceAndPath("msm_test", "minimal");

    static String spawnerEntity(GameTestHelper helper, BlockPos rel) {
        SpawnerBlockEntity be = (SpawnerBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, helper.getLevel().registryAccess());
        be.getSpawner().save(out);
        CompoundTag tag = out.buildResult();
        return String.valueOf(tag.get("SpawnData"));
    }

    @GameTest(structure = TALL, maxTicks = 900)
    public void x14Spawner(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        EntityType<?> type = BuiltInRegistries.ENTITY_TYPE.getValue(MOB);
        m.put("type", String.valueOf(BuiltInRegistries.ENTITY_TYPE.getKey(type)));
        BlockPos at = new BlockPos(7, 2, 7);
        helper.setBlock(at, Blocks.SPAWNER);
        SpawnerBlockEntity be = (SpawnerBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(at));
        be.setEntityId(type, helper.getLevel().getRandom());
        m.put("setEntityId", spawnerEntity(helper, at));
        ServerPlayer near = B503Help.player(helper, new BlockPos(7, 1, 3), GameType.CREATIVE);
        Identifier eggId = MOB.withSuffix("_spawn_egg");
        Item egg = BuiltInRegistries.ITEM.getValue(eggId);
        m.put("egg", String.valueOf(BuiltInRegistries.ITEM.getKey(egg)));
        BlockPos second = new BlockPos(3, 2, 12);
        BlockPos third = new BlockPos(11, 2, 12);
        helper.setBlock(second, Blocks.SPAWNER);
        helper.setBlock(third, Blocks.SPAWNER);
        ServerPlayer survival = B503Help.player(helper, new BlockPos(3, 1, 10), GameType.SURVIVAL);
        m.put("egg.survival", B503Help.use(helper, survival, second, Direction.UP, new ItemStack(egg)) + " -> " + spawnerEntity(helper, second)
                + " left " + survival.getMainHandItem());
        ServerPlayer creative = B503Help.player(helper, new BlockPos(11, 1, 10), GameType.CREATIVE);
        m.put("egg.creative", B503Help.use(helper, creative, third, Direction.UP, new ItemStack(egg)) + " -> " + spawnerEntity(helper, third)
                + " left " + creative.getMainHandItem());
        helper.setBlock(second, Blocks.AIR);
        helper.setBlock(third, Blocks.AIR);
        survival.discard();
        creative.discard();
        int[] firstSeen = {-1};
        int[] t = {0};
        helper.onEachTick(() -> {
            t[0]++;
            int n = helper.getLevel().getEntities(type, new AABB(helper.absolutePos(at)).inflate(9), e -> true).size();
            if (n > 0 && firstSeen[0] < 0) {
                firstSeen[0] = t[0];
            }
        });
        helper.runAfterDelay(800, () -> {
            int n = helper.getLevel().getEntities(type, new AABB(helper.absolutePos(at)).inflate(9), e -> true).size();
            m.put("spawned.after800ticks", n);
            m.put("spawned.firstSeenTick", firstSeen[0]);
            m.put("nearPlayer", near.isAlive());
            R.put("X14", m);
            helper.succeed();
        });
    }
}
