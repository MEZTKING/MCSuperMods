package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import java.util.Optional;
import java.util.function.Consumer;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.properties.BlockSetType;

/**
 * Version seam (ADR 0038 D2, ADR 0067 D9, ADR 0105 D2): the {@link BlockSetType} of a door, trapdoor, button or pressure
 * plate ({@code set_type}). It picks the sounds, whether hands and wind charges open it, whether arrows press buttons and
 * which entities press plates. A vanilla name is vanilla's constant: {@code wood} is {@code OAK} (26.3 also has a constant
 * per wood, which 26.4 dropped); the other nine names are constants of the same name on both targets (checked with
 * {@code javap}, 2026-11-14).
 *
 * <p>An own set type ({@code set_type} as an object) is built for its block alone and never registered (B503, X11: it
 * works unregistered). It is also built for a vanilla {@code set_type} when the block has {@code block_sounds}, because
 * the vanilla door, trapdoor, button and plate classes take their block sounds from the set type. 26.3's constructor takes
 * a name and a {@link SoundType}; the name is the block id. The block classes take the set type in their constructor,
 * which the shared family code builds with {@link #of(BlockType.SetType)}; the registrar calls {@code OwnSounds} (which
 * calls {@link #begin}) just before it builds a block and {@code BlockExtras.apply} (which calls {@link #end}) right after,
 * so {@link #of} answers the block's own set type while that one block is built (one thread, at start-up).
 */
public final class BlockSetTypes {
    /** The own set type of the block being built, and the base it stands in for. */
    private static BlockSetType building;
    private static BlockType.SetType buildingBase;

    private BlockSetTypes() {}

    /** The set type for {@code setType}: the own one of the block being built when it has one, else vanilla's constant. */
    public static BlockSetType of(BlockType.SetType setType) {
        if (building != null && buildingBase == setType) {
            return building;
        }
        return vanilla(setType);
    }

    static BlockSetType vanilla(BlockType.SetType setType) {
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

    /**
     * Prepares the set type of the block {@code id} about to be built: an own one when {@code set_type} is an object or
     * {@code ownSounds} is given (the block's own {@code block_sounds}); nothing for other blocks.
     */
    static void begin(Identifier id, BlockDefinition definition, Optional<SoundType> ownSounds, Consumer<String> warn) {
        end();
        Optional<BlockType.SetTypeSetting> setting = setting(definition);
        if (setting.isEmpty()) {
            return;
        }
        Optional<BlockType.OwnSetType> own = setting.get().own();
        if (own.isEmpty() && ownSounds.isEmpty()) {
            return;
        }
        BlockType.SetType base = setting.get().base();
        BlockSetType v = vanilla(base);
        BlockType.SetTypeSounds s = own.map(BlockType.OwnSetType::sounds).orElse(BlockType.SetTypeSounds.NONE);
        boolean byHand = own.flatMap(BlockType.OwnSetType::canOpenByHandSetting).orElse(v.canOpenByHand());
        // can_open_by_wind_charge defaults to can_open_by_hand (the format), which vanilla's own sets also keep equal.
        boolean byWind = own.isPresent() ? own.get().canOpenByWindChargeSetting().orElse(byHand) : v.canOpenByWindCharge();
        boolean arrows = own.flatMap(BlockType.OwnSetType::arrowsPressSetting).orElse(v.canButtonBeActivatedByArrows());
        BlockSetType.PressurePlateSensitivity plate = own.flatMap(BlockType.OwnSetType::plateSensitivitySetting)
                .map(p -> p == BlockType.PlateSensitivity.MOBS ? BlockSetType.PressurePlateSensitivity.MOBS
                        : BlockSetType.PressurePlateSensitivity.EVERYTHING)
                .orElse(v.pressurePlateSensitivity());
        SoundEvent open = OwnSounds.event(id, "set_type: sounds: open", s.open(), null, warn);
        SoundEvent close = OwnSounds.event(id, "set_type: sounds: close", s.close(), null, warn);
        SoundEvent press = OwnSounds.event(id, "set_type: sounds: press", s.press(), null, warn);
        SoundEvent release = OwnSounds.event(id, "set_type: sounds: release", s.release(), null, warn);
        building = new BlockSetType(id.toString(), byHand, byWind, arrows, plate, ownSounds.orElse(v.soundType()),
                or(close, v.doorClose()), or(open, v.doorOpen()), or(close, v.trapdoorClose()), or(open, v.trapdoorOpen()),
                or(release, v.pressurePlateClickOff()), or(press, v.pressurePlateClickOn()), or(release, v.buttonClickOff()),
                or(press, v.buttonClickOn()));
        buildingBase = base;
    }

    /** Ends the block being built: {@link #of} answers vanilla's constants again. */
    static void end() {
        building = null;
        buildingBase = null;
    }

    private static SoundEvent or(SoundEvent own, SoundEvent vanilla) {
        return own != null ? own : vanilla;
    }

    private static Optional<BlockType.SetTypeSetting> setting(BlockDefinition definition) {
        return switch (definition.typeFields()) {
            case BlockType.Opening o -> Optional.of(o.setTypeSetting());
            case BlockType.Button b -> Optional.of(b.setTypeSetting());
            case BlockType.PressurePlate p -> Optional.of(p.setTypeSetting());
            default -> Optional.empty();
        };
    }
}
