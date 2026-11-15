package dev.mcsupermods.runtime.net;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@link InputGuard} (ADR 0088 D7 rules 1, 2) and the bounds of the {@code key_v1} and {@code hud_v1} codecs (D1). */
class InputGuardTest {
    private static final UUID ANN = UUID.fromString("00000000-0000-0000-0000-00000000a001");
    private static final UUID BOB = UUID.fromString("00000000-0000-0000-0000-00000000b002");

    @Test
    void aBurstOfFortyPassesThenOneATick() {
        InputGuard guard = new InputGuard();
        for (int i = 0; i < InputGuard.BURST; i++) {
            assertTrue(guard.tryAcquire(ANN, 100), "packet " + i + " of the burst");
        }
        assertFalse(guard.tryAcquire(ANN, 100), "the 41st packet in one tick");
        assertTrue(guard.tryAcquire(ANN, 101), "one token back after a tick");
        assertFalse(guard.tryAcquire(ANN, 101));
        assertTrue(guard.tryAcquire(BOB, 101), "buckets are per player");
    }

    @Test
    void twentyASecondIsSustainable() {
        InputGuard guard = new InputGuard();
        int passed = 0;
        for (long tick = 0; tick < 200; tick++) {
            for (int i = 0; i < 3; i++) {
                if (guard.tryAcquire(ANN, tick)) {
                    passed++;
                }
            }
        }
        // 40 at first, then one a tick: 40 + 199.
        assertEquals(InputGuard.BURST + 199, passed);
    }

    @Test
    void theBucketRefillsToTheBurstOnly() {
        InputGuard guard = new InputGuard();
        for (int i = 0; i < InputGuard.BURST; i++) {
            guard.tryAcquire(ANN, 0);
        }
        int passed = 0;
        while (guard.tryAcquire(ANN, 10_000)) {
            passed++;
        }
        assertEquals(InputGuard.BURST, passed);
    }

    @Test
    void dropsLogAtMostOnceAMinutePerPlayer() {
        InputGuard guard = new InputGuard();
        String first = guard.drop(ANN, "Ann", InputGuard.Reason.UNKNOWN_KEY, 0);
        assertEquals("dropped 1 key packet(s) from Ann: unknown key", first);
        assertNull(guard.drop(ANN, "Ann", InputGuard.Reason.UNKNOWN_KEY, 5));
        assertNull(guard.drop(ANN, "Ann", InputGuard.Reason.RATE_LIMIT, 600));
        assertEquals(List.of(), guard.due(1199));
        assertNotNull(guard.drop(BOB, "Bob", InputGuard.Reason.SPECTATOR, 600), "another player logs at once");
        assertEquals(List.of("dropped 2 key packet(s) from Ann: unknown key (1), over the rate limit (1)"), guard.due(1200));
        assertEquals(List.of(), guard.due(5000), "nothing waits");
        assertEquals("dropped 1 key packet(s) from Ann: dead", guard.drop(ANN, "Ann", InputGuard.Reason.DEAD, 5000));
        assertEquals(2, guard.dropped(InputGuard.Reason.UNKNOWN_KEY));
        assertEquals(1, guard.dropped(InputGuard.Reason.RATE_LIMIT));
    }

    @Test
    void forgettingAPlayerFlushesTheirWaitingDrops() {
        InputGuard guard = new InputGuard();
        guard.tryAcquire(ANN, 0);
        guard.drop(ANN, "Ann", InputGuard.Reason.SLEEPING, 0);
        guard.drop(ANN, "Ann", InputGuard.Reason.SLEEPING, 1);
        assertEquals("dropped 1 key packet(s) from Ann: sleeping", guard.forget(ANN, 2));
        assertEquals(0, guard.tracked());
        assertNull(guard.forget(ANN, 3));
    }

    // Codecs (ADR 0088 D1): anything over the bounds fails in the decoder, which vanilla turns into a disconnect.

    @Test
    void keyPayloadRoundTrips() {
        ByteBuf buf = Unpooled.buffer();
        KeyPayload.CODEC.encode(buf, new KeyPayload(Identifier.parse("mymod:dash"), true));
        assertEquals(new KeyPayload(Identifier.parse("mymod:dash"), true), KeyPayload.CODEC.decode(buf));
        assertEquals(0, buf.readableBytes());
    }

    @Test
    void keyPayloadRejectsLongOrInvalidIdsAndShortBodies() {
        ByteBuf longId = Unpooled.buffer();
        ByteBufCodecs.stringUtf8(1024).encode(longId, "a:" + "x".repeat(300));
        longId.writeBoolean(true);
        assertThrows(RuntimeException.class, () -> KeyPayload.CODEC.decode(longId));
        ByteBuf invalid = Unpooled.buffer();
        ByteBufCodecs.stringUtf8(256).encode(invalid, "Not An Id");
        invalid.writeBoolean(true);
        assertThrows(RuntimeException.class, () -> KeyPayload.CODEC.decode(invalid));
        ByteBuf truncated = Unpooled.buffer();
        ByteBufCodecs.stringUtf8(256).encode(truncated, "a:b");
        assertThrows(RuntimeException.class, () -> KeyPayload.CODEC.decode(truncated));
    }

    @Test
    void hudPayloadRoundTripsAndIsBounded() {
        HudPayload payload = new HudPayload(0x1234abcd, List.of(
                new HudPayload.Value(0, Optional.of(2.5), Optional.empty(), Optional.empty()),
                new HudPayload.Value(7, Optional.empty(), Optional.of("Mana"), Optional.of(false))));
        ByteBuf buf = Unpooled.buffer();
        HudPayload.CODEC.encode(buf, payload);
        assertEquals(payload, HudPayload.CODEC.decode(buf));

        ByteBuf tooMany = Unpooled.buffer();
        tooMany.writeInt(1);
        ByteBufCodecs.VAR_INT.encode(tooMany, HudPayload.MAX_VALUES + 1);
        assertThrows(RuntimeException.class, () -> HudPayload.CODEC.decode(tooMany));

        ByteBuf negative = Unpooled.buffer();
        negative.writeInt(1);
        ByteBufCodecs.VAR_INT.encode(negative, 1);
        ByteBufCodecs.VAR_INT.encode(negative, -1);
        negative.writeBoolean(false);
        negative.writeBoolean(false);
        negative.writeBoolean(false);
        assertThrows(RuntimeException.class, () -> HudPayload.CODEC.decode(negative));

        ByteBuf longText = Unpooled.buffer();
        longText.writeInt(1);
        ByteBufCodecs.VAR_INT.encode(longText, 1);
        ByteBufCodecs.VAR_INT.encode(longText, 0);
        longText.writeBoolean(false);
        longText.writeBoolean(true);
        ByteBufCodecs.stringUtf8(1024).encode(longText, "x".repeat(HudPayload.MAX_TEXT + 1));
        longText.writeBoolean(false);
        assertThrows(RuntimeException.class, () -> HudPayload.CODEC.decode(longText));
        assertThrows(IllegalArgumentException.class, () -> new HudPayload(0,
                java.util.Collections.nCopies(HudPayload.MAX_VALUES + 1, new HudPayload.Value(0, Optional.empty(), Optional.empty(), Optional.empty()))));
    }
}
