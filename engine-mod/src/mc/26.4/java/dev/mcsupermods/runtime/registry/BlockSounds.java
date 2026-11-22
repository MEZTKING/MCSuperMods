package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.DefinitionException;
import dev.mcsupermods.runtime.loader.MsmSoundType;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.sounds.BlockSoundSet;
import net.minecraft.world.level.block.sounds.BlockSoundSets;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Version seam (ADR 0038 D2): gives block properties the sound of a {@code sound_type}.
 * 26.4: block sounds are the data-driven {@code block_sound_set} registry ({@code SoundType} is gone); the name is the
 * path of a vanilla {@link BlockSoundSets} key (every public static key there: 137 on 26.4-snapshot-7, as
 * {@code BlockFacts.soundTypes} lists them), except the format's {@code amethyst}, whose set is {@code amethyst_block}
 * (B151). Reading those fields' values is calling vanilla, not reading its code. A name with no such key is a load error
 * that skips the block.
 */
final class BlockSounds {
    private BlockSounds() {}

    /** The format's names whose vanilla set is named otherwise on 26.4. */
    private static final Map<String, String> ALIASES = Map.of("amethyst", "amethyst_block");

    /** Every vanilla sound set key by its path. */
    static final Map<String, ResourceKey<BlockSoundSet>> BY_NAME = byName();

    @SuppressWarnings("unchecked")
    private static Map<String, ResourceKey<BlockSoundSet>> byName() {
        Map<String, ResourceKey<BlockSoundSet>> out = new TreeMap<>();
        for (Field field : BlockSoundSets.class.getFields()) {
            int mods = field.getModifiers();
            if (!Modifier.isStatic(mods) || !Modifier.isFinal(mods) || field.getType() != ResourceKey.class) {
                continue;
            }
            try {
                ResourceKey<?> key = (ResourceKey<?>) field.get(null);
                if (key.isFor(Registries.BLOCK_SOUND_SET)) {
                    out.put(key.identifier().getPath(), (ResourceKey<BlockSoundSet>) key);
                }
            } catch (IllegalAccessException e) {
                throw new IllegalStateException("BlockSoundSets." + field.getName() + " is not readable", e);
            }
        }
        return Collections.unmodifiableMap(out);
    }

    static BlockBehaviour.Properties apply(BlockBehaviour.Properties properties, MsmSoundType type) throws DefinitionException {
        ResourceKey<BlockSoundSet> set = find(type).orElseThrow(() -> new DefinitionException("sound_type \"" + type.serialName()
                + "\" is not a sound type of this Minecraft version (26.4); the block is skipped"));
        return properties.sound(set);
    }

    /** The vanilla sound set key of {@code type}, empty for a name 26.4 lacks. */
    static Optional<ResourceKey<BlockSoundSet>> find(MsmSoundType type) {
        String name = type.serialName();
        return Optional.ofNullable(BY_NAME.get(ALIASES.getOrDefault(name, name)));
    }
}
