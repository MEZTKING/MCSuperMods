package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;
import static dev.mcsupermods.runtime.gametest.spike3.B503Mod.b;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * B503 spike (throwaway), X10: a block with its own five sound events (26.3: a {@code SoundType} built from them; 26.4:
 * a {@code block_sound_set} data entry {@code msm_b503:own} named by key at start) and, on 26.4, a block naming a key no
 * data defines. Placing (sound packet to a second player), breaking (level event 2001), a pig walking on it (step) and
 * falling on it (fall), heard by a listening player; and what the block resolves to in the level.
 */
public class X10SoundsGameTest {
    static final String TALL = X01PlantClassesGameTest.TALL;

    static List<String> ours(List<String> heard) {
        List<String> out = new ArrayList<>();
        for (String h : heard) {
            if (h.contains("msm_b503") || h.startsWith("levelEvent 2001") || h.contains("step") || h.contains("fall")
                    || h.contains("place") || h.contains("break")) {
                out.add(h);
            }
        }
        return out;
    }

    void run(GameTestHelper helper, String path, int x, Map<String, Object> m, Runnable done) {
        Block block = b(path);
        B503Help.Ears ears = new B503Help.Ears(helper, new BlockPos(x, 2, 8), GameType.SPECTATOR, "Ears" + x);
        ServerPlayer placer = B503Help.player(helper, new BlockPos(x, 1, 0), GameType.SURVIVAL);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("resolved", B503Version.soundsOf(helper.getLevel(), helper.absolutePos(new BlockPos(x, 1, 1)), block));
        helper.setBlock(new BlockPos(x, 0, 1), Blocks.STONE);
        ears.heard();
        r.put("placeResult", String.valueOf(B503Help.use(helper, placer, new BlockPos(x, 0, 1), Direction.UP, new ItemStack(block.asItem()))));
        r.put("place", ours(ears.heard()));
        helper.getLevel().destroyBlock(helper.absolutePos(new BlockPos(x, 1, 1)), false);
        r.put("break", ours(ears.heard()));
        for (int z = 2; z <= 13; z++) {
            helper.setBlock(new BlockPos(x, 0, z), block);
        }
        Pig walker = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(x, 1, 2));
        Pig faller = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(x + 1, 9, 6));
        helper.setBlock(new BlockPos(x + 1, 0, 6), block);
        ears.heard();
        int[] t = {0};
        helper.onEachTick(() -> {
            if (t[0] >= 0 && walker.isAlive()) {
                walker.setDeltaMovement(new Vec3(0, walker.getDeltaMovement().y, 0.25));
            }
        });
        helper.runAfterDelay(40, () -> {
            r.put("walkAndFall", ours(ears.heard()));
            r.put("fallerOnGround", faller.onGround());
            t[0] = -1;
            walker.discard();
            faller.discard();
            ears.close();
            m.put(path, r);
            done.run();
        });
    }

    @GameTest(structure = TALL, maxTicks = 200)
    public void x10Sounds(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("registry", B503Version.soundRegistryFacts(helper.getLevel()));
        run(helper, "own_sounds", 2, m, () -> run(helper, "missing_sounds", 6, m, () -> {
            R.put("X10", m);
            helper.succeed();
        }));
    }
}
