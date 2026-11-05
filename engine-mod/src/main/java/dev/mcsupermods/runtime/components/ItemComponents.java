package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/** Runtime item components ({@code ::msm::definition::ItemComponents}). */
public record ItemComponents(
        Optional<Food> food,
        Optional<Tool> tool,
        Optional<Durability> durability,
        Optional<OnUse> onUse) {

    public static final List<String> KEYS = List.of("msm:food", "msm:tool", "msm:durability", "msm:on_use");
    public static final ItemComponents NONE = new ItemComponents(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty());

    public static final Codec<ItemComponents> CODEC = RecordCodecBuilder.create(i -> i.group(
            optional("msm:food", Food.CODEC).forGetter(ItemComponents::food),
            optional("msm:tool", Tool.CODEC).forGetter(ItemComponents::tool),
            optional("msm:durability", Durability.CODEC).forGetter(ItemComponents::durability),
            optional("msm:on_use", OnUse.CODEC).forGetter(ItemComponents::onUse)).apply(i, ItemComponents::new));

    /** Every event id a component names, with the component for messages. */
    public Stream<String[]> eventReferences() {
        return onUse.stream().map(c -> new String[] {"msm:on_use", c.event().toString()});
    }

    /** Whether the item is damageable, which forces a stack size of 1. */
    public boolean damageable() {
        return tool.isPresent() || durability.isPresent();
    }

    /** Makes the item edible; {@code saturation} is the vanilla saturation modifier. */
    public record Food(int nutrition, float saturation, boolean canAlwaysEat) {
        public static final Codec<Food> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("nutrition", intAtLeast(0)).forGetter(Food::nutrition),
                required("saturation", floatAtLeast(0)).forGetter(Food::saturation),
                optional("can_always_eat", Codec.BOOL, false).forGetter(Food::canAlwaysEat)).apply(i, Food::new));
    }

    /** Tool kinds. */
    public enum ToolType {
        PICKAXE, AXE, SHOVEL, HOE, SWORD;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<ToolType> CODEC = MsmCodecs.named("tool type", values(), ToolType::serialName);
    }

    /** Tool tiers; each maps onto a vanilla {@code ToolMaterial} constant of the same name. */
    public enum ToolTier {
        WOOD, STONE, COPPER, IRON, DIAMOND, GOLD, NETHERITE;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<ToolTier> CODEC = MsmCodecs.named("tool tier", values(), ToolTier::serialName);
    }

    /** Makes the item a tool of a kind and tier. */
    public record Tool(ToolType type, ToolTier tier) {
        public static final Codec<Tool> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("type", ToolType.CODEC).forGetter(Tool::type),
                required("tier", ToolTier.CODEC).forGetter(Tool::tier)).apply(i, Tool::new));
    }

    /** Uses before the item breaks. */
    public record Durability(int max) {
        public static final Codec<Durability> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("max", intAtLeast(1)).forGetter(Durability::max)).apply(i, Durability::new));
    }

    /** Fires an event when a player uses the item, then puts it on cooldown. */
    public record OnUse(Identifier event, int cooldownTicks) {
        public static final Codec<OnUse> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnUse::event),
                optional("cooldown_ticks", intAtLeast(0), 0).forGetter(OnUse::cooldownTicks)).apply(i, OnUse::new));
    }
}
