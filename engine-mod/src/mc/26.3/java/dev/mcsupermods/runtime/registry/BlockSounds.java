package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.MsmSoundType;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Version seam (ADR 0038 D2): gives block properties the sound of an mcdoc {@code sound_type}.
 * 26.3: each MSM sound type maps onto the vanilla {@link SoundType} constant of the same name.
 */
final class BlockSounds {
    private BlockSounds() {}

    static BlockBehaviour.Properties apply(BlockBehaviour.Properties properties, MsmSoundType type) {
        return properties.sound(soundType(type));
    }

    private static SoundType soundType(MsmSoundType type) {
        return switch (type) {
            case STONE -> SoundType.STONE;
            case WOOD -> SoundType.WOOD;
            case GRAVEL -> SoundType.GRAVEL;
            case GRASS -> SoundType.GRASS;
            case METAL -> SoundType.METAL;
            case GLASS -> SoundType.GLASS;
            case WOOL -> SoundType.WOOL;
            case SAND -> SoundType.SAND;
            case SNOW -> SoundType.SNOW;
            case LADDER -> SoundType.LADDER;
            case ANVIL -> SoundType.ANVIL;
            case SLIME_BLOCK -> SoundType.SLIME_BLOCK;
            case HONEY_BLOCK -> SoundType.HONEY_BLOCK;
            case CORAL_BLOCK -> SoundType.CORAL_BLOCK;
            case BAMBOO -> SoundType.BAMBOO;
            case BAMBOO_WOOD -> SoundType.BAMBOO_WOOD;
            case CHERRY_WOOD -> SoundType.CHERRY_WOOD;
            case NETHER_WOOD -> SoundType.NETHER_WOOD;
            case NETHERRACK -> SoundType.NETHERRACK;
            case NETHER_BRICKS -> SoundType.NETHER_BRICKS;
            case NETHER_ORE -> SoundType.NETHER_ORE;
            case BASALT -> SoundType.BASALT;
            case BONE_BLOCK -> SoundType.BONE_BLOCK;
            case SOUL_SAND -> SoundType.SOUL_SAND;
            case SOUL_SOIL -> SoundType.SOUL_SOIL;
            case AMETHYST -> SoundType.AMETHYST;
            case AMETHYST_CLUSTER -> SoundType.AMETHYST_CLUSTER;
            case CALCITE -> SoundType.CALCITE;
            case TUFF -> SoundType.TUFF;
            case DEEPSLATE -> SoundType.DEEPSLATE;
            case DEEPSLATE_BRICKS -> SoundType.DEEPSLATE_BRICKS;
            case DEEPSLATE_TILES -> SoundType.DEEPSLATE_TILES;
            case POLISHED_DEEPSLATE -> SoundType.POLISHED_DEEPSLATE;
            case COPPER -> SoundType.COPPER;
            case MUD -> SoundType.MUD;
            case MUD_BRICKS -> SoundType.MUD_BRICKS;
            case PACKED_MUD -> SoundType.PACKED_MUD;
            case MOSS -> SoundType.MOSS;
            case LANTERN -> SoundType.LANTERN;
            case SCULK -> SoundType.SCULK;
        };
    }
}
