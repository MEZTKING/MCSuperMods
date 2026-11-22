package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * The {@code msm:storage} (ADR 0098 D3, {@code ::msm::component::Storage}) and {@code msm:shoulder_riding} (ADR 0098 D4
 * as amended, {@code ::msm::component::ShoulderRiding}) components of an entity definition. Both are closed, as the
 * other mob components: an unknown key ({@code hoppers}, {@code side} (the field is {@code sides}), {@code cooldown_ticks}), {@code rows} outside 1
 * to 6, a value of the wrong type or a component that is not an object is an error naming the field, and the
 * component is not applied. Pure: {@code EntityComponents} decodes them with {@link Storage#CODEC} and
 * {@link ShoulderRiding#CODEC}.
 */
public final class StorageParser {
    private StorageParser() {}

    /**
     * {@code Storage}: a chest-like store on the mob.
     *
     * @param rows       rows of nine slots, 1 to 6 (default 3)
     * @param needsChest whether a chest must be used on the mob first (default false)
     * @param openSound  played when the store opens; empty means vanilla's chest opening sound
     * @param closeSound played when the store closes; empty means vanilla's chest closing sound
     */
    public record Storage(int rows, boolean needsChest, Optional<Identifier> openSound, Optional<Identifier> closeSound) {
        public static final List<String> KEYS = List.of("rows", "needs_chest", "open_sound", "close_sound");

        public static final Codec<Storage> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("rows", intRange(1, 6), 3).forGetter(Storage::rows),
                optional("needs_chest", Codec.BOOL, false).forGetter(Storage::needsChest),
                optional("open_sound", ID).forGetter(Storage::openSound),
                optional("close_sound", ID).forGetter(Storage::closeSound)).apply(i, Storage::new)), KEYS);

        /** The number of slots. */
        public int slots() {
            return rows * 9;
        }
    }

    /** {@code ShoulderSide} (ADR 0109 D2): a side named by the player's view, or whichever is free. */
    public enum ShoulderSide {
        LEFT, RIGHT, EITHER;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<ShoulderSide> CODEC = MsmCodecs.named("sides", values(), ShoulderSide::serialName);
    }

    /**
     * {@code ShoulderRiding}: the pet perches on its owner's shoulder (the offset and cooldown are fixed). Since ADR 0109 D2
     * {@code sides} names the shoulder (default {@code either}: the free one, the right first, as B524 found the runtime's
     * pet sits on the player's right). A map codec, so {@code true} or a number is a type error rather than the component.
     */
    public record ShoulderRiding(ShoulderSide sides) {
        public static final List<String> KEYS = List.of("sides");

        public static final Codec<ShoulderRiding> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("sides", ShoulderSide.CODEC, ShoulderSide.EITHER).forGetter(ShoulderRiding::sides)).apply(i, ShoulderRiding::new)),
                KEYS);
    }
}
