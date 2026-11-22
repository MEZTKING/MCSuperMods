package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.DefinitionException;
import dev.mcsupermods.runtime.loader.MsmSoundType;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Version seam (ADR 0038 D2): gives block properties the sound of a {@code sound_type}.
 * 26.3: the name is the vanilla {@link SoundType} constant of the same name in lower case; every public static
 * {@code SoundType} field counts (131 on 26.3, the silent {@code empty} included, as {@code BlockFacts.soundTypes} lists
 * them). Reading those fields' values is calling vanilla, not reading its code. A name with no such constant is a load
 * error that skips the block.
 */
final class BlockSounds {
    private BlockSounds() {}

    /** Every vanilla sound type by its lower-case name. */
    static final Map<String, SoundType> BY_NAME = byName();

    private static Map<String, SoundType> byName() {
        Map<String, SoundType> out = new TreeMap<>();
        for (Field field : SoundType.class.getFields()) {
            int mods = field.getModifiers();
            if (Modifier.isStatic(mods) && Modifier.isFinal(mods) && field.getType() == SoundType.class) {
                try {
                    out.put(field.getName().toLowerCase(Locale.ROOT), (SoundType) field.get(null));
                } catch (IllegalAccessException e) {
                    throw new IllegalStateException("SoundType." + field.getName() + " is not readable", e);
                }
            }
        }
        return Collections.unmodifiableMap(out);
    }

    static BlockBehaviour.Properties apply(BlockBehaviour.Properties properties, MsmSoundType type) throws DefinitionException {
        SoundType sound = find(type).orElseThrow(() -> new DefinitionException("sound_type \"" + type.serialName()
                + "\" is not a sound type of this Minecraft version (26.3); the block is skipped"));
        return properties.sound(sound);
    }

    /** The vanilla sound type of {@code type}, empty for a name 26.3 lacks. */
    static Optional<SoundType> find(MsmSoundType type) {
        return Optional.ofNullable(BY_NAME.get(type.serialName()));
    }

    /** The vanilla sound type of {@code type}, which {@link #apply} has already accepted. */
    static SoundType soundType(MsmSoundType type) {
        return find(type).orElseThrow(() -> new IllegalArgumentException("unknown sound_type " + type.serialName()));
    }
}
