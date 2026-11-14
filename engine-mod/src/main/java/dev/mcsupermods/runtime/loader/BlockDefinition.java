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
 * @param type the block type (ADR 0067 D1, ADR 0068 D1); {@link BlockType#BLOCK} when {@code type} is absent
 * @param typeFields the type's own top-level fields; {@link BlockType.None} for a type without any
 * @param item the block item; empty when the file says {@code "item": false}
 */
public record BlockDefinition(
        int format,
        BlockType type,
        BlockType.Fields typeFields,
        MsmSoundType soundType,
        Optional<Identifier> lootTable,
        Optional<ItemSettings> item,
        BlockComponents components,
        Events events) {

    /** Known top-level keys: the common ones, {@code type} and every type's own fields (closed per type in the Codec). */
    public static final List<String> KEYS = java.util.stream.Stream.concat(
            java.util.stream.Stream.of("format", "type", "sound_type", "loot_table", "item", "components", "events"),
            BlockType.ALL_FIELDS.stream()).toList();

    /**
     * The block item ({@code ::msm::definition::BlockItem}); closed, so an unknown key (such as the element-only
     * {@code fuel} or {@code compost}) is an error.
     *
     * @param id the block item's own id (ADR 0068 D2), such as seeds planting a crop; empty means the block's id
     * @param components the vanilla data components of {@code components."msm:components"} (ADR 0060 D4), as JSON
     */
    public record ItemSettings(Optional<Identifier> id, Optional<Identifier> creativeTab, int maxStackSize, MsmRarity rarity, Map<Identifier, JsonElement> components) {
        public static final ItemSettings DEFAULT = new ItemSettings(Optional.empty(), Optional.empty(), 64, MsmRarity.COMMON, Map.of());
        public static final List<String> KEYS = List.of("id", "creative_tab", "max_stack_size", "rarity", "components");

        /** {@code ::msm::definition::BlockItemComponents}: the passthrough only, closed. */
        private static final Codec<Map<Identifier, JsonElement>> COMPONENTS = closed(
                optional("msm:components", ItemComponents.VANILLA_CODEC, Map.<Identifier, JsonElement>of()).codec(), List.of("msm:components"));

        public static final Codec<ItemSettings> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("id", ID).forGetter(ItemSettings::id),
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
            BlockType.SPEC_CODEC.forGetter(BlockDefinition::spec),
            optional("sound_type", MsmSoundType.CODEC, MsmSoundType.STONE).forGetter(BlockDefinition::soundType),
            optional("loot_table", ID).forGetter(BlockDefinition::lootTable),
            optional("item", ITEM, Optional.of(ItemSettings.DEFAULT)).forGetter(BlockDefinition::item),
            optional("components", BlockComponents.CODEC, BlockComponents.NONE).forGetter(BlockDefinition::components),
            optional("events", Events.CODEC, Events.NONE).forGetter(BlockDefinition::events))
            .apply(i, (format, spec, soundType, lootTable, item, components, events) ->
                    new BlockDefinition(format, spec.type(), spec.fields(), soundType, lootTable, item, components, events)));

    /** The type with its fields. */
    public BlockType.Spec spec() {
        return new BlockType.Spec(type, typeFields);
    }

    /** This definition with other events. */
    public BlockDefinition withEvents(Events other) {
        return new BlockDefinition(format, type, typeFields, soundType, lootTable, item, components, other);
    }

    /** This definition with other components. */
    public BlockDefinition withComponents(BlockComponents other) {
        return new BlockDefinition(format, type, typeFields, soundType, lootTable, item, other, events);
    }
}
