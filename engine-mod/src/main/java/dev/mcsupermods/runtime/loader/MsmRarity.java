package dev.mcsupermods.runtime.loader;

import com.mojang.serialization.Codec;
import java.util.Locale;

/** Item rarity ({@code ::msm::definition::Rarity}); maps onto the vanilla {@code Rarity} of the same name. */
public enum MsmRarity {
    COMMON, UNCOMMON, RARE, EPIC;

    public String serialName() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static final Codec<MsmRarity> CODEC = MsmCodecs.named("rarity", values(), MsmRarity::serialName);
}
