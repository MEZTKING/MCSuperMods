package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.mojang.datafixers.util.Either;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.Events;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Block definition v1 ({@code ::msm::definition::Block}, ADR 0025 D2).
 *
 * @param item the block item; empty when the file says {@code "item": false}
 */
public record BlockDefinition(
        int format,
        MsmSoundType soundType,
        Optional<Identifier> lootTable,
        Optional<ItemSettings> item,
        BlockComponents components,
        Events events) {

    public static final List<String> KEYS = List.of("format", "sound_type", "loot_table", "item", "components", "events");

    /**
     * The block item ({@code ::msm::definition::BlockItem}); closed, so an unknown key (such as the element-only
     * {@code fuel} or {@code compost}) is an error.
     *
     * @param components the vanilla data components of {@code components."msm:components"} (ADR 0060 D4), as JSON
     */
    public record ItemSettings(Optional<Identifier> creativeTab, int maxStackSize, MsmRarity rarity, Map<Identifier, JsonElement> components) {
        public static final ItemSettings DEFAULT = new ItemSettings(Optional.empty(), 64, MsmRarity.COMMON, Map.of());
        public static final List<String> KEYS = List.of("creative_tab", "max_stack_size", "rarity", "components");

        /** {@code ::msm::definition::BlockItemComponents}: the passthrough only, closed. */
        private static final Codec<Map<Identifier, JsonElement>> COMPONENTS = closed(
                optional("msm:components", ItemComponents.VANILLA_CODEC, Map.<Identifier, JsonElement>of()).codec(), List.of("msm:components"));

        public static final Codec<ItemSettings> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("creative_tab", ID).forGetter(ItemSettings::creativeTab),
                optional("max_stack_size", intRange(1, 99), 64).forGetter(ItemSettings::maxStackSize),
                optional("rarity", MsmRarity.CODEC, MsmRarity.COMMON).forGetter(ItemSettings::rarity),
                optional("components", COMPONENTS, Map.of()).forGetter(ItemSettings::components)).apply(i, ItemSettings::new)), KEYS);
    }

    /** {@code BlockItem | false}: {@code false} is no block item; {@code true} is an error. */
    private static final Codec<Optional<ItemSettings>> ITEM = Codec.either(Codec.BOOL, ItemSettings.CODEC).comapFlatMap(
            either -> either.map(
                    b -> b ? DataResult.error(() -> "must be an object or false") : DataResult.success(Optional.<ItemSettings>empty()),
                    s -> DataResult.success(Optional.of(s))),
            opt -> opt.<Either<Boolean, ItemSettings>>map(Either::right).orElse(Either.left(false)));

    public static final Codec<BlockDefinition> CODEC = RecordCodecBuilder.create(i -> i.group(
            required("format", intRange(1, 1)).forGetter(BlockDefinition::format),
            optional("sound_type", MsmSoundType.CODEC, MsmSoundType.STONE).forGetter(BlockDefinition::soundType),
            optional("loot_table", ID).forGetter(BlockDefinition::lootTable),
            optional("item", ITEM, Optional.of(ItemSettings.DEFAULT)).forGetter(BlockDefinition::item),
            optional("components", BlockComponents.CODEC, BlockComponents.NONE).forGetter(BlockDefinition::components),
            optional("events", Events.CODEC, Events.NONE).forGetter(BlockDefinition::events)).apply(i, BlockDefinition::new));

    /** This definition with other events. */
    public BlockDefinition withEvents(Events other) {
        return new BlockDefinition(format, soundType, lootTable, item, components, other);
    }
}
