package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.BlockType;
import net.minecraft.world.level.block.state.properties.BlockSetType;

/**
 * Version seam (ADR 0038 D2, ADR 0067 D9): the vanilla {@link BlockSetType} of an MSM set type name ({@code set_type}
 * of doors, trapdoors, buttons and pressure plates). It picks the sounds, whether hands open it, whether arrows press
 * buttons and which entities press plates. We never construct a {@code BlockSetType} (ADR 0067 D11).
 * 26.3: {@code wood} is {@code OAK} (26.3 also has a constant per wood, {@code SPRUCE} to {@code MANGROVE}, which 26.4 dropped).
 * The other nine names are constants of the same name on both targets (checked with {@code javap}, 2026-11-14).
 */
public final class BlockSetTypes {
    private BlockSetTypes() {}

    public static BlockSetType of(BlockType.SetType setType) {
        return switch (setType) {
            case WOOD -> BlockSetType.OAK;
            case CHERRY -> BlockSetType.CHERRY;
            case BAMBOO -> BlockSetType.BAMBOO;
            case CRIMSON -> BlockSetType.CRIMSON;
            case WARPED -> BlockSetType.WARPED;
            case IRON -> BlockSetType.IRON;
            case COPPER -> BlockSetType.COPPER;
            case GOLD -> BlockSetType.GOLD;
            case STONE -> BlockSetType.STONE;
            case POLISHED_BLACKSTONE -> BlockSetType.POLISHED_BLACKSTONE;
        };
    }
}
