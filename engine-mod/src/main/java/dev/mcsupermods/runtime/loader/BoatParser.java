package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * The {@code msm:boat} item component (ADR 0110 D1 as amended after the spike, {@code ::msm::definition::Boat}). Closed: an
 * unknown key, a value of the wrong type or a component that is not an object is an error naming the field, and the
 * component is not applied. Pure: {@code ItemComponents} decodes it with {@link Boat#CODEC}; B536 registers the entity
 * types, the chest boat and vanilla's renderer from it.
 */
public final class BoatParser {
    private BoatParser() {}

    /**
     * {@code Boat}.
     *
     * @param chest       whether a chest boat comes with it (default false)
     * @param raft        whether it is a raft, drawn and sized as vanilla's bamboo raft (default false)
     * @param woodTexture the wood its pictures are named after; empty means {@link #wood(Identifier)}
     */
    public record Boat(boolean chest, boolean raft, Optional<Identifier> woodTexture) {
        public static final List<String> KEYS = List.of("chest", "raft", "wood_texture");

        public static final Codec<Boat> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("chest", Codec.BOOL, false).forGetter(Boat::chest),
                optional("raft", Codec.BOOL, false).forGetter(Boat::raft),
                optional("wood_texture", ID).forGetter(Boat::woodTexture)).apply(i, Boat::new)), KEYS);

        /** The wood the pictures are named after: {@code wood_texture}, or {@link #wood(Identifier)} of the item. */
        public Identifier woodOf(Identifier item) {
            return woodTexture.orElseGet(() -> wood(item));
        }

        /**
         * The chest boat's item and entity type id: {@code <ns>:<wood>_chest_boat}, or {@code <wood>_chest_raft} for a raft,
         * where {@code <wood>} is the item's path without its {@code _boat} or {@code _raft} ending ({@code <path>_chest_boat}
         * when it has neither).
         */
        public Identifier chestBoatId(Identifier item) {
            return Identifier.fromNamespaceAndPath(item.getNamespace(), stripEnding(item.getPath()) + (raft ? "_chest_raft" : "_chest_boat"));
        }
    }

    /** The wood an item's boat pictures default to: its id without a {@code _boat} or {@code _raft} ending. */
    public static Identifier wood(Identifier item) {
        return Identifier.fromNamespaceAndPath(item.getNamespace(), stripEnding(item.getPath()));
    }

    private static String stripEnding(String path) {
        for (String ending : List.of("_boat", "_raft")) {
            if (path.endsWith(ending) && path.length() > ending.length()) {
                return path.substring(0, path.length() - ending.length());
            }
        }
        return path;
    }
}
