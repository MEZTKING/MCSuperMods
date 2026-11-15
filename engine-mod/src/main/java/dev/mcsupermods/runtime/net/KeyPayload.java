package dev.mcsupermods.runtime.net;

import dev.mcsupermods.runtime.MsmRuntime;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/**
 * The serverbound {@code msm_runtime:key_v1} payload (ADR 0088 D1, D2): a key bind id and whether the key went down or
 * up, nothing else. The server derives everything else (position, look, held item, vehicle) from its own state of the
 * player (D7 rule 4).
 *
 * <p>Wire format: the id as a UTF-8 string of at most {@link #MAX_ID_LENGTH} characters, then one boolean. A longer
 * string, an id that does not parse or a short body fails in the decoder, which vanilla turns into a disconnect of the
 * sender before any receiver runs (B406 S11); only payloads that decode reach {@link InputGuard}.
 */
public record KeyPayload(Identifier key, boolean pressed) implements CustomPacketPayload {
    /** Longest id the codec reads (ADR 0088 D1). */
    public static final int MAX_ID_LENGTH = 256;

    public static final Type<KeyPayload> TYPE = new Type<>(Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, "key_v1"));

    /** A bounded id: at most {@link #MAX_ID_LENGTH} characters and a valid {@code namespace:path}. */
    static final StreamCodec<ByteBuf, Identifier> ID = ByteBufCodecs.stringUtf8(MAX_ID_LENGTH).map(Identifier::parse, Identifier::toString);

    public static final StreamCodec<ByteBuf, KeyPayload> CODEC = StreamCodec.composite(
            ID, KeyPayload::key,
            ByteBufCodecs.BOOL, KeyPayload::pressed,
            KeyPayload::new);

    @Override
    public Type<KeyPayload> type() {
        return TYPE;
    }
}
