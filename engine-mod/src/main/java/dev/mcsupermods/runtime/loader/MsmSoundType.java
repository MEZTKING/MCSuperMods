package dev.mcsupermods.runtime.loader;

import com.mojang.serialization.Codec;
import java.util.Locale;

/**
 * Block sound types ({@code ::msm::definition::SoundType}). Each constant names a vanilla
 * {@code SoundType} field of the same name in upper case (all 40 checked against the 26.3 jar);
 * the registrar maps them, so parsing needs no game bootstrap.
 */
public enum MsmSoundType {
    STONE, WOOD, GRAVEL, GRASS, METAL, GLASS, WOOL, SAND, SNOW, LADDER, ANVIL, SLIME_BLOCK, HONEY_BLOCK,
    CORAL_BLOCK, BAMBOO, BAMBOO_WOOD, CHERRY_WOOD, NETHER_WOOD, NETHERRACK, NETHER_BRICKS, NETHER_ORE, BASALT,
    BONE_BLOCK, SOUL_SAND, SOUL_SOIL, AMETHYST, AMETHYST_CLUSTER, CALCITE, TUFF, DEEPSLATE, DEEPSLATE_BRICKS,
    DEEPSLATE_TILES, POLISHED_DEEPSLATE, COPPER, MUD, MUD_BRICKS, PACKED_MUD, MOSS, LANTERN, SCULK;

    public String serialName() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static final Codec<MsmSoundType> CODEC = MsmCodecs.named("sound_type", values(), MsmSoundType::serialName);
}
