package dev.mcsupermods.runtime.gametest.spike5;

import static dev.mcsupermods.runtime.gametest.spike5.B525Help.R;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.common.ClientboundShowDialogPacket;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.dialog.Dialog;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.level.GameType;

/**
 * B525 spike (throwaway), X34: a data pack dialog ({@code msm_b525:hello}, shipped as test data) opened for a player
 * from the server by {@code ServerPlayer.openDialog(Holder)} and by {@code /dialog show}, seen as the packets the
 * player gets.
 */
public class X34DialogGameTest {
    static List<String> dialogs(List<Packet<?>> packets) {
        List<String> out = new ArrayList<>();
        for (Packet<?> p : packets) {
            if (p instanceof ClientboundShowDialogPacket show) {
                out.add("show dialog " + show.dialog().unwrapKey().map(k -> k.identifier().toString()).orElse("inline") + " " + show.dialog().value()
                        .getClass().getSimpleName());
            }
        }
        return out;
    }

    @GameTest(maxTicks = 20)
    public void x34Dialog(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        MinecraftServer server = helper.getLevel().getServer();
        try (B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "Reader")) {
            R.section("X34", () -> {
                var registry = server.registryAccess().lookupOrThrow(Registries.DIALOG);
                m.put("registry.ours", registry.listElementIds().filter(k -> k.identifier().getNamespace().equals(B525Mod.NS))
                        .map(k -> k.identifier().toString()).toList());
                Holder<Dialog> hello = registry.getOrThrow(ResourceKey.create(Registries.DIALOG, B525Mod.id("hello")));
                ears.packets();
                ears.player.openDialog(hello);
                m.put("openDialog", dialogs(ears.packets()));
                CommandSourceStack console = server.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
                server.getCommands().performPrefixedCommand(console, "dialog show Reader msm_b525:hello");
                m.put("command", dialogs(ears.packets()));
                server.getCommands().performPrefixedCommand(console, "dialog clear Reader");
                m.put("clear", ears.packets().stream().map(p -> p.getClass().getSimpleName()).filter(n -> n.contains("Dialog")).toList());
            });
        }
        R.put("X34", m);
        helper.succeed();
    }
}
