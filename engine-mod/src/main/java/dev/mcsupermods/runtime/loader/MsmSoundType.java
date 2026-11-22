package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * A block's sound type ({@code sound_type}, {@code ::msm::definition::SoundType}): any vanilla sound type name of the
 * Minecraft version, in lower case ({@code BlockFacts.soundTypes} in the app: 131 on 26.3, 137 on 26.4). Parsing takes
 * any name, so it needs no game bootstrap; the registrar resolves it through the version seam {@code registry/BlockSounds}
 * (26.3: the vanilla {@code SoundType} constant of that name; 26.4: the {@code block_sound_set} key, {@code amethyst}
 * being {@code amethyst_block}), and a name the version lacks is a load error that skips the block.
 *
 * @param serialName the name as written
 */
public record MsmSoundType(String serialName) {
    /** The default of most blocks. */
    public static final MsmSoundType STONE = new MsmSoundType("stone");
    /** The default of portal blocks (ADR 0077 D1). */
    public static final MsmSoundType GLASS = new MsmSoundType("glass");
    public static final MsmSoundType WOOD = new MsmSoundType("wood");

    public MsmSoundType {
        Objects.requireNonNull(serialName, "serialName");
    }

    public static final Codec<MsmSoundType> CODEC = Codec.STRING.xmap(MsmSoundType::new, MsmSoundType::serialName);

    /**
     * A block's own sounds ({@code block_sounds}, {@code ::msm::definition::BlockSounds}, ADR 0105 D1; closed): each sound
     * event given replaces that event of the block's {@code sound_type}, which gives the rest. On 26.3 the runtime builds a
     * {@code SoundType} from them; on 26.4 the lowering writes a {@code block_sound_set} entry under the block's id and the
     * block names it (B503, X10).
     *
     * @param breakSound {@code break}
     * @param volume volume, 0 to 10; empty: the sound type's
     * @param pitch pitch, 0.25 to 4; empty: the sound type's
     */
    public record Sounds(Optional<Identifier> breakSound, Optional<Identifier> step, Optional<Identifier> place, Optional<Identifier> hit,
            Optional<Identifier> fall, Optional<Float> volume, Optional<Float> pitch) {
        public static final List<String> KEYS = List.of("break", "step", "place", "hit", "fall", "volume", "pitch");

        public static final Codec<Sounds> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("break", ID).forGetter(Sounds::breakSound),
                optional("step", ID).forGetter(Sounds::step),
                optional("place", ID).forGetter(Sounds::place),
                optional("hit", ID).forGetter(Sounds::hit),
                optional("fall", ID).forGetter(Sounds::fall),
                optional("volume", floatRange(0, 10)).forGetter(Sounds::volume),
                optional("pitch", floatRange(0.25f, 4)).forGetter(Sounds::pitch)).apply(i, Sounds::new)), KEYS);
    }
}
