package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.Events;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/** Item definition v1 ({@code ::msm::definition::Item}, ADR 0025 D3). */
public record ItemDefinition(
        int format,
        int maxStackSize,
        MsmRarity rarity,
        Optional<Identifier> creativeTab,
        ItemComponents components,
        Events events) {

    public static final List<String> KEYS = List.of("format", "max_stack_size", "rarity", "creative_tab", "components", "events");

    public static final Codec<ItemDefinition> CODEC = RecordCodecBuilder.create(i -> i.group(
            required("format", intRange(1, 1)).forGetter(ItemDefinition::format),
            optional("max_stack_size", intRange(1, 99), 64).forGetter(ItemDefinition::maxStackSize),
            optional("rarity", MsmRarity.CODEC, MsmRarity.COMMON).forGetter(ItemDefinition::rarity),
            optional("creative_tab", ID).forGetter(ItemDefinition::creativeTab),
            optional("components", ItemComponents.CODEC, ItemComponents.NONE).forGetter(ItemDefinition::components),
            optional("events", Events.CODEC, Events.NONE).forGetter(ItemDefinition::events)).apply(i, ItemDefinition::new));

    /** This definition with other events. */
    public ItemDefinition withEvents(Events other) {
        return new ItemDefinition(format, maxStackSize, rarity, creativeTab, components, other);
    }
}
