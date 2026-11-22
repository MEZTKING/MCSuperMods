package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.level.block.sounds.BlockSoundSet;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Version seam (ADR 0105 D1, D2 and its amendment after B503): a block's own sound events ({@code block_sounds}) and,
 * through {@link BlockSetTypes#begin}, its own set type. 26.4: block sounds are the synchronised world registry
 * {@code block_sound_set}; a block with {@code block_sounds} names the entry under its own id, which the lowering writes as
 * {@code data/<ns>/block_sound_set/<path>.json} (X10: a block built at start-up can name an entry that loads with the
 * world). The entry is fixed per world load, so a change needs the world opened again. A missing entry makes the block
 * silent in the game, so each world start checks every such block and logs a warning ({@link #missingSoundSets}). The
 * sound events themselves are in the data entry; the runtime reads only the set type's sounds.
 */
public final class OwnSounds {
    private static final List<String> WARNINGS = new ArrayList<>();
    private static final List<Identifier> OWN = new ArrayList<>();
    private static volatile List<String> missing = List.of();
    private static boolean listening;

    private OwnSounds() {}

    /** The properties naming the block's own sound set; the block's set type is prepared for {@link BlockSetTypes#of}. */
    static BlockBehaviour.Properties soundTypeFor(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        if (definition.blockSounds().isEmpty()) {
            BlockSetTypes.begin(id, definition, Optional.empty(), OwnSounds::warn);
            return props;
        }
        ResourceKey<BlockSoundSet> key = ResourceKey.create(Registries.BLOCK_SOUND_SET, id);
        OWN.add(id);
        var s = definition.blockSounds().get();
        // The entry carries the events; an unknown one is silent in the game, so it warns here as on 26.3.
        event(id, "block_sounds: break", s.breakSound(), null, OwnSounds::warn);
        event(id, "block_sounds: step", s.step(), null, OwnSounds::warn);
        event(id, "block_sounds: place", s.place(), null, OwnSounds::warn);
        event(id, "block_sounds: hit", s.hit(), null, OwnSounds::warn);
        event(id, "block_sounds: fall", s.fall(), null, OwnSounds::warn);
        if (!listening) {
            listening = true;
            ServerLifecycleEvents.SERVER_STARTED.register(OwnSounds::check);
        }
        BlockSetTypes.begin(id, definition, Optional.of(key), OwnSounds::warn);
        return props.sound(key);
    }

    /** Logs a warning for each block whose {@code block_sound_set} entry this world's data lacks. */
    private static void check(MinecraftServer server) {
        Registry<BlockSoundSet> sets = server.registryAccess().lookupOrThrow(Registries.BLOCK_SOUND_SET);
        List<String> out = new ArrayList<>();
        for (Identifier id : OWN) {
            if (!sets.containsKey(id)) {
                out.add("block " + id + ": block_sounds: this world has no block_sound_set entry " + id + " (data/" + id.getNamespace()
                        + "/block_sound_set/" + id.getPath() + ".json), so the block makes no sound");
            }
        }
        out.forEach(w -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, w));
        missing = List.copyOf(out);
    }

    /** The registered sound event {@code sound}, else {@code fallback} (with a warning when {@code sound} was given). */
    static SoundEvent event(Identifier block, String field, Optional<Identifier> sound, SoundEvent fallback, Consumer<String> warn) {
        if (sound.isEmpty()) {
            return fallback;
        }
        Optional<SoundEvent> found = BuiltInRegistries.SOUND_EVENT.getOptional(sound.get());
        if (found.isEmpty()) {
            warn.accept("block " + block + ": " + field + ": unknown sound event " + sound.get() + " (not a vanilla sound event and not one of the project's sounds); "
                    + (field.startsWith("block_sounds") ? "the game plays nothing for it" : "the base set type's is used"));
        }
        return found.orElse(fallback);
    }

    private static void warn(String message) {
        WARNINGS.add(message);
        MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
    }

    /** The start-up warnings so far; {@code VanillaPairs.register} adds them to the load report. */
    static List<String> warnings() {
        return List.copyOf(WARNINGS);
    }

    /** Whether own sounds are world data ({@code block_sound_set}, fixed per world load): true on 26.4. */
    public static boolean dataDriven() {
        return true;
    }

    /** The warnings of the last world start: blocks whose {@code block_sound_set} entry the world lacks. */
    public static List<String> missingSoundSets() {
        return missing;
    }
}
