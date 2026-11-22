package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.MsmSoundType;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Version seam (ADR 0105 D1, D2 and its amendment after B503): a block's own sound events ({@code block_sounds}) and,
 * through {@link BlockSetTypes#of(Identifier, BlockDefinition)}, its own set type. 26.3: a {@link SoundType} built from the events, each event not
 * given (and the volume and pitch) taken from the block's {@code sound_type}. The events are sound events registered
 * before the blocks (vanilla's, or a project's from {@code sounds.json}); an unknown one warns and the sound type's is
 * used. Every block passes here once, just before it is built.
 */
public final class OwnSounds {
    private static final List<String> WARNINGS = new ArrayList<>();
    private static final Map<Identifier, Optional<SoundType>> BUILT = new HashMap<>();

    private OwnSounds() {}

    /** The properties with the block's own sounds applied. */
    static BlockBehaviour.Properties soundTypeFor(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        return ownSoundType(id, definition).map(props::sound).orElse(props);
    }

    /**
     * The block's own {@link SoundType} ({@code block_sounds}), empty without it. Built once per block id, so its warnings
     * are logged once and the properties and the set type ({@link BlockSetTypes#of(Identifier, BlockDefinition)}) share it.
     */
    static Optional<SoundType> ownSoundType(Identifier id, BlockDefinition definition) {
        return BUILT.computeIfAbsent(id,
                k -> definition.blockSounds().map(s -> build(id, BlockSounds.soundType(definition.soundType()), s)));
    }

    private static SoundType build(Identifier id, SoundType base, MsmSoundType.Sounds s) {
        return new SoundType(s.volume().orElse(base.getVolume()), s.pitch().orElse(base.getPitch()),
                event(id, "block_sounds: break", s.breakSound(), base.getBreakSound(), OwnSounds::warn),
                event(id, "block_sounds: step", s.step(), base.getStepSound(), OwnSounds::warn),
                event(id, "block_sounds: place", s.place(), base.getPlaceSound(), OwnSounds::warn),
                event(id, "block_sounds: hit", s.hit(), base.getHitSound(), OwnSounds::warn),
                event(id, "block_sounds: fall", s.fall(), base.getFallSound(), OwnSounds::warn));
    }

    /** The registered sound event {@code sound}, else {@code fallback} (with a warning when {@code sound} was given). */
    static SoundEvent event(Identifier block, String field, Optional<Identifier> sound, SoundEvent fallback, Consumer<String> warn) {
        if (sound.isEmpty()) {
            return fallback;
        }
        Optional<SoundEvent> found = BuiltInRegistries.SOUND_EVENT.getOptional(sound.get());
        if (found.isEmpty()) {
            warn.accept("block " + block + ": " + field + ": unknown sound event " + sound.get() + " (not a vanilla sound event and not one of the project's sounds); "
                    + (fallback == null ? "the base set type's" : "the sound type's") + " is used");
        }
        return found.orElse(fallback);
    }

    static void warn(String message) {
        WARNINGS.add(message);
        MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
    }

    /** The start-up warnings so far; {@code VanillaPairs.register} adds them to the load report. */
    static List<String> warnings() {
        return List.copyOf(WARNINGS);
    }

    /** Whether own sounds are world data ({@code block_sound_set}, fixed per world load): false on 26.3. */
    public static boolean dataDriven() {
        return false;
    }

    /** Blocks whose {@code block_sound_set} entry the running world lacks (26.4 only); always empty on 26.3. */
    public static List<String> missingSoundSets() {
        return List.of();
    }
}
