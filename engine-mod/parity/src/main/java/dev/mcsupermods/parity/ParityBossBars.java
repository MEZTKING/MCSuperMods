package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundBossEventPacket;
import net.minecraft.world.BossEvent;

/**
 * The boss bar packets one listening spectator ({@link ParityEars}) receives for the boss events of one name, as text, in
 * order: {@code add <name> <progress> <colour> <overlay> darken <b> music <b> fog <b>}, {@code progress <p>},
 * {@code name <name>}, {@code style <colour> <overlay>} and {@code remove}. A test cannot ask a mob for its boss event (the
 * content jar's and the ejected jar's classes differ), so the event is found by the name of its {@code add} packet: the
 * first event added under {@code name} is followed, by its id, through later renames. Vanilla and Netty only.
 *
 * <p>The listener is a spectator (no mob targets it) placed in the chunk tracking as a moving player would be
 * ({@code ServerChunkCache.move}), because a mock player is not ticked. Server thread only; close it at the end.
 */
final class ParityBossBars implements AutoCloseable {
    private final ParityEars ears;
    private final String name;
    private final List<String> seen = new ArrayList<>();
    private UUID followed;

    ParityBossBars(GameTestHelper helper, BlockPos at, String name) {
        this.name = name;
        ears = ParityEars.listener(helper, at);
        helper.getLevel().getChunkSource().move(ears.player);
        ears.packets();
    }

    /** Every packet of the followed boss event received so far (reads the new packets first). */
    List<String> events() {
        for (Packet<?> packet : ears.packets()) {
            if (packet instanceof ClientboundBossEventPacket boss) {
                boss.dispatch(handler());
            }
        }
        return List.copyOf(seen);
    }

    /** Whether a packet of the followed event starts with {@code prefix}. */
    boolean saw(String prefix) {
        return events().stream().anyMatch(s -> s.startsWith(prefix));
    }

    private boolean follows(UUID id) {
        return id.equals(followed);
    }

    private ClientboundBossEventPacket.Handler handler() {
        return new ClientboundBossEventPacket.Handler() {
            @Override
            public void add(UUID id, Component title, float progress, BossEvent.BossBarColor color,
                    BossEvent.BossBarOverlay overlay, boolean darken, boolean music, boolean fog) {
                if (followed == null && title.getString().equals(name)) {
                    followed = id;
                }
                if (follows(id)) {
                    seen.add("add " + title.getString() + " " + progress + " " + color.getName() + " " + overlay.getName()
                            + " darken " + darken + " music " + music + " fog " + fog);
                }
            }

            @Override
            public void remove(UUID id) {
                if (follows(id)) {
                    seen.add("remove");
                }
            }

            @Override
            public void updateProgress(UUID id, float progress) {
                if (follows(id)) {
                    seen.add("progress " + progress);
                }
            }

            @Override
            public void updateName(UUID id, Component title) {
                if (follows(id)) {
                    seen.add("name " + title.getString());
                }
            }

            @Override
            public void updateStyle(UUID id, BossEvent.BossBarColor color, BossEvent.BossBarOverlay overlay) {
                if (follows(id)) {
                    seen.add("style " + color.getName() + " " + overlay.getName());
                }
            }
        };
    }

    @Override
    public void close() {
        ears.close();
    }
}
