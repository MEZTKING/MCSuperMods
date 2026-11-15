package dev.mcsupermods.runtime.net;

import dev.mcsupermods.runtime.MsmRuntime;
import io.netty.buffer.ByteBuf;
import io.netty.handler.codec.DecoderException;
import java.util.List;
import java.util.Optional;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/**
 * The clientbound {@code msm_runtime:hud_v1} payload (ADR 0089 D3): the changed HUD values of one player. B411 defines
 * the type and its codec and registers it; B416 sends it ({@code HudSync}) and receives it ({@code HudClient}).
 *
 * <p>Wire format: {@code hash} as a 32-bit int (of the sorted HUD id list both sides read at initialisation; a client
 * whose list differs ignores the payload), then at most {@link #MAX_VALUES} values, each an {@code index} varint
 * (at least 0) and three optional fields: {@code number} (double), {@code text} (UTF-8, at most {@link #MAX_TEXT}
 * characters) and {@code visible} (boolean). More values, a longer text or a negative index fail in the decoder.
 *
 * @param hash   the hash of the HUD id list
 * @param values the changes, by element index
 */
public record HudPayload(int hash, List<Value> values) implements CustomPacketPayload {
    /** Most values in one payload (ADR 0089 D3). */
    public static final int MAX_VALUES = 64;
    /** Longest text value (ADR 0089 D3). */
    public static final int MAX_TEXT = 256;

    public static final Type<HudPayload> TYPE = new Type<>(Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, "hud_v1"));

    public HudPayload {
        values = List.copyOf(values);
        if (values.size() > MAX_VALUES) {
            throw new IllegalArgumentException("a hud_v1 payload carries at most " + MAX_VALUES + " values, got " + values.size());
        }
    }

    /**
     * One changed element.
     *
     * @param index   the element's position in the sorted HUD id list
     * @param number  a new number, or empty
     * @param text    a new text (at most {@link #MAX_TEXT} characters), or empty
     * @param visible shown or hidden by an action, or empty
     */
    public record Value(int index, Optional<Double> number, Optional<String> text, Optional<Boolean> visible) {
        static final StreamCodec<ByteBuf, Integer> INDEX = ByteBufCodecs.VAR_INT.map(i -> {
            if (i < 0) {
                throw new DecoderException("hud_v1: negative index " + i);
            }
            return i;
        }, i -> i);

        public static final StreamCodec<ByteBuf, Value> CODEC = StreamCodec.composite(
                INDEX, Value::index,
                ByteBufCodecs.optional(ByteBufCodecs.DOUBLE), Value::number,
                ByteBufCodecs.optional(ByteBufCodecs.stringUtf8(MAX_TEXT)), Value::text,
                ByteBufCodecs.optional(ByteBufCodecs.BOOL), Value::visible,
                Value::new);
    }

    public static final StreamCodec<ByteBuf, HudPayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.INT, HudPayload::hash,
            Value.CODEC.apply(ByteBufCodecs.list(MAX_VALUES)), HudPayload::values,
            HudPayload::new);

    @Override
    public Type<HudPayload> type() {
        return TYPE;
    }
}
