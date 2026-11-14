package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.mojang.serialization.Codec;
import com.mojang.serialization.JsonOps;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Loot addition v1 ({@code ::msm::definition::LootAddition}, ADR 0060 D3): extra pools for built-in loot tables. The
 * pools stay JSON here (parsing is pure); the registrar decodes them with vanilla's {@code LootPool.CODEC} over the
 * registries of each loot table load. The top level is closed (an unknown key is an error).
 *
 * @param tables loot table ids, such as {@code minecraft:entities/zombie}
 * @param pools  vanilla loot pools in their JSON form, at least one
 */
public record LootAdditionDefinition(int format, List<Identifier> tables, List<JsonElement> pools) {
    public static final List<String> KEYS = List.of("format", "tables", "pools");

    /** Any JSON value, kept as a Gson element. */
    private static final Codec<JsonElement> JSON = Codec.PASSTHROUGH.xmap(d -> d.convert(JsonOps.INSTANCE).getValue(),
            j -> new com.mojang.serialization.Dynamic<>(JsonOps.INSTANCE, j));

    public static final Codec<LootAdditionDefinition> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
            required("format", intRange(1, 1)).forGetter(LootAdditionDefinition::format),
            required("tables", MsmCodecs.nonEmptyList(ID)).forGetter(LootAdditionDefinition::tables),
            required("pools", MsmCodecs.nonEmptyList(JSON)).forGetter(LootAdditionDefinition::pools))
            .apply(i, LootAdditionDefinition::new)), KEYS);
}
