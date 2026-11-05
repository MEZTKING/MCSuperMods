package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.MsmSoundType;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.sounds.BlockSoundSet;
import net.minecraft.world.level.block.sounds.BlockSoundSets;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Version seam (ADR 0038 D2): gives block properties the sound of an mcdoc {@code sound_type}.
 * 26.4: block sounds are the data-driven {@code block_sound_set} registry ({@code SoundType} is gone);
 * each MSM sound type maps onto the {@link BlockSoundSets} key of the same name, except {@code amethyst},
 * whose set is {@code amethyst_block} (B151).
 */
final class BlockSounds {
    private BlockSounds() {}

    static BlockBehaviour.Properties apply(BlockBehaviour.Properties properties, MsmSoundType type) {
        return properties.sound(soundSet(type));
    }

    private static ResourceKey<BlockSoundSet> soundSet(MsmSoundType type) {
        return switch (type) {
            case STONE -> BlockSoundSets.STONE;
            case WOOD -> BlockSoundSets.WOOD;
            case GRAVEL -> BlockSoundSets.GRAVEL;
            case GRASS -> BlockSoundSets.GRASS;
            case METAL -> BlockSoundSets.METAL;
            case GLASS -> BlockSoundSets.GLASS;
            case WOOL -> BlockSoundSets.WOOL;
            case SAND -> BlockSoundSets.SAND;
            case SNOW -> BlockSoundSets.SNOW;
            case LADDER -> BlockSoundSets.LADDER;
            case ANVIL -> BlockSoundSets.ANVIL;
            case SLIME_BLOCK -> BlockSoundSets.SLIME_BLOCK;
            case HONEY_BLOCK -> BlockSoundSets.HONEY_BLOCK;
            case CORAL_BLOCK -> BlockSoundSets.CORAL_BLOCK;
            case BAMBOO -> BlockSoundSets.BAMBOO;
            case BAMBOO_WOOD -> BlockSoundSets.BAMBOO_WOOD;
            case CHERRY_WOOD -> BlockSoundSets.CHERRY_WOOD;
            case NETHER_WOOD -> BlockSoundSets.NETHER_WOOD;
            case NETHERRACK -> BlockSoundSets.NETHERRACK;
            case NETHER_BRICKS -> BlockSoundSets.NETHER_BRICKS;
            case NETHER_ORE -> BlockSoundSets.NETHER_ORE;
            case BASALT -> BlockSoundSets.BASALT;
            case BONE_BLOCK -> BlockSoundSets.BONE_BLOCK;
            case SOUL_SAND -> BlockSoundSets.SOUL_SAND;
            case SOUL_SOIL -> BlockSoundSets.SOUL_SOIL;
            case AMETHYST -> BlockSoundSets.AMETHYST_BLOCK;
            case AMETHYST_CLUSTER -> BlockSoundSets.AMETHYST_CLUSTER;
            case CALCITE -> BlockSoundSets.CALCITE;
            case TUFF -> BlockSoundSets.TUFF;
            case DEEPSLATE -> BlockSoundSets.DEEPSLATE;
            case DEEPSLATE_BRICKS -> BlockSoundSets.DEEPSLATE_BRICKS;
            case DEEPSLATE_TILES -> BlockSoundSets.DEEPSLATE_TILES;
            case POLISHED_DEEPSLATE -> BlockSoundSets.POLISHED_DEEPSLATE;
            case COPPER -> BlockSoundSets.COPPER;
            case MUD -> BlockSoundSets.MUD;
            case MUD_BRICKS -> BlockSoundSets.MUD_BRICKS;
            case PACKED_MUD -> BlockSoundSets.PACKED_MUD;
            case MOSS -> BlockSoundSets.MOSS;
            case LANTERN -> BlockSoundSets.LANTERN;
            case SCULK -> BlockSoundSets.SCULK;
        };
    }
}
