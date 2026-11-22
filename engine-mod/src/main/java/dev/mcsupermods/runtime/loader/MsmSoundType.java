package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import net.minecraft.resources.Identifier;

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
