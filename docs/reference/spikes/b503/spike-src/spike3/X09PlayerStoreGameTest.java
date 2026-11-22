package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;
import static dev.mcsupermods.runtime.gametest.spike3.B503Mod.b;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.Vec3;

/**
 * B503 spike (throwaway), X9: per-player storage in a Fabric attachment on the player ({@code B503Mod.STORE}, persistent,
 * {@code copyOnDeath}), one store per block id: two players, two block ids, a respawn after death, a trip to the
 * Nether and the saved player data.
 */
public class X09PlayerStoreGameTest {
    static String open(GameTestHelper helper, ServerPlayer player, BlockPos rel, ItemStack put, int slot) {
        B503Help.use(helper, player, rel, Direction.UP, ItemStack.EMPTY);
        if (!(player.containerMenu instanceof ChestMenu menu)) {
            return "no menu: " + player.containerMenu;
        }
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < menu.getContainer().getContainerSize(); i++) {
            if (!menu.getContainer().getItem(i).isEmpty()) {
                b.append(i).append('=').append(menu.getContainer().getItem(i)).append(' ');
            }
        }
        b.append(']');
        if (put != null) {
            menu.getContainer().setItem(slot, put);
        }
        player.closeContainer();
        return b.toString();
    }

    @GameTest(maxTicks = 60)
    public void x9PlayerStore(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        BlockPos store = new BlockPos(2, 1, 2);
        BlockPos two = new BlockPos(4, 1, 2);
        helper.setBlock(store, b("store"));
        helper.setBlock(two, b("store_two"));
        try (B503Help.Ears ann = new B503Help.Ears(helper, new BlockPos(2, 2, 2), GameType.SURVIVAL, "Ann");
                B503Help.Ears ben = new B503Help.Ears(helper, new BlockPos(3, 2, 2), GameType.SURVIVAL, "Ben")) {
            R.section("X9", () -> {
                m.put("ann.first", open(helper, ann.player, store, new ItemStack(Items.DIAMOND, 4), 0));
                m.put("ben.first", open(helper, ben.player, store, new ItemStack(Items.EMERALD, 2), 3));
                m.put("ann.second", open(helper, ann.player, store, null, 0));
                m.put("ann.otherBlockId", open(helper, ann.player, two, null, 0));
                m.put("ben.second", open(helper, ben.player, store, null, 0));
                ServerPlayer before = ann.player;
                before.kill(helper.getLevel());
                m.put("ann.deadBeforeRespawn", before.isDeadOrDying());
                ServerPlayer after = ann.respawn();
                m.put("ann.respawnedNewObject", before != after);
                m.put("ann.attachmentAfterRespawn", String.valueOf(after.getAttached(B503Mod.STORE)));
                after.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(new BlockPos(2, 2, 2))));
                m.put("ann.afterRespawn", open(helper, after, store, null, 0));
                ServerLevel nether = helper.getLevel().getServer().getLevel(Level.NETHER);
                var moved = after.teleport(new TeleportTransition(nether, new Vec3(0.5, 70, 0.5), Vec3.ZERO, 0f, 0f, TeleportTransition.DO_NOTHING));
                m.put("ann.netherSameObject", moved == after);
                m.put("ann.netherLevel", String.valueOf(moved == null ? null : moved.level().dimension().identifier()));
                m.put("ann.attachmentInNether", String.valueOf(moved == null ? null : moved.getAttached(B503Mod.STORE)));
                ServerPlayer back = (ServerPlayer) moved.teleport(new TeleportTransition(helper.getLevel(),
                        helper.absoluteVec(Vec3.atBottomCenterOf(new BlockPos(2, 2, 2))), Vec3.ZERO, 0f, 0f, TeleportTransition.DO_NOTHING));
                ann.player = back;
                m.put("ann.backFromNether", open(helper, back, store, null, 0));
                TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, helper.getLevel().registryAccess());
                back.saveWithoutId(out);
                CompoundTag tag = out.buildResult();
                List<String> keys = tag.keySet().stream().filter(k -> k.contains("fabric") || k.contains("attach")).toList();
                m.put("ann.savedKeys", keys);
                m.put("ann.savedAttachment", keys.isEmpty() ? "none" : String.valueOf(tag.get(keys.getFirst())));
            });
        }
        R.put("X9", m);
        helper.succeed();
    }
}
